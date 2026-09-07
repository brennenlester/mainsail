#!/usr/bin/env python3
"""Chroma-key Imagine PNGs into public/assets for Phaser."""
from pathlib import Path
from PIL import Image

SRC = Path.home() / ".cursor/projects/Users-brennen-dev-poke/assets"
DST = Path(__file__).resolve().parents[1] / "public" / "assets"
KEYS = [(200, 200, 200), (255, 255, 255), (240, 240, 240), (232, 232, 232), (210, 210, 210)]


def near_key(px, tol=38):
    r, g, b, a = px
    if a < 8:
        return True
    for kr, kg, kb in KEYS:
        if abs(r - kr) <= tol and abs(g - kg) <= tol and abs(b - kb) <= tol:
            if max(r, g, b) - min(r, g, b) <= 18:
                return True
    return False


def near_black(px, tol=28):
    r, g, b, a = px
    if a < 8:
        return True
    return r <= tol and g <= tol and b <= tol


def punch_dark_studio_bg(im: Image.Image, tol: int = 28) -> Image.Image:
    """Flood-fill near-black from image edges so dark outlines stay intact."""
    src = im.convert("RGBA")
    w, h = src.size
    px = src.load()
    visited = [[False] * w for _ in range(h)]
    stack: list[tuple[int, int]] = []
    for x, y in (
        (0, 0),
        (w - 1, 0),
        (0, h - 1),
        (w - 1, h - 1),
        (w // 2, 0),
        (w // 2, h - 1),
        (0, h // 2),
        (w - 1, h // 2),
    ):
        if near_black(px[x, y], tol):
            stack.append((x, y))

    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or visited[y][x]:
            continue
        visited[y][x] = True
        if not near_black(px[x, y], tol):
            continue
        px[x, y] = (0, 0, 0, 0)
        stack.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
    return src


def is_soft_rim(px, alpha_cut: int = 160) -> bool:
    """Semi-transparent fringe only — never punch solid peat/ember body color."""
    _r, _g, _b, a = px
    return a < alpha_cut


def punch_soft_rim(im: Image.Image) -> Image.Image:
    """After dark cutout, erase edge-connected semi-transparent fringe."""
    src = im.convert("RGBA")
    w, h = src.size
    px = src.load()
    stack: list[tuple[int, int]] = []
    visited = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if px[x, y][3] < 8:
                stack.append((x, y))
                visited[y][x] = True

    while stack:
        x, y = stack.pop()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= w or ny >= h or visited[ny][nx]:
                continue
            visited[ny][nx] = True
            if not is_soft_rim(px[nx, ny]):
                continue
            px[nx, ny] = (0, 0, 0, 0)
            stack.append((nx, ny))
    return src


SCALE = 4


def harden_edge_alpha(im: Image.Image, alpha_cut: int = 160) -> None:
    """Zero soft pixels that touch transparency (post-downscale fringe only)."""
    px = im.load()
    w, h = im.size
    doomed: list[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8 or a >= alpha_cut:
                continue
            edge = False
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if nx < 0 or ny < 0 or nx >= w or ny >= h or px[nx, ny][3] < 8:
                    edge = True
                    break
            if edge:
                doomed.append((x, y))
    for x, y in doomed:
        px[x, y] = (0, 0, 0, 0)


def process(src_name, dest_rel, max_w, max_h, pad=4, dark_studio_bg=False):
    im = Image.open(SRC / src_name).convert("RGBA")
    if dark_studio_bg:
        im = punch_dark_studio_bg(im)
        im = punch_soft_rim(im)
    else:
        # Light chroma only for Imagine sheets; black-studio art keeps pale
        # highlights/smoke that would match KEYS (eye glints, bog wisps).
        pixels = im.load()
        w, h = im.size
        for y in range(h):
            for x in range(w):
                if near_key(pixels[x, y]):
                    pixels[x, y] = (0, 0, 0, 0)
    bbox = im.getbbox()
    if not bbox:
        print("EMPTY", src_name)
        return
    im = im.crop(bbox)
    padded = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    padded.paste(im, (pad, pad))
    padded.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
    if dark_studio_bg:
        harden_edge_alpha(padded)
    canvas = Image.new("RGBA", (max_w, max_h), (0, 0, 0, 0))
    ox = (max_w - padded.width) // 2
    oy = max_h - padded.height
    canvas.paste(padded, (ox, oy), padded)
    out = DST / dest_rel
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, optimize=True)
    print(f"ok {dest_rel}")


def opposite_stride_keep_staff(src: Image.Image, split_ratio: float = 0.56, blend: int = 10) -> Image.Image:
    """Opposite contact via lower-body hflip; keep staff on the original side.

    Full-body hflip teleports the south staff between hands each stride. Flip
    only the legs, strip the mirrored staff stub, and restore the original stick.
    """
    src = src.convert("RGBA")
    w, h = src.size
    pix = src.load()
    staff = [[False] * w for _ in range(h)]
    brown = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if (
                a > 180
                and 70 < r < 160
                and 45 < g < 120
                and b < 90
                and r > g
                and r > b + 15
            ):
                brown[y][x] = True
    for y in range(h):
        for x in range(52, min(72, w)):
            if not brown[y][x]:
                continue
            y0, y1 = max(0, y - 8), min(h, y + 9)
            density = sum(1 for yy in range(y0, y1) if brown[yy][x]) / (y1 - y0)
            if density > 0.45:
                staff[y][x] = True
    staff_d = [row[:] for row in staff]
    for y in range(h):
        for x in range(w):
            if not staff[y][x]:
                continue
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w:
                        staff_d[yy][xx] = True

    flipped = src.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    fpix = flipped.load()
    for y in range(h):
        for x in range(w):
            # Mirrored staff column
            mx = w - 1 - x
            hit = False
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    yy, xx = y + dy, mx + dx
                    if 0 <= yy < h and 0 <= xx < w and staff_d[yy][xx]:
                        hit = True
                        break
                if hit:
                    break
            if hit:
                fpix[x, y] = (0, 0, 0, 0)

    split = int(h * split_ratio)
    out = src.copy()
    opix = out.load()
    for y in range(split, h):
        for x in range(w):
            opix[x, y] = fpix[x, y]
    for y in range(h):
        for x in range(w):
            if staff_d[y][x]:
                opix[x, y] = pix[x, y]

    staff_xs = [x for x in range(w) if any(staff_d[y][x] for y in range(h))]
    staff_x0 = (min(staff_xs) - 3) if staff_xs else 0
    staff_x1 = (max(staff_xs) + 3) if staff_xs else -1
    for i in range(blend):
        y = split - blend // 2 + i
        if not (0 <= y < h):
            continue
        alpha = max(0.0, min(1.0, (y - (split - blend / 2)) / blend))
        for x in range(w):
            if staff_x0 <= x <= staff_x1:
                continue
            sr, sg, sb, sa = pix[x, y]
            fr, fg, fb, fa = fpix[x, y]
            if sa == 0 and fa == 0:
                continue
            opix[x, y] = (
                int((1 - alpha) * sr + alpha * fr),
                int((1 - alpha) * sg + alpha * fg),
                int((1 - alpha) * sb + alpha * fb),
                int((1 - alpha) * sa + alpha * fa),
            )
        for x in range(w):
            if staff_d[y][x]:
                opix[x, y] = pix[x, y]
    return out


def main():
    # Hybrid trainer sheets (#134/#135): E/W idle+4 walk; S/N idle+2 contacts.
    player = DST / "player"
    tw, th = 48 * SCALE, 64 * SCALE

    # West is authoritative for side views.
    process("player-west-idle.png", "player/player-west-0.png", tw, th, dark_studio_bg=True)
    for i in range(1, 5):
        process(
            f"player-west-walk{i}.png",
            f"player/player-west-{i}.png",
            tw,
            th,
            dark_studio_bg=True,
        )

    # East = hflip west (outfit-locked multi-frame).
    for frame in range(0, 5):
        src = Image.open(player / f"player-west-{frame}.png").convert("RGBA")
        src.transpose(Image.Transpose.FLIP_LEFT_RIGHT).save(
            player / f"player-east-{frame}.png",
            optimize=True,
        )
        print(f"ok player/player-east-{frame}.png (hflip west-{frame})")

    # South: idle + walk1; walk2 keeps staff on viewer-left.
    process("player-south-idle.png", "player/player-south-0.png", tw, th, dark_studio_bg=True)
    process("player-south-walk1.png", "player/player-south-1.png", tw, th, dark_studio_bg=True)
    south1 = Image.open(player / "player-south-1.png").convert("RGBA")
    opposite_stride_keep_staff(south1).save(player / "player-south-2.png", optimize=True)
    print("ok player/player-south-2.png (lower-flip keep staff)")

    # North: idle + two contact walks from Imagine (no prop teleport).
    process("player-north-idle.png", "player/player-north-0.png", tw, th, dark_studio_bg=True)
    process("player-north-walk1.png", "player/player-north-1.png", tw, th, dark_studio_bg=True)
    process("player-north-walk2.png", "player/player-north-2.png", tw, th, dark_studio_bg=True)

    for c in [
        "mossling", "ember-wisp", "brook-nymph", "stone-hound", "mist-serpent",
        "rootwalker", "lantern-fox", "thunder-finch", "bramblewarden", "hearthflame",
    ]:
        process(
            f"creature-{c}.png",
            f"creatures/creature-{c}.png",
            48 * SCALE,
            52 * SCALE,
        )
    # Fen exclusives: Style D sheets on black studio bg (not light chroma).
    for c in ("peat-sprite", "cinder-toad", "bog-lantern"):
        process(
            f"creature-{c}.png",
            f"creatures/creature-{c}.png",
            48 * SCALE,
            52 * SCALE,
            dark_studio_bg=True,
        )
    for name, size in {
        "prop-tree.png": (48, 50),
        "prop-fern.png": (40, 32),
        "prop-shrine-altar.png": (48, 40),
        "prop-standing-stone.png": (42, 38),
        "prop-pebble-pile.png": (44, 32),
        "prop-hearth.png": (48, 40),
        "prop-cottage.png": (48, 44),
        "prop-gate.png": (48, 42),
        "prop-gate-locked.png": (48, 42),
    }.items():
        process(name, f"world/{name}", size[0] * SCALE, size[1] * SCALE)

    # Unique Mistwood/Emberfen floors, borders, and canopy props shipped in #345.
    # Do not derive Style D recolors over those sheets.
    print("DONE")


if __name__ == "__main__":
    main()
