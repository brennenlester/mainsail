"""Biome kits for Folklore Fields, Mistwood Reach, Emberfen Hollow, Moonwake
Harbor and the cottage interiors (#392).

Same stage, light rig, toon materials and palette families as models.py /
village.py (#361). Ground tiles extend the #361 GroundTile idea:

  * every variant of a zone shares the items that touch the tile border
    (seeded by `edge_seed`, wrapped 3x3), and keeps its own seeded details
    strictly inside, so any variant sits seamlessly next to any other;
  * `path` lays a band along X ("h"), Y ("v") or both ("cross"); "west" /
    "east" / "north" / "south" are rounded end caps (the band lies on the
    side away from the named end);
  * `shore` paints a bank on the south (screen-down) edge for tiles that
    border water; `surface` swaps the whole tile (pier planks, islet, water).

Top-down camera (pitch 90): +Y is screen-up (grid north), -Y screen-down.
"""

from __future__ import annotations

import math
import random

from models import TAU, Rig, _canopy, _flower, crescent_mesh
from stage import box, contact_shadow, cylinder, disc, empty, mesh_from, radial_material, sphere, toon

# --------------------------------------------------------------------------
# Ground styles (palette names / #hex inside the stage.PALETTE families)
# --------------------------------------------------------------------------
GROUND_STYLES: dict[str, dict] = {
    # Folklore Fields: open meadow, brighter and more golden than the grove.
    "fields": {
        "base": "fields_grass", "patches": ("#86b45a", "#97c264"),
        "blades": ("fields_grass_dark", "fields_grass_light"), "blade_count": 44,
        "petals": ("petal_gold", "petal", "cornflower"),
        "path": "flag", "shore": "sand",
    },
    # Mistwood Reach: dark mossy forest floor with leaf litter; still mid-value
    # so the player and creatures read (no black noise).
    "mistwood": {
        "base": "mist_floor", "patches": ("mist_moss", "#557f4c"),
        "blades": ("mist_floor_dark", "mist_moss_light"), "blade_count": 26,
        "litter": ("#8a6a3e", "#a07a44", "#6f7a3c"),
        "path": "moss",
    },
    # Emberfen Hollow: peat with ash drifts; glowing cracks in some variants.
    "emberfen": {
        "base": "peat", "patches": ("#7c685a", "#5f4c40"),
        "blades": ("peat_dark", "#8a7a5a"), "blade_count": 18,
        "flecks": ("#8a7c70", "#968a7e", "ash_dark"),
        "path": "cinder",
    },
    # Archipelago islands (#399): pale sandy turf. Kept light and low-contrast
    # on purpose: IsometricScene multiplies a per-island biome tint (lush /
    # barren / other) over it, so the tile supplies texture, not hue.
    "isle": {
        "base": "#e4dcb4", "patches": ("#d6d6a4", "#ece2c0"),
        "blades": ("#c4cc98", "#dfe4b8"), "blade_count": 22,
        "path": "flag", "shore": "sand",
    },
    # Moonwake Harbor: cobbled quay.
    "harbor": {
        "base": "quay_mortar", "cobble": ("cobble", "#c2baa8", "#cfc7b4", "#b8b09e"),
        "path": "boards", "shore": "kerb",
    },
    # Cottage wall tops (seen from above along the side/front walls).
    "wallcap": {"base": "bark_dark", "cobble": ("stone", "#c9c2b0", "#a8a294", "#b7ab96")},
    # Cottage interiors: warm plank floor (shared by every cottage).
    "cottage": {
        "base": "floor_wood", "planks": ("floor_wood", "floor_wood_light", "#c39466", "#b88a5c"),
        "path": "rug",
    },
}


def _copies(u, v, r=0.0):
    """Wrapped copies of a tile-space point (u, v in [0, 1)) that can show."""
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            x, y = u - 0.5 + dx, v - 0.5 + dy
            if abs(x) <= 0.5 + r and abs(y) <= 0.5 + r:
                yield dx, dy, x, y


class BiomeGround(Rig):
    def __init__(
        self,
        style: str = "fields",
        seed: int = 11,
        detail: dict | None = None,
        edge_seed: str = "fields",
        path: str | None = None,
        shore: bool = False,
        surface: str | None = None,
    ):
        root = empty("tile")
        super().__init__(root)
        self.root = root
        self.st = GROUND_STYLES[style]
        self.n = 0
        detail = detail or {}
        if surface:
            SURFACES[surface](self, random.Random(seed))
            return
        st = self.st
        box("ground", (0, 0, -0.05), (3.2, 3.2, 0.1), toon(st["base"], shadow=0.4, rim=0.0), root, outline=False)
        if "planks" in st:
            self._planks(random.Random(f"edge:{edge_seed}"), random.Random(seed), detail)
        if "cobble" in st:
            self._cobble(random.Random(f"edge:{edge_seed}"), random.Random(seed), detail)
        self.band = None
        if path:
            self.band = _Band(path)
        self.shore = shore
        items = []
        reach = 0.22

        def scatter(rng, kind, count, size, *, edge):
            made, guard = 0, 0
            while made < count and guard < 4000:
                guard += 1
                u, v = rng.random(), rng.random()
                near = min(u, v, 1 - u, 1 - v) < (reach if kind == "patch" else 0.05)
                if near != edge:
                    continue
                items.append((kind, u, v, rng.uniform(0, TAU), rng.uniform(*size), len(items)))
                made += 1

        shared = random.Random(f"edge:{edge_seed}")
        rng = random.Random(seed)
        if "patches" in st:
            scatter(shared, "patch", 3, (0.14, 0.22), edge=True)
            scatter(rng, "patch", detail.get("patches", 3), (0.12, 0.2), edge=False)
        if "blades" in st:
            scatter(shared, "blade", 14, (0.7, 1.2), edge=True)
            scatter(rng, "blade", st["blade_count"] - 14, (0.7, 1.2), edge=False)
        if "flecks" in st:
            scatter(shared, "fleck", 4, (0.7, 1.2), edge=True)
            scatter(rng, "fleck", 6, (0.7, 1.2), edge=False)
        if "litter" in st:
            scatter(shared, "leaf", 6, (0.8, 1.2), edge=True)
            scatter(rng, "leaf", detail.get("leaf", 8), (0.8, 1.2), edge=False)
        for kind in ("flower", "pebble", "clover", "twig", "mushroom", "glowcap", "crack", "coal", "reed", "puddle", "tuft", "moss", "straw", "knot", "shell"):
            if detail.get(kind):
                scatter(rng, kind, detail[kind], (0.8, 1.2), edge=False)
        if path:
            self.band.draw(self, random.Random(f"path:{edge_seed}"))
        if shore:
            SHORES[st["shore"]](self, random.Random(f"shore:{edge_seed}"))
        for kind, u, v, rot, s, i in items:
            for dx, dy, x, y in _copies(u, v, 0.35):
                if abs(x) > 0.85 or abs(y) > 0.85:
                    continue
                if self.band and kind not in ("pebble",) and self.band.covers(x, y, 0.06 if kind == "patch" else 0.03):
                    continue
                if shore and y < -0.24 and kind not in ("patch",):
                    continue
                ITEM[kind](self, f"{kind}{i}_{dx}{dy}", x, y, rot, s, i)

    # -- structured floors ------------------------------------------------
    def _planks(self, shared, rng, detail):
        """Horizontal boards, 5 per tile. Rows 0/2/4 butt at the tile edges
        (tone varies per variant); rows 1/3 butt mid-tile and cross the edge,
        so they keep the shared base tone."""
        cols = self.st["planks"]
        gap = toon("floor_wood_dark", shadow=0.4, rim=0.0)
        h = 0.2
        for r in range(5):
            y = -0.5 + h * (r + 0.5)
            if r % 2 == 0:
                c = cols[rng.randrange(len(cols))] if r else cols[0]
                box(f"board{r}", (0, y, -0.004), (0.992, h - 0.016, 0.008), toon(c, shadow=0.4, rim=0.0), self.root, outline=False)
                for sx in (-1, 1):
                    box(f"butt{r}{sx}", (sx * 0.5, y, -0.002), (0.012, h - 0.01, 0.006), gap, self.root, outline=False)
            else:
                for k, x in enumerate((-0.5, 0.5)):
                    box(f"board{r}_{k}", (x, y, -0.004), (0.992, h - 0.016, 0.008), toon(cols[0], shadow=0.4, rim=0.0), self.root, outline=False)
                box(f"butt{r}", (0.0, y, -0.002), (0.012, h - 0.01, 0.006), gap, self.root, outline=False)
            box(f"seam{r}", (0, y - h / 2, -0.001), (1.6, 0.012, 0.006), gap, self.root, outline=False)
            # Grain streaks.
            for g in range(3):
                gx = rng.uniform(-0.4, 0.4)
                sphere(f"grain{r}{g}", (gx, y + rng.uniform(-0.05, 0.05), 0.001), (rng.uniform(0.08, 0.16), 0.006, 0.002), toon(cols[3], shadow=0.4, rim=0.0), self.root, outline=False)
        nail = toon("#6b5a4e", shadow=0.3, rim=0.0)
        for r in range(5):
            y = -0.5 + h * (r + 0.5)
            for sx in ((-0.47, 0.47) if r % 2 == 0 else (-0.03, 0.03)):
                for sy in (-0.05, 0.05):
                    sphere(f"nail{r}{sx}{sy}", (sx, y + sy, 0.002), (0.008, 0.008, 0.003), nail, self.root, outline=False)

    def _cobble(self, shared, rng, detail):
        """Jittered 5x5 cobbles; border cells come from the shared seed."""
        cols = [toon(c, shadow=0.45, highlight=0.25, rim=0.0) for c in self.st["cobble"]]
        n = 5
        cell = 1 / n
        for gy in range(n):
            for gx in range(n):
                border = gx in (0, n - 1) or gy in (0, n - 1)
                r = shared if border else rng
                u = (gx + 0.5 + r.uniform(-0.12, 0.12)) * cell
                v = (gy + 0.5 + r.uniform(-0.12, 0.12)) * cell
                sx, sy = r.uniform(0.38, 0.46) * cell, r.uniform(0.36, 0.44) * cell
                m = cols[r.randrange(len(cols))]
                rot = r.uniform(-0.3, 0.3)
                for dx, dy, x, y in _copies(u, v, 0.12):
                    sphere(f"cob{gx}{gy}_{dx}{dy}", (x, y, 0.0), (sx * 1.12, sy * 1.12, 0.012), m, self.root, outline=False, low=True, smooth=False, rot=(0, 0, rot))


# --------------------------------------------------------------------------
# Path band
# --------------------------------------------------------------------------
class _Band:
    CAPS = {"west": ("h", 1), "east": ("h", -1), "north": ("v", -1), "south": ("v", 1)}

    def __init__(self, path: str):
        self.path = path
        if path in self.CAPS:
            self.axes = [self.CAPS[path][0]]
            self.side = self.CAPS[path][1]
        else:
            self.axes = ["h", "v"] if path == "cross" else [path]
            self.side = 0
        self.half = 0.25

    @staticmethod
    def xy(axis, a, b):
        return (a, b) if axis == "h" else (b, a)

    @staticmethod
    def ab(axis, x, y):
        return (x, y) if axis == "h" else (y, x)

    def on(self, axis, a, b, margin=0.0):
        if abs(b) >= self.half + margin:
            return False
        return self.side == 0 or self.side * a >= -0.06 - margin

    def covers(self, x, y, margin=0.0):
        return any(self.on(ax, *self.ab(ax, x, y), margin) for ax in self.axes)

    def draw(self, g: BiomeGround, rng):
        PATHS[g.st["path"]](self, g, rng)

    def slab(self, g, axis, name, mat, width=None, z=-0.002, square=False):
        """The flat band (or half band + round cap for an end piece; `square`
        ends it flat at a = -side * 0.2 instead)."""
        w = (width or self.half * 2)
        if self.side and square:
            a0 = self.side * 0.21
            box(name, (*self.xy(axis, a0, 0), z), (*((0.82, w) if axis == "h" else (w, 0.82)), 0.004), mat, g.root, outline=False)
        elif self.side:
            a0 = self.side * 0.395
            box(name, (*self.xy(axis, a0, 0), z), (*((0.91, w) if axis == "h" else (w, 0.91)), 0.004), mat, g.root, outline=False)
            sphere(f"{name}cap", (*self.xy(axis, -self.side * 0.06, 0), z + 0.0005), (*((0.2, w / 2) if axis == "h" else (w / 2, 0.2)), 0.004), mat, g.root, outline=False)
        else:
            box(name, (*self.xy(axis, 0, 0), z), (*((1.7, w) if axis == "h" else (w, 1.7)), 0.004), mat, g.root, outline=False)

    def along(self, rng, count, margin=0.0):
        """Periodic positions along the band (a in [-0.5, 0.5) + wrapped)."""
        out = []
        for i in range(count):
            u = (i + rng.uniform(0.1, 0.9)) / count
            out.append(u)
        return out


def _ragged(band, g, axis, rng, mat, *, count=10, rmin=0.07, rmax=0.11, tag="pe"):
    for i in range(count):
        u = (i + rng.uniform(0.1, 0.9)) / count
        for edge in (-1, 1):
            r = rng.uniform(rmin, rmax)
            bb = edge * (band.half + rng.uniform(-0.03, 0.02))
            for d in (-1, 0, 1):
                a = u - 0.5 + d
                if band.on(axis, a, 0) and abs(a) < 0.62:
                    x, y = band.xy(axis, a, bb)
                    sx, sy = (r * 1.4, r) if axis == "h" else (r, r * 1.4)
                    sphere(f"{tag}{axis}{i}{edge}_{d}", (x, y, -0.001), (sx, sy, 0.004), mat, g.root, outline=False)


def path_flag(band, g, rng):
    """Folklore Fields road: packed earth with flat flagstones."""
    dirt = toon("path", shadow=0.4, rim=0.0)
    for axis in band.axes:
        band.slab(g, axis, f"band{axis}", dirt)
        _ragged(band, g, axis, random.Random(f"{rng.random()}"), dirt)
    stones = [toon(c, shadow=0.45, highlight=0.25, rim=0.0) for c in ("cobble", "#d3cbb8", "#bdb4a2")]
    edge = toon("path_dark", shadow=0.4, rim=0.0)
    for axis in band.axes:
        r2 = random.Random(f"flag:{axis}")
        for i in range(4):
            u = (i + 0.5 + r2.uniform(-0.15, 0.15)) / 4
            for row, bb in enumerate((-0.11, 0.11)):
                b = bb + r2.uniform(-0.03, 0.03)
                uu = u + (0.125 if row else 0.0)
                sz = (r2.uniform(0.085, 0.105), r2.uniform(0.075, 0.09))
                m = stones[r2.randrange(3)]
                for d in (-1, 0, 1):
                    a = (uu % 1) - 0.5 + d
                    if not band.on(axis, a, b, -0.02) or abs(a) > 0.62:
                        continue
                    if len(band.axes) == 2 and axis == "v" and abs(a) < 0.3:
                        continue  # the h pass already paved the crossing
                    x, y = band.xy(axis, a, b)
                    sx, sy = (sz[0], sz[1]) if axis == "h" else (sz[1], sz[0])
                    sphere(f"fl{axis}{i}{row}_{d}", (x, y, 0.0), (sx + 0.012, sy + 0.012, 0.006), edge, g.root, outline=False, low=True, smooth=False)
                    sphere(f"fs{axis}{i}{row}_{d}", (x, y, 0.004), (sx, sy, 0.008), m, g.root, outline=False, low=True, smooth=False)


def path_moss(band, g, rng):
    """Mistwood: dark earth trail, mossy edges, roots crossing."""
    earth = toon("mist_earth", shadow=0.4, rim=0.0)
    moss = toon("mist_moss", shadow=0.4, rim=0.0)
    root_mat = toon("bark_dark", shadow=0.4, rim=0.0)
    for axis in band.axes:
        band.slab(g, axis, f"band{axis}", earth, width=0.44)
        r2 = random.Random(f"moss:{axis}")
        _ragged(band, g, axis, r2, earth, count=9, rmin=0.06, rmax=0.09)
        for i in range(5):
            u = (i + r2.uniform(0.1, 0.9)) / 5
            for edge in (-1, 1):
                bb = edge * (0.21 + r2.uniform(-0.03, 0.03))
                r = r2.uniform(0.03, 0.055)
                for d in (-1, 0, 1):
                    a = u - 0.5 + d
                    if band.on(axis, a, 0) and abs(a) < 0.62:
                        x, y = band.xy(axis, a, bb)
                        sphere(f"pm{axis}{i}{edge}_{d}", (x, y, 0.0), (r * 1.3, r, 0.006), moss, g.root, outline=False)
        # One curving root crossing the trail (segments of a gentle arc).
        u0 = r2.uniform(0.3, 0.7)
        for k in range(6):
            b = -0.24 + k * 0.096
            a = u0 - 0.5 + 0.08 * math.sin(k * 0.9)
            x, y = band.xy(axis, a, b)
            sx, sy = (0.016, 0.06) if axis == "h" else (0.06, 0.016)
            sphere(f"root{axis}{k}", (x, y, 0.004), (sx, sy, 0.008), root_mat, g.root, outline=False, rot=(0, 0, 0.4 * math.cos(k * 0.9)))


def path_cinder(band, g, rng):
    """Emberfen: dark ash trail with flat basalt stepping stones."""
    ash = toon("#8a7e74", shadow=0.4, rim=0.0)
    basalt = toon("#a39a9e", shadow=0.45, highlight=0.25, rim=0.0)
    glow = toon("ember", emission=1.3)
    for axis in band.axes:
        band.slab(g, axis, f"band{axis}", ash, width=0.46)
        r2 = random.Random(f"cinder:{axis}")
        _ragged(band, g, axis, r2, ash, count=9, rmin=0.06, rmax=0.1)
        for i in range(3):
            u = (i + 0.5 + r2.uniform(-0.1, 0.1)) / 3
            b = r2.uniform(-0.06, 0.06)
            s = r2.uniform(0.085, 0.11)
            for d in (-1, 0, 1):
                a = u - 0.5 + d
                if band.on(axis, a, b, -0.03) and abs(a) < 0.62:
                    x, y = band.xy(axis, a, b)
                    sphere(f"st{axis}{i}_{d}", (x, y, 0.004), (s * 1.15, s, 0.012), basalt, g.root, outline=True, low=True, smooth=False, rot=(0, 0, i))
        for i in range(4):
            u, b = (i + r2.uniform(0.1, 0.9)) / 4, r2.uniform(-0.18, 0.18)
            for d in (-1, 0, 1):
                a = u - 0.5 + d
                if band.on(axis, a, b, -0.03) and abs(a) < 0.55:
                    x, y = band.xy(axis, a, b)
                    sphere(f"gl{axis}{i}_{d}", (x, y, 0.006), (0.012, 0.012, 0.004), glow, g.root, outline=False)


def path_boards(band, g, rng):
    """Harbor boardwalk: planks laid across the walk on two stringers."""
    band.half = 0.31
    cols = [toon(c, shadow=0.4, highlight=0.2, rim=0.0) for c in ("dock_wood", "dock_wood_light", "dock_wood", "#9a7650")]
    under = toon("dock_wood_dark", shadow=0.4, rim=0.0)
    nail = toon("#5a4c48", shadow=0.3, rim=0.0)
    for axis in band.axes:
        band.slab(g, axis, f"under{axis}", under, width=0.64, z=0.02)
        n = 6
        for i in range(n):
            a = -0.5 + (i + 0.5) / n
            if not band.on(axis, a, 0):
                continue
            sz = (1 / n - 0.018, 0.6) if axis == "h" else (0.6, 1 / n - 0.018)
            x, y = band.xy(axis, a, 0)
            box(f"plank{axis}{i}", (x, y, 0.026), (*sz, 0.008), cols[i % len(cols)], g.root, outline=False)
            for e in (-1, 1):
                nx, ny = band.xy(axis, a, e * 0.22)
                sphere(f"nl{axis}{i}{e}", (nx, ny, 0.031), (0.009, 0.009, 0.003), nail, g.root, outline=False)


def path_rug(band, g, rng):
    """Cottage runner rug: wine field, gold border, fringe on end caps."""
    band.half = 0.3
    field = toon("rug", shadow=0.4, rim=0.0)
    border = toon("rug_gold", shadow=0.4, rim=0.0)
    for axis in band.axes:
        band.slab(g, axis, f"rugb{axis}", border, width=0.6, z=0.02, square=True)
        band.slab(g, axis, f"rugf{axis}", field, width=0.46, z=0.022, square=True)
        # Diamond motif down the middle (periodic: one per tile).
        for k, a in enumerate((-0.25, 0.25)):
            if not band.on(axis, a, 0, -0.08):
                continue
            x, y = band.xy(axis, a, 0)
            sphere(f"dia{axis}{k}", (x, y, 0.025), (0.1, 0.1, 0.004), border, g.root, outline=False, low=True, smooth=False, rot=(0, 0, math.pi / 4))
            sphere(f"dic{axis}{k}", (x, y, 0.027), (0.045, 0.045, 0.004), toon("cream", shadow=0.3, rim=0.0), g.root, outline=False, low=True, smooth=False, rot=(0, 0, math.pi / 4))
        if band.side:
            # Fringe beyond the rounded end.
            for k in range(8):
                b = -0.266 + k * 0.076
                x, y = band.xy(axis, -band.side * 0.22, b)
                sx, sy = (0.035, 0.007) if axis == "h" else (0.007, 0.035)
                sphere(f"fr{axis}{k}", (x, y, 0.021), (sx, sy, 0.004), toon("cream", shadow=0.3, rim=0.0), g.root, outline=False)


PATHS = {"flag": path_flag, "moss": path_moss, "cinder": path_cinder, "boards": path_boards, "rug": path_rug}


# --------------------------------------------------------------------------
# Shores (south edge, toward the water row below)
# --------------------------------------------------------------------------
def shore_sand(g, rng):
    sand = toon("sand", shadow=0.4, rim=0.0)
    wet = toon("sand_wet", shadow=0.4, rim=0.0)
    box("sandband", (0, -0.4, -0.002), (1.7, 0.2, 0.004), sand, g.root, outline=False)
    box("wetband", (0, -0.475, -0.001), (1.7, 0.05, 0.004), wet, g.root, outline=False)
    for i in range(9):
        u = (i + rng.uniform(0.1, 0.9)) / 9
        r = rng.uniform(0.06, 0.1)
        for d in (-1, 0, 1):
            x = u - 0.5 + d
            if abs(x) < 0.62:
                sphere(f"sb{i}_{d}", (x, -0.3 + rng.uniform(-0.02, 0.02), -0.0015), (r * 1.5, r, 0.004), sand, g.root, outline=False)
    for i in range(3):
        u = (i + rng.uniform(0.2, 0.8)) / 3
        sphere(f"sp{i}", (u - 0.5, -0.38, 0.006), (0.03, 0.024, 0.014), toon("stone"), g.root, low=True, smooth=False)


def shore_kerb(g, rng):
    """Harbor quay edge: dressed kerb stones + a timber fender beam."""
    kerb = toon("stone", shadow=0.5, highlight=0.25, rim=0.0)
    kerb2 = toon("stone_dark", shadow=0.5, rim=0.0)
    for i in range(4):
        box(f"kerb{i}", (-0.375 + i * 0.25, -0.42, 0.03), (0.24, 0.13, 0.02), kerb if i % 2 else kerb2, g.root, outline=True)
    box("fender", (0, -0.49, 0.03), (1.02, 0.03, 0.02), toon("dock_wood_dark", shadow=0.4, rim=0.0), g.root, outline=False)
    for x in (-0.25, 0.25):
        cylinder(f"bollard{x}", (x, -0.4, 0.06), 0.045, 0.04, toon("#4a4048", shadow=0.4), g.root, verts=10)


SHORES = {"sand": shore_sand, "kerb": shore_kerb}


# --------------------------------------------------------------------------
# Whole-tile surfaces
# --------------------------------------------------------------------------
def _water_base(g, rng, base="sea", ripple="sea_light", dark="sea_dark", sparkles=3):
    box("water", (0, 0, -0.05), (3.2, 3.2, 0.1), toon(base, shadow=0.3, rim=0.0), g.root, outline=False)
    shared = random.Random("water-edge")
    darkm = toon(dark, shadow=0.3, rim=0.0)
    lightm = toon(ripple, shadow=0.2, rim=0.0)
    for k, r2 in enumerate((shared, rng)):
        for i in range(3):
            u, v = r2.random(), r2.random()
            if k == 1 and min(u, v, 1 - u, 1 - v) < 0.2:
                continue
            s = r2.uniform(0.14, 0.22)
            for dx, dy, x, y in _copies(u, v, s):
                sphere(f"wd{k}{i}_{dx}{dy}", (x, y, -0.003), (s * 1.6, s * 0.7, 0.004), darkm, g.root, outline=False)
    for k, r2 in enumerate((shared, rng)):
        for i in range(5):
            u, v = r2.random(), r2.random()
            if k == 1 and min(u, v, 1 - u, 1 - v) < 0.08:
                continue
            s = r2.uniform(0.05, 0.09)
            for dx, dy, x, y in _copies(u, v, s):
                sphere(f"wr{k}{i}_{dx}{dy}", (x, y, 0.0), (s * 1.5, 0.011, 0.004), lightm, g.root, outline=False)
    shine = toon("#eaf6ff", emission=1.0)
    for i in range(sparkles):
        u, v = rng.uniform(0.15, 0.85), rng.uniform(0.15, 0.85)
        sphere(f"spk{i}", (u - 0.5, v - 0.5, 0.004), (0.014, 0.014, 0.003), shine, g.root, outline=False)


def surface_water(g, rng):
    _water_base(g, rng)


def surface_pier(g, rng):
    """Planks running N-S over water (dock + pier tiles)."""
    _water_base(g, rng, sparkles=1)
    cols = [toon(c, shadow=0.4, highlight=0.2, rim=0.0) for c in ("dock_wood", "dock_wood_light", "#9a7650", "dock_wood")]
    shade = toon("navy", shadow=0.0, rim=0.0)
    box("pshadow", (0.03, -0.0, -0.001), (0.74, 1.04, 0.004), shade, g.root, outline=False).hide_render = False
    for i in range(5):
        x = -0.3 + i * 0.15
        box(f"pl{i}", (x, 0, 0.01), (0.135, 1.004, 0.012), cols[i % len(cols)], g.root, outline=False)
    nail = toon("#5a4c48", shadow=0.3, rim=0.0)
    for i in range(5):
        for y in (-0.42, 0.08):
            sphere(f"pn{i}{y}", (-0.3 + i * 0.15, y, 0.018), (0.009, 0.009, 0.003), nail, g.root, outline=False)
    post = toon("dock_wood_dark", shadow=0.5)
    for sx in (-1, 1):
        cylinder(f"post{sx}", (sx * 0.39, -0.35, 0.02), 0.05, 0.04, post, g.root, verts=10)


def surface_islet(g, rng):
    _water_base(g, rng, sparkles=2)
    sand = toon("sand", shadow=0.4, rim=0.0)
    for i in range(6):
        a = i * TAU / 6 + rng.uniform(-0.2, 0.2)
        d = rng.uniform(0.12, 0.2)
        sphere(f"is{i}", (math.cos(a) * d, math.sin(a) * d, -0.002), (0.17, 0.15, 0.006), sand, g.root, outline=False)
    sphere("isc", (0, 0, -0.001), (0.26, 0.23, 0.008), sand, g.root, outline=False)
    sphere("wetring", (0, 0, -0.0035), (0.42, 0.38, 0.004), toon("sand_wet", shadow=0.4, rim=0.0), g.root, outline=False)
    g.st = GROUND_STYLES["fields"]
    i_tuft(g, "islettuft", -0.04, 0.03, 0.3, 1.3, 0)
    i_flower(g, "isletfl", 0.07, -0.02, 0.0, 1.0, 0)
    for i in range(3):
        sphere(f"ip{i}", (rng.uniform(-0.18, 0.18), rng.uniform(-0.15, 0.05), 0.006), (0.03, 0.025, 0.014), toon("stone"), g.root, low=True, smooth=False)


SURFACES = {"water": surface_water, "pier": surface_pier, "islet": surface_islet}


# --------------------------------------------------------------------------
# Scatter items
# --------------------------------------------------------------------------
def _m(color, **kw):
    kw.setdefault("shadow", 0.45)
    kw.setdefault("rim", 0.0)
    return toon(color, **kw)


def i_patch(g, tag, x, y, rot, s, i):
    sphere(tag, (x, y, -0.004), (s, s * 0.7, 0.01), _m(g.st["patches"][i % 2], shadow=0.4), g.root, outline=False, rot=(0, 0, rot))


def i_blade(g, tag, x, y, rot, s, i):
    sphere(tag, (x, y, 0.004), (0.045 * s, 0.009, 0.012), _m(g.st["blades"][i % 2], shadow=0.5), g.root, outline=False, rot=(0, 0, rot))


def i_flower(g, tag, x, y, rot, s, i):
    pet = g.st.get("petals", ("petal",))
    _flower(tag, (x, y, 0.012), g.root, pet[i % len(pet)], size=0.022 * s, outline=True)


def i_pebble(g, tag, x, y, rot, s, i):
    col = g.st.get("pebble", "stone")
    sphere(tag, (x, y, 0.008), (0.035 * s, 0.028 * s, 0.018), toon(col), g.root, low=True, smooth=False, outline=True, rot=(0, 0, rot))


def i_clover(g, tag, x, y, rot, s, i):
    m = _m("#6fa04e", shadow=0.4)
    for k in range(3):
        a = rot + k * TAU / 3
        sphere(f"{tag}c{k}", (x + math.cos(a) * 0.018 * s, y + math.sin(a) * 0.018 * s, 0.006), (0.02 * s, 0.02 * s, 0.006), m, g.root, outline=False)


def i_tuft(g, tag, x, y, rot, s, i):
    m = [_m(c, shadow=0.5) for c in g.st["blades"]]
    for k in range(7):
        a = rot + k * TAU / 7
        sphere(f"{tag}t{k}", (x + math.cos(a) * 0.035 * s, y + math.sin(a) * 0.035 * s, 0.008), (0.05 * s, 0.01, 0.014), m[k % 2], g.root, outline=False, rot=(0, 0, a))


def i_leaf(g, tag, x, y, rot, s, i):
    lit = g.st["litter"]
    sphere(tag, (x, y, 0.005), (0.03 * s, 0.015 * s, 0.006), _m(lit[i % len(lit)], shadow=0.4), g.root, outline=False, rot=(0, 0, rot))


def i_fleck(g, tag, x, y, rot, s, i):
    fl = g.st["flecks"]
    sphere(tag, (x, y, 0.003), (0.022 * s, 0.014 * s, 0.004), _m(fl[i % len(fl)], shadow=0.4), g.root, outline=False, low=True, rot=(0, 0, rot))


def i_twig(g, tag, x, y, rot, s, i):
    sphere(tag, (x, y, 0.006), (0.07 * s, 0.008, 0.008), _m("bark_dark"), g.root, outline=False, rot=(0, 0, rot))
    sphere(f"{tag}b", (x + 0.03 * math.cos(rot + 0.6), y + 0.03 * math.sin(rot + 0.6), 0.006), (0.03 * s, 0.006, 0.006), _m("bark_dark"), g.root, outline=False, rot=(0, 0, rot + 0.6))


def i_moss(g, tag, x, y, rot, s, i):
    sphere(tag, (x, y, 0.004), (0.06 * s, 0.05 * s, 0.01), _m("mist_moss_light", shadow=0.4), g.root, outline=False, low=True, rot=(0, 0, rot))


def i_mushroom(g, tag, x, y, rot, s, i):
    sphere(f"{tag}cap", (x, y, 0.02), (0.026 * s, 0.026 * s, 0.014), toon("#c9a27a"), g.root, outline=True)
    sphere(f"{tag}dot", (x - 0.006, y + 0.006, 0.033), (0.006, 0.006, 0.003), toon("cream", shadow=0.2), g.root, outline=False)


def i_glowcap(g, tag, x, y, rot, s, i):
    for k in range(3):
        a = rot + k * 2.1
        d = 0.0 if k == 0 else 0.03 * s
        r = (0.026 if k == 0 else 0.018) * s
        cx, cy = x + math.cos(a) * d, y + math.sin(a) * d
        sphere(f"{tag}c{k}", (cx, cy, 0.02), (r, r, r * 0.6), toon("glowcap" if k != 1 else "glowcap_alt", emission=1.35), g.root, outline=True)
    halo = disc(f"{tag}h", (x, y, 0.003), 0.09 * s, radial_material("glowcaphalo", "glowcap", 0.45), g.root)
    halo.visible_shadow = False


def i_crack(g, tag, x, y, rot, s, i):
    """Ember fissure: dark zig-zag with a glowing core."""
    dark = _m("peat_dark", shadow=0.3)
    glow = toon("ember", emission=1.35)
    pts = [(0.0, 0.0)]
    a = rot
    rng = random.Random(f"{tag}")
    for k in range(5):
        a += rng.uniform(-0.6, 0.6)
        L = rng.uniform(0.07, 0.1) * s
        pts.append((pts[-1][0] + math.cos(a) * L, pts[-1][1] + math.sin(a) * L))
    for k, ((x0, y0), (x1, y1)) in enumerate(zip(pts, pts[1:])):
        mx, my = x + (x0 + x1) / 2, y + (y0 + y1) / 2
        ang = math.atan2(y1 - y0, x1 - x0)
        L = math.hypot(x1 - x0, y1 - y0)
        sphere(f"{tag}d{k}", (mx, my, 0.002), (L * 0.62, 0.02, 0.004), dark, g.root, outline=False, rot=(0, 0, ang))
        sphere(f"{tag}g{k}", (mx, my, 0.005), (L * 0.55, 0.008, 0.003), glow, g.root, outline=False, rot=(0, 0, ang))
    halo = disc(f"{tag}h", (x + pts[2][0], y + pts[2][1], 0.001), 0.13 * s, radial_material("crackhalo", "ember", 0.35), g.root)
    halo.visible_shadow = False


def i_coal(g, tag, x, y, rot, s, i):
    sphere(tag, (x, y, 0.01), (0.03 * s, 0.026 * s, 0.018), toon("basalt"), g.root, low=True, smooth=False, outline=True, rot=(0, 0, rot))
    sphere(f"{tag}e", (x + 0.008, y - 0.006, 0.026), (0.01, 0.01, 0.004), toon("ember", emission=1.3), g.root, outline=False)


def i_reed(g, tag, x, y, rot, s, i):
    m = [_m(c, shadow=0.5) for c in ("#8a7a5a", "#a8946a")]
    for k in range(5):
        a = rot + k * TAU / 5
        sphere(f"{tag}r{k}", (x + math.cos(a) * 0.03 * s, y + math.sin(a) * 0.03 * s, 0.008), (0.055 * s, 0.009, 0.012), m[k % 2], g.root, outline=False, rot=(0, 0, a))


def i_puddle(g, tag, x, y, rot, s, i):
    sphere(tag, (x, y, -0.001), (0.1 * s, 0.065 * s, 0.006), _m("fen_water", shadow=0.2), g.root, outline=False, rot=(0, 0, rot))
    sphere(f"{tag}s", (x - 0.02, y + 0.012, 0.002), (0.03 * s, 0.006, 0.003), toon("#a8c8c8", emission=0.9), g.root, outline=False, rot=(0, 0, rot))


def i_straw(g, tag, x, y, rot, s, i):
    for k in range(3):
        sphere(f"{tag}s{k}", (x + k * 0.012, y + k * 0.008, 0.008), (0.045 * s, 0.006, 0.004), _m("#e3c27a", shadow=0.35), g.root, outline=False, rot=(0, 0, rot + k * 0.5))


def i_knot(g, tag, x, y, rot, s, i):
    sphere(tag, (x, y, 0.002), (0.022 * s, 0.015 * s, 0.003), _m("floor_wood_dark", shadow=0.3), g.root, outline=False, rot=(0, 0, rot))


def i_shell(g, tag, x, y, rot, s, i):
    sphere(tag, (x, y, 0.008), (0.022 * s, 0.018 * s, 0.01), toon("#f1d9c4"), g.root, outline=True, rot=(0, 0, rot))


ITEM = {
    "patch": i_patch, "blade": i_blade, "flower": i_flower, "pebble": i_pebble, "clover": i_clover,
    "tuft": i_tuft, "leaf": i_leaf, "twig": i_twig, "moss": i_moss, "mushroom": i_mushroom,
    "glowcap": i_glowcap, "crack": i_crack, "coal": i_coal, "reed": i_reed, "puddle": i_puddle,
    "straw": i_straw, "fleck": i_fleck, "knot": i_knot, "shell": i_shell,
}


# --------------------------------------------------------------------------
# Backdrops (seamless top-down tiles around the playfield)
# --------------------------------------------------------------------------
class FenBackdrop(Rig):
    """Dark peat with dead shrubs, reeds and a few glowing pools."""

    def __init__(self, seed: int = 35):
        root = empty("fen")
        super().__init__(root)
        rng = random.Random(seed)
        box("floor", (0, 0, -0.3), (3.2, 3.2, 0.1), toon("peat_dark", shadow=0.4, rim=0.0), root, outline=False)
        mats = [toon(c, shadow=0.55, highlight=0.2, rim=0.0) for c in ("#5a4a3c", "#6b5844", "#4a3c32")]
        pool = toon("#a8582e", emission=0.75)
        n = 4
        for gy in range(n):
            for gx in range(n):
                u = (gx + rng.uniform(0.15, 0.85)) / n
                v = (gy + rng.uniform(0.15, 0.85)) / n
                r = rng.uniform(0.15, 0.21)
                m = rng.randrange(3)
                glow = rng.random() < 0.1
                for dx, dy, x, y in _copies(u, v, r):
                    if glow:
                        sphere(f"pool{gx}{gy}_{dx}{dy}", (x, y, -0.2), (r * 0.45, r * 0.32, 0.01), pool, root, outline=False)
                    else:
                        sphere(f"c{gx}{gy}_{dx}{dy}", (x, y, 0.0), (r, r, r * 0.6), mats[m], root, low=True, smooth=False, rot=(u * 9, v * 9, u * v * 9), outline=False)


class MistBackdrop(Rig):
    """Dense dark pines from above with a few glowcap specks."""

    def __init__(self, seed: int = 36):
        root = empty("mistcanopy")
        super().__init__(root)
        rng = random.Random(seed)
        box("floor", (0, 0, -0.3), (3.2, 3.2, 0.1), toon("#263d33", shadow=0.4, rim=0.0), root, outline=False)
        mats = [toon(c, shadow=0.55, highlight=0.25, rim=0.0) for c in ("pine", "pine_dark", "#3f6a52")]
        glow = toon("glowcap", emission=1.2)
        n = 4
        for gy in range(n):
            for gx in range(n):
                u = (gx + rng.uniform(0.15, 0.85)) / n
                v = (gy + rng.uniform(0.15, 0.85)) / n
                r = rng.uniform(0.15, 0.2)
                m = rng.randrange(3)
                kind = rng.random()
                for dx, dy, x, y in _copies(u, v, r):
                    tag = f"{gx}{gy}_{dx}{dy}"
                    # Star-shaped pine crown: a cone seen from above.
                    cylinder(f"pine{tag}", (x, y, 0.0), r, r * 1.2, mats[m], root, verts=7, radius_top=0.0, smooth=False, outline=False, rot=(0, 0, u * 7))
                    if kind > 0.9:
                        sphere(f"gl{tag}", (x + r * 0.7, y - r * 0.5, 0.0), (0.02, 0.02, 0.02), glow, root, outline=False)


# --------------------------------------------------------------------------
# Boundaries (48x56 logical; bleed past the canvas sides so blocks join)
# --------------------------------------------------------------------------
class DrystoneWall(Rig):
    """Folklore Fields: hedge row behind a low drystone wall."""

    def __init__(self, seed: int = 41):
        root = empty("drystone")
        super().__init__(root)
        rng = random.Random(seed)
        leaf = [toon(c, shadow=0.55, highlight=0.3) for c in ("leaf", "leaf_light", "leaf")]
        for i, x in enumerate((-0.48, -0.16, 0.16, 0.48)):
            r = rng.uniform(0.25, 0.3)
            sphere(f"h{i}", (x, 0.14, 0.36 + rng.uniform(0, 0.06)), (r, r * 0.85, r), leaf[i % 3], root, low=True, smooth=False, rot=(rng.random(), rng.random(), rng.random()))
        stones = [toon(c, shadow=0.5, highlight=0.25) for c in ("stone", "stone_dark", "#c9c2b0")]
        for course, (z, n, off) in enumerate(((0.07, 5, 0.0), (0.2, 5, 0.12), (0.31, 4, 0.04))):
            for k in range(n):
                x = -0.6 + off + k * 0.26 + rng.uniform(-0.02, 0.02)
                sphere(f"s{course}{k}", (x, -0.06, z), (0.14, 0.1, 0.075), stones[(k + course) % 3], root, low=True, smooth=False, rot=(0, rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2)))
        box("cap", (0, -0.06, 0.39), (1.1, 0.16, 0.04), toon("moss_dark", shadow=0.5), root)
        for i in range(2):
            _flower(f"wf{i}", (-0.25 + i * 0.5, -0.17, 0.05), root, ["petal_gold", "cornflower"][i], size=0.035, outline=True)


class PineWall(Rig):
    """Mistwood boundary: two dark pines with moss and a glowcap."""

    def __init__(self, seed: int = 42):
        root = empty("pinewall")
        super().__init__(root)
        rng = random.Random(seed)
        for i, x in enumerate((-0.42, 0.0, 0.42)):
            _pine(root, f"p{i}", (x, rng.uniform(-0.02, 0.08), 0.0), 0.95 + rng.uniform(-0.12, 0.12) - 0.18 * (i == 1), rng)
        for i in range(3):
            sphere(f"moss{i}", (-0.35 + i * 0.35, -0.16, 0.04), (0.14, 0.09, 0.05), toon("mist_moss"), root, low=True, smooth=False)
        _glowcaps(root, "gc", (0.18, -0.18, 0.0), 0.8)


class FenWall(Rig):
    """Emberfen boundary: basalt boulders, dead reeds, a glowing seam."""

    def __init__(self, seed: int = 43):
        root = empty("fenwall")
        super().__init__(root)
        rng = random.Random(seed)
        mats = [toon(c, shadow=0.55, highlight=0.25) for c in ("basalt", "basalt_light", "basalt")]
        for i, x in enumerate((-0.45, -0.12, 0.2, 0.5)):
            r = rng.uniform(0.2, 0.27)
            sphere(f"b{i}", (x, 0.02, r * 0.75), (r * 1.1, r * 0.9, r), mats[i % 3], root, low=True, smooth=False, rot=(rng.random(), rng.random(), rng.random()))
        for i in range(2):
            sphere(f"t{i}", (-0.25 + i * 0.45, 0.06, 0.48), (0.15, 0.13, 0.13), mats[(i + 1) % 3], root, low=True, smooth=False, rot=(i, i * 2, 0))
        glow = toon("ember", emission=1.35)
        for k in range(3):
            box(f"seam{k}", (-0.12 + k * 0.05, -0.19, 0.18 + k * 0.06), (0.02, 0.02, 0.09), glow, root, rot=(0, 0.5 - k * 0.4, 0), outline=False)
        _reeds(root, "rd", (-0.3, -0.2, 0.0), 6, rng)
        _reeds(root, "re", (0.38, -0.18, 0.0), 5, rng)


class SeaWall(Rig):
    """Harbor boundary: dressed-stone sea wall with posts and rope."""

    def __init__(self, seed: int = 44):
        root = empty("seawall")
        super().__init__(root)
        rng = random.Random(seed)
        stones = [toon(c, shadow=0.5, highlight=0.25) for c in ("stone", "#c9c2b0", "stone_dark")]
        for course, z in enumerate((0.09, 0.27)):
            for k in range(5):
                x = -0.62 + (course * 0.13) + k * 0.27
                box(f"blk{course}{k}", (x, 0.0, z), (0.25, 0.3, 0.17), stones[(k + course) % 3], root, bevel=0.02)
        box("coping", (0, -0.01, 0.39), (1.12, 0.34, 0.05), toon("stone_dark", shadow=0.5), root)
        post = toon("dock_wood_dark", shadow=0.5)
        rope = toon("rope", shadow=0.4)
        for sx in (-0.3, 0.3):
            cylinder(f"post{sx}", (sx, -0.1, 0.55), 0.05, 0.3, post, root, verts=8)
            sphere(f"cap{sx}", (sx, -0.1, 0.71), (0.055, 0.055, 0.03), post, root)
        cylinder("rope", (0, -0.1, 0.6), 0.016, 0.62, rope, root, verts=6, rot=(0, math.pi / 2, 0))
        sphere("weed", (0.4, -0.16, 0.05), (0.1, 0.06, 0.06), toon("#4f8a6a"), root, low=True, smooth=False)


def _pine(parent, name, loc, height, rng):
    holder = empty(name, loc, parent)
    trunk = toon("bark_dark", shadow=0.55)
    cylinder(f"{name}trunk", (0, 0, 0.12 * height), 0.06, 0.26 * height, trunk, holder, verts=6, smooth=False)
    mats = [toon(c, shadow=0.55, highlight=0.25) for c in ("pine", "pine_dark", "pine_light")]
    for k, (z, r, h) in enumerate(((0.28, 0.3, 0.42), (0.52, 0.24, 0.36), (0.72, 0.16, 0.3))):
        cylinder(f"{name}tier{k}", (0, 0, z * height + h * height / 2), r * height, h * height, mats[k % 2], holder, verts=7, radius_top=0.0, smooth=False, rot=(0, 0, rng.uniform(0, 1)))
    # Hanging moss strands.
    for k in range(2):
        a = rng.uniform(-1.2, 1.2) - math.pi / 2
        sphere(f"{name}lich{k}", (math.cos(a) * 0.2 * height, math.sin(a) * 0.2 * height, 0.32 * height), (0.025, 0.02, 0.07), toon("lichen"), holder, outline=False)
    return holder


def _glowcaps(parent, name, loc, scale=1.0):
    holder = empty(name, loc, parent)
    holder.scale = (scale,) * 3
    stem = toon("#e6e0cc", shadow=0.35)
    for k, (x, y, h, r, col) in enumerate(((0.0, 0.0, 0.12, 0.07, "glowcap"), (0.08, -0.04, 0.08, 0.05, "glowcap_alt"), (-0.07, -0.03, 0.06, 0.04, "glowcap"))):
        cylinder(f"{name}stem{k}", (x, y, h / 2), 0.016, h, stem, holder, verts=6)
        sphere(f"{name}cap{k}", (x, y, h), (r, r, r * 0.55), toon(col, emission=1.35), holder)
        for d in range(2):
            sphere(f"{name}dot{k}{d}", (x + (d - 0.5) * r * 0.8, y - r * 0.6, h + r * 0.3), (r * 0.15, r * 0.1, r * 0.1), toon("#f4fff8", emission=1.2), holder, outline=False)
    halo = disc(f"{name}halo", (0, 0, 0.004), 0.22, radial_material("gchalo", "glowcap", 0.5), holder)
    halo.visible_shadow = False
    return holder


def _reeds(parent, name, loc, count, rng, cattail=True):
    holder = empty(name, loc, parent)
    stalk = toon("#8a7a5a", shadow=0.5)
    stalk2 = toon("#a8946a", shadow=0.5)
    head = toon("#6b4630", shadow=0.5)
    for k in range(count):
        a = k * TAU / count + rng.uniform(-0.3, 0.3)
        d = rng.uniform(0.0, 0.08)
        h = rng.uniform(0.3, 0.5)
        tilt = (rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), 0)
        p = empty(f"{name}s{k}", (math.cos(a) * d, math.sin(a) * d, 0), holder)
        p.rotation_euler = tilt
        cylinder(f"{name}st{k}", (0, 0, h / 2), 0.012, h, stalk if k % 2 else stalk2, p, verts=5)
        if cattail and k % 2 == 0:
            cylinder(f"{name}hd{k}", (0, 0, h * 0.86), 0.028, h * 0.2, head, p, verts=8)
        else:
            sphere(f"{name}lf{k}", (0.03, 0, h * 0.6), (0.012, 0.01, h * 0.35), stalk2, p, rot=(0, 0.35, 0))
    return holder


# --------------------------------------------------------------------------
# Props
# --------------------------------------------------------------------------
class MistPine(Rig):
    """prop-tree-mistwood: tall dark pine with lichen and glowcaps."""

    def __init__(self, seed: int = 51):
        root = empty("mistpine")
        super().__init__(root)
        rng = random.Random(seed)
        _pine(root, "pine", (0, 0, 0), 1.45, rng)
        cylinder("flare", (0, 0, 0.04), 0.13, 0.08, toon("bark_dark", shadow=0.55), root, verts=6, radius_top=0.08, smooth=False)
        _glowcaps(root, "gc", (0.2, -0.12, 0.0), 0.75)
        sphere("moss", (-0.16, -0.1, 0.04), (0.13, 0.09, 0.05), toon("mist_moss"), root, low=True, smooth=False)
        contact_shadow(root, radius=0.3, alpha=0.3)


class CharredTree(Rig):
    """prop-tree-emberfen: dead charred tree with glowing ember veins."""

    def __init__(self, seed: int = 52):
        root = empty("charred")
        super().__init__(root)
        rng = random.Random(seed)
        bark = toon("char", shadow=0.55, highlight=0.25)
        glow = toon("ember", emission=1.4)
        cylinder("trunk", (0, 0, 0.32), 0.12, 0.64, bark, root, verts=7, radius_top=0.06, smooth=False, rot=(0, 0.06, 0))
        cylinder("flare", (0, 0, 0.05), 0.18, 0.1, bark, root, verts=7, radius_top=0.11, smooth=False)
        for k, (a, z, L, tilt) in enumerate(((0.3, 0.52, 0.34, 0.9), (2.6, 0.6, 0.3, 0.8), (4.4, 0.42, 0.26, 1.0), (1.5, 0.66, 0.24, 0.5))):
            p = empty(f"br{k}", (0, 0, z), root)
            p.rotation_euler = (0, tilt, a)
            cylinder(f"branch{k}", (0, 0, L / 2), 0.04, L, bark, p, verts=5, radius_top=0.012, smooth=False)
            twig = empty(f"tw{k}", (0, 0, L * 0.7), p)
            twig.rotation_euler = (0.7, 0, 0)
            cylinder(f"twig{k}", (0, 0, 0.06), 0.015, 0.12, bark, twig, verts=4, radius_top=0.004, smooth=False)
        for k in range(3):
            box(f"vein{k}", (0.02 * (k - 1), -0.11 + 0.01 * k, 0.16 + k * 0.14), (0.018, 0.015, 0.09), glow, root, rot=(0, 0.3 * (k - 1), 0), outline=False)
        halo = disc("halo", (0, -0.12, 0.3), 0.3, radial_material("treehalo", "ember", 0.3), root)
        halo.rotation_euler = (math.pi / 2, 0, 0)
        halo.visible_shadow = False
        for i in range(3):
            sphere(f"ash{i}", (rng.uniform(-0.25, 0.25), rng.uniform(-0.2, 0.1), 0.02), (0.1, 0.07, 0.03), toon("ash"), root, low=True, smooth=False)
        contact_shadow(root, radius=0.3, alpha=0.3)


class Fern(Rig):
    """prop-fern-mistwood: curled dark fern fronds with two glowcaps."""

    def __init__(self, seed: int = 53):
        root = empty("darkfern")
        super().__init__(root)
        rng = random.Random(seed)
        mats = [toon(c, shadow=0.55, highlight=0.25) for c in ("pine_light", "mist_moss", "pine")]
        for k in range(7):
            a = k * TAU / 7 + rng.uniform(-0.2, 0.2)
            p = empty(f"frond{k}", (0, 0, 0.04), root)
            p.rotation_euler = (0, 0, a)
            leaf = sphere(f"fl{k}", (0.17, 0, 0.12), (0.19, 0.05, 0.03), mats[k % 3], p, rot=(0, -0.6, 0))
        _glowcaps(root, "gc", (0.18, -0.16, 0.0), 0.55)
        contact_shadow(root, radius=0.3, alpha=0.28)


class Reeds(Rig):
    """prop-fern-emberfen: cattail reeds in a peat puddle."""

    def __init__(self, seed: int = 54):
        root = empty("reeds")
        super().__init__(root)
        rng = random.Random(seed)
        sphere("pool", (0, 0, 0.004), (0.3, 0.22, 0.01), toon("fen_water", shadow=0.3), root, outline=False)
        _reeds(root, "r1", (-0.08, 0.02, 0), 7, rng)
        _reeds(root, "r2", (0.14, -0.06, 0), 5, rng)
        contact_shadow(root, radius=0.3, alpha=0.25)


class DuneGrass(Rig):
    """prop-fern-harbor: marram grass tuft with a shell."""

    def __init__(self, seed: int = 55):
        root = empty("dune")
        super().__init__(root)
        rng = random.Random(seed)
        sphere("sand", (0, 0, 0.01), (0.28, 0.2, 0.03), toon("sand"), root, outline=False)
        mats = [toon(c, shadow=0.5) for c in ("#9cb46a", "#c4c27a", "#7f9a58")]
        for k in range(11):
            a = k * TAU / 11
            p = empty(f"b{k}", (math.cos(a) * 0.05, math.sin(a) * 0.04, 0.02), root)
            p.rotation_euler = (math.sin(a) * 0.5, -math.cos(a) * 0.5, 0)
            cylinder(f"bl{k}", (0, 0, 0.16), 0.02, 0.32, mats[k % 3], p, verts=4, radius_top=0.0, smooth=False)
        sphere("shell", (0.18, -0.12, 0.03), (0.05, 0.04, 0.025), toon("#f1d9c4"), root)
        contact_shadow(root, radius=0.3, alpha=0.25)


class MossStone(Rig):
    """prop-standing-stone-mistwood: mossy menhir with a teal glyph."""

    def __init__(self):
        root = empty("mossstone")
        super().__init__(root)
        stone = toon("#8f958c", shadow=0.5)
        box("menhir", (0, 0, 0.3), (0.3, 0.22, 0.6), stone, root, rot=(0.04, -0.06, 0.2), bevel=0.05)
        sphere("cap", (0.02, 0.02, 0.6), (0.17, 0.13, 0.06), toon("mist_moss"), root, low=True, smooth=False)
        sphere("drape", (-0.1, -0.08, 0.42), (0.09, 0.05, 0.12), toon("mist_moss"), root, low=True, smooth=False)
        glyph = crescent_mesh("glyph", 0.075, 0.02, toon("glowcap", emission=1.6), root, loc=(0.02, -0.125, 0.32), outline=False)
        glyph.rotation_euler = (0.04, 0, 0.2)
        _glowcaps(root, "gc", (-0.2, -0.12, 0.0), 0.45)
        contact_shadow(root, radius=0.3, alpha=0.3)


class BasaltColumns(Rig):
    """prop-standing-stone-emberfen: hexagonal basalt columns, ember vein."""

    def __init__(self):
        root = empty("basalt")
        super().__init__(root)
        mats = [toon(c, shadow=0.5, highlight=0.3) for c in ("basalt", "basalt_light")]
        for k, (x, y, h) in enumerate(((0.0, 0.04, 0.62), (-0.15, -0.04, 0.42), (0.15, -0.02, 0.5), (0.05, -0.14, 0.26))):
            cylinder(f"col{k}", (x, y, h / 2), 0.1, h, mats[k % 2], root, verts=6, smooth=False, rot=(0, 0, k * 0.4))
        glow = toon("ember", emission=1.45)
        box("vein", (0.0, -0.06, 0.34), (0.02, 0.02, 0.32), glow, root, outline=False, rot=(0, 0.15, 0))
        box("vein2", (0.15, -0.115, 0.22), (0.015, 0.015, 0.16), glow, root, outline=False, rot=(0, -0.2, 0))
        sphere("ash", (0.1, -0.22, 0.02), (0.14, 0.08, 0.03), toon("ash"), root, low=True, smooth=False)
        contact_shadow(root, radius=0.3, alpha=0.3)


class BallastStones(Rig):
    """prop-standing-stone-harbor: stacked dressed stone blocks + rope."""

    def __init__(self):
        root = empty("ballast")
        super().__init__(root)
        mats = [toon(c, shadow=0.5, highlight=0.25) for c in ("stone", "#c9c2b0", "stone_dark")]
        for k, (x, y, z, r) in enumerate(((-0.12, 0.02, 0.09, 0.0), (0.13, 0.03, 0.09, 0.2), (0.0, 0.02, 0.27, -0.1), (0.05, -0.16, 0.07, 0.3))):
            box(f"blk{k}", (x, y, z), (0.24, 0.2, 0.17) if k < 3 else (0.16, 0.14, 0.13), mats[k % 3], root, rot=(0, 0, r), bevel=0.02)
        cylinder("rope", (0.0, 0.02, 0.27), 0.135, 0.03, toon("rope"), root, verts=14, outline=False)
        contact_shadow(root, radius=0.32, alpha=0.3)


class PebbleKind(Rig):
    """Zone pebble piles: mossy pebbles (mistwood), coals (emberfen),
    pebbles + shells (harbor)."""

    def __init__(self, kind: str = "mistwood", seed: int = 7):
        root = empty("pebs")
        super().__init__(root)
        rng = random.Random(seed)
        if kind == "emberfen":
            mats = [toon(c) for c in ("basalt", "basalt_light", "char")]
        else:
            mats = [toon(c) for c in ("stone", "stone_dark", "#c9c2b0")]
        for i in range(5):
            a = rng.uniform(0, TAU)
            d = 0.22 * math.sqrt(rng.random()) if i else 0
            r = rng.uniform(0.09, 0.15) * (1.4 if i == 0 else 1)
            sphere(f"peb{i}", (math.cos(a) * d, math.sin(a) * d, r * 0.45), (r * 1.2, r, r * 0.7), mats[i % 3], root, low=True, smooth=False, rot=(0, 0, rng.uniform(0, 3)))
            if kind == "emberfen" and i % 2 == 0:
                sphere(f"emb{i}", (math.cos(a) * d + 0.02, math.sin(a) * d - r * 0.6, r * 0.6), (r * 0.35, 0.02, r * 0.25), toon("ember", emission=1.4), root, outline=False)
            if kind == "mistwood" and i % 2:
                sphere(f"moss{i}", (math.cos(a) * d, math.sin(a) * d, r * 0.85), (r * 0.8, r * 0.7, r * 0.25), toon("mist_moss"), root, low=True, outline=False)
        if kind == "mistwood":
            _glowcaps(root, "gc", (0.22, 0.06, 0.0), 0.4)
        if kind == "emberfen":
            halo = disc("coalhalo", (0, 0, 0.006), 0.42, radial_material("coalhalo", "ember", 0.35), root)
            halo.visible_shadow = False
        if kind == "harbor":
            for i in range(3):
                sphere(f"shell{i}", (rng.uniform(-0.25, 0.25), rng.uniform(-0.22, -0.05), 0.03), (0.05, 0.04, 0.022), toon(["#f1d9c4", "#f2b8a8", "#f1d9c4"][i]), root)
        contact_shadow(root, radius=0.34, alpha=0.25)


class Glowcaps(Rig):
    """prop-glowcap (Mistwood decor): a big glowing mushroom cluster."""

    def __init__(self):
        root = empty("glowcaps")
        super().__init__(root)
        sphere("moss", (0, 0, 0.02), (0.22, 0.16, 0.05), toon("mist_moss"), root, low=True, smooth=False)
        _glowcaps(root, "a", (0.0, 0.0, 0.0), 1.25)
        _glowcaps(root, "b", (-0.16, 0.06, 0.0), 0.7)

    def pose(self, anim, t):
        pass


class FogBank(Rig):
    """prop-fog (Mistwood decor): a low, soft, translucent mist bank."""

    def __init__(self, seed: int = 57):
        root = empty("fog")
        super().__init__(root)
        rng = random.Random(seed)
        for k, (x, z, r) in enumerate(((-0.42, 0.1, 0.26), (-0.12, 0.2, 0.34), (0.2, 0.14, 0.3), (0.48, 0.08, 0.22), (0.05, 0.02, 0.4))):
            d = disc(f"puff{k}", (x + rng.uniform(-0.03, 0.03), -0.02 * k, z), r, radial_material(f"fogpuff{k}", "mist_white", 0.4), root, scale=(1.25, 0.8, 1))
            d.rotation_euler = (math.radians(55), 0, 0)
            d.visible_shadow = False


class MossLog(Rig):
    """prop-log (Mistwood decor): fallen mossy log with mushrooms."""

    def __init__(self):
        root = empty("log")
        super().__init__(root)
        bark = toon("bark", shadow=0.55)
        cylinder("log", (0, 0, 0.12), 0.12, 0.8, bark, root, verts=9, rot=(0, math.pi / 2, 0.12), smooth=False)
        for sx in (-1, 1):
            disc(f"ring{sx}", (sx * 0.4, sx * 0.05, 0.12), 0.1, toon("wood_light", shadow=0.4), root, scale=(1, 1, 1)).rotation_euler = (0, math.pi / 2, 0.12)
        for k in range(3):
            sphere(f"moss{k}", (-0.25 + k * 0.25, 0.0, 0.22), (0.14, 0.1, 0.05), toon("mist_moss"), root, low=True, smooth=False)
        _glowcaps(root, "gc", (0.12, -0.1, 0.16), 0.5)
        contact_shadow(root, radius=0.45, squash=0.5, alpha=0.3)


class Brazier(Rig):
    """prop-brazier (Emberfen decor): iron bowl on a basalt plinth, fire."""

    def __init__(self):
        root = empty("brazier")
        super().__init__(root)
        iron = toon("#4a4048", shadow=0.5, highlight=0.3)
        cylinder("plinth", (0, 0, 0.08), 0.16, 0.16, toon("basalt_light", shadow=0.5), root, verts=6, smooth=False)
        for k in range(3):
            a = k * TAU / 3 + 0.3
            cylinder(f"leg{k}", (math.cos(a) * 0.08, math.sin(a) * 0.08, 0.3), 0.018, 0.3, iron, root, verts=5, rot=(math.sin(a) * 0.25, -math.cos(a) * 0.25, 0))
        cylinder("bowl", (0, 0, 0.47), 0.17, 0.1, iron, root, verts=10, radius_top=0.2)
        cylinder("coals", (0, 0, 0.52), 0.17, 0.02, toon("ember_deep", emission=1.1), root, verts=10, outline=False)
        self.flames = []
        for k, (x, y, h, r) in enumerate(((0.0, 0.0, 0.34, 0.09), (-0.07, 0.03, 0.22, 0.06), (0.07, 0.02, 0.24, 0.06))):
            from creatures import teardrop

            p = empty(f"fl{k}", (x, y, 0.52), root)
            teardrop(f"flo{k}", (0, 0, 0), r, h, toon("ember", shadow=0.3, highlight=0.35, rim=0.3), p, bend=0.1 * (k - 1))
            teardrop(f"flc{k}", (0, -r * 0.35, r * 0.15), r * 0.55, h * 0.6, toon("flame_core", emission=1.2), p, outline=False)
        halo = disc("halo", (0, -0.1, 0.62), 0.42, radial_material("brazierhalo", "ember_glow", 0.5), root)
        halo.rotation_euler = (math.pi / 2, 0, 0)
        halo.visible_shadow = False
        contact_shadow(root, radius=0.26, alpha=0.3)


class Crates(Rig):
    """prop-crates (Harbor decor): stacked crates, a barrel, rope coil."""

    def __init__(self):
        root = empty("crates")
        super().__init__(root)
        wood, dark = toon("wood"), toon("dock_wood_dark")
        for k, (x, y, z, s, r) in enumerate(((-0.14, 0.04, 0.13, 0.26, 0.1), (0.15, 0.06, 0.12, 0.24, -0.15), (-0.06, 0.06, 0.38, 0.22, 0.3))):
            box(f"crate{k}", (x, y, z), (s, s, s), wood, root, rot=(0, 0, r), bevel=0.01)
            box(f"slat{k}", (x, y - s / 2 - 0.005, z), (s * 0.95, 0.01, 0.04), dark, root, rot=(0, 0, r), outline=False)
        cylinder("barrel", (0.24, -0.18, 0.15), 0.11, 0.3, toon("#9b6a43"), root, verts=12)
        for z in (0.06, 0.24):
            cylinder(f"hoop{z}", (0.24, -0.18, z), 0.113, 0.025, toon("#4a4048"), root, verts=12, outline=False)
        cylinder("coil", (-0.24, -0.2, 0.03), 0.1, 0.05, toon("rope"), root, verts=14)
        contact_shadow(root, radius=0.42, squash=0.7, alpha=0.3)


class Rowboat(Rig):
    """prop-boat: little clinker rowboat with oars (player boat + moored)."""

    def __init__(self, facing_deg: float = 90.0, scale: float = 0.7):
        root = empty("boat")
        root.rotation_euler.z = math.radians(facing_deg)
        root.scale = (scale,) * 3
        super().__init__(root)
        hull = toon("boat_hull", shadow=0.5)
        trim = toon("boat_trim", shadow=0.45)
        inner = toon("dock_wood_light", shadow=0.45)
        verts, faces = [], []
        segs = 10
        for i in range(segs + 1):
            u = i / segs
            y = -0.5 + u
            w = 0.27 * math.sin(math.pi * (0.08 + 0.84 * u)) ** 0.7
            for z, k in ((0.24, 1.0), (0.0, 0.45)):
                verts.append((-w * k, y, z))
                verts.append((w * k, y, z))
        for i in range(segs):
            a = i * 4
            b = a + 4
            # outer port, starboard, bottom
            faces.append((a + 0, b + 0, b + 2, a + 2))
            faces.append((a + 3, b + 3, b + 1, a + 1))
            faces.append((a + 2, b + 2, b + 3, a + 3))
        obj = mesh_from("hull", verts, faces, hull, root, smooth=False)
        from creatures import _recalc_normals

        _recalc_normals(obj)
        box("floor", (0, 0, 0.12), (0.34, 0.74, 0.02), inner, root, outline=False)
        for y in (-0.15, 0.18):
            box(f"thwart{y}", (0, y, 0.18), (0.46, 0.07, 0.03), trim, root)
        cylinder("gunwale", (0, 0, 0.245), 0.01, 0.01, trim, root, verts=4, outline=False)
        for sx in (-1, 1):
            p = empty(f"oar{sx}", (sx * 0.24, 0.02, 0.22), root)
            p.rotation_euler = (0.1, sx * 0.25, sx * 0.4)
            cylinder(f"shaft{sx}", (sx * 0.1, 0, 0), 0.014, 0.5, toon("wood_light"), p, verts=6, rot=(0, math.pi / 2, 0))
            box(f"blade{sx}", (sx * 0.36, 0, 0), (0.14, 0.07, 0.012), toon("wood_light"), p)
        cylinder("lamp", (0, -0.42, 0.33), 0.012, 0.18, toon("#4a4048"), root, verts=5)
        box("lampglass", (0, -0.42, 0.44), (0.06, 0.06, 0.07), toon("window", emission=1.3), root)
        contact_shadow(root, radius=0.45, squash=0.6, alpha=0.25)


class Haybale(Rig):
    """prop-hay (Fields decor): round hay bales."""

    def __init__(self):
        root = empty("hay")
        super().__init__(root)
        hay, hay2 = toon("hay"), toon("hay_dark")
        cylinder("bale", (-0.08, 0.04, 0.18), 0.18, 0.3, hay, root, verts=14, rot=(math.pi / 2, 0, 0.5))
        disc("face", (-0.08 - 0.15 * math.sin(0.5), 0.04 - 0.15 * math.cos(0.5), 0.18), 0.16, hay2, root).rotation_euler = (math.pi / 2, 0, 0.5)
        cylinder("bale2", (0.2, -0.08, 0.13), 0.13, 0.22, hay, root, verts=12, rot=(math.pi / 2, 0, -0.3))
        for k in range(4):
            sphere(f"straw{k}", (-0.2 + k * 0.12, -0.2, 0.01), (0.06, 0.01, 0.006), hay2, root, outline=False, rot=(0, 0, k))
        contact_shadow(root, radius=0.38, squash=0.7, alpha=0.3)


class Signpost(Rig):
    """prop-signpost (Fields decor): crossroads signpost."""

    def __init__(self):
        root = empty("sign")
        super().__init__(root)
        post = toon("bark")
        board = toon("wood_light")
        cylinder("post", (0, 0, 0.45), 0.035, 0.9, post, root, verts=8)
        cylinder("foot", (0, 0, 0.03), 0.08, 0.06, toon("stone"), root, verts=8)
        for k, (z, a, w) in enumerate(((0.78, 0.25, 0.42), (0.62, -0.3, 0.36), (0.48, 0.15, 0.32))):
            p = empty(f"arm{k}", (0, 0, z), root)
            p.rotation_euler = (0, 0, a)
            box(f"board{k}", (w / 2 * (1 if k != 1 else -1), -0.04, 0), (w, 0.03, 0.09), board, p)
            cylinder(f"tip{k}", ((w + 0.03) * (1 if k != 1 else -1), -0.04, 0), 0.06, 0.03, board, p, verts=3, rot=(math.pi / 2, 0, 0 if k != 1 else math.pi), smooth=False)
        _flower("sf", (-0.1, -0.08, 0.02), root, "cornflower", size=0.03, outline=True)
        _flower("sf2", (0.1, -0.05, 0.02), root, "petal_gold", size=0.03, outline=True)
        contact_shadow(root, radius=0.22, alpha=0.3)


class Wildflowers(Rig):
    """prop-wildflowers (Fields decor): a cushion of flowers."""

    def __init__(self, seed: int = 58):
        root = empty("wild")
        super().__init__(root)
        rng = random.Random(seed)
        _canopy(root, rng, 3, ["fields_grass_light", "fields_grass"], spread=0.14, z=0.06, radius=(0.12, 0.16))
        for k in range(9):
            a, d = rng.uniform(0, TAU), rng.uniform(0, 0.22)
            _flower(f"wf{k}", (math.cos(a) * d, math.sin(a) * d * 0.8 - 0.04, 0.12 + rng.uniform(0, 0.08)), root, ["petal_gold", "cornflower", "petal", "rose"][k % 4], size=0.035, outline=True)
        contact_shadow(root, radius=0.3, alpha=0.22)


# --- cottage interior ----------------------------------------------------
class Fireplace(Rig):
    """prop-hearth: stone fireplace with mantel, fire and kettle."""

    def __init__(self):
        root = empty("fireplace")
        super().__init__(root)
        stones = [toon(c, shadow=0.5, highlight=0.25) for c in ("stone", "#c9c2b0", "stone_dark")]
        box("back", (0, 0.12, 0.42), (0.86, 0.22, 0.84), stones[2], root)
        for k in range(4):
            for j in range(3):
                x = -0.3 + j * 0.3 + (0.15 if k % 2 else 0)
                if abs(x) > 0.42:
                    continue
                box(f"blk{k}{j}", (x, 0.005, 0.12 + k * 0.2), (0.27, 0.04, 0.18), stones[(k + j) % 2], root, bevel=0.015)
        box("opening", (0, -0.02, 0.2), (0.44, 0.06, 0.32), toon("#2a2230", shadow=0.0, rim=0.0), root, outline=False)
        box("mantel", (0, -0.04, 0.52), (0.98, 0.18, 0.06), toon("bark"), root)
        box("hearthstone", (0, -0.2, 0.025), (0.9, 0.26, 0.05), stones[0], root)
        from creatures import teardrop

        for k, (x, h, r) in enumerate(((0.0, 0.24, 0.07), (-0.08, 0.16, 0.05), (0.08, 0.18, 0.05))):
            p = empty(f"fire{k}", (x, -0.04, 0.08), root)
            teardrop(f"fo{k}", (0, 0, 0), r, h, toon("ember", shadow=0.3, highlight=0.35, rim=0.3), p, bend=0.1 * (k - 1))
            teardrop(f"fc{k}", (0, -r * 0.35, r * 0.15), r * 0.55, h * 0.6, toon("flame_core", emission=1.2), p, outline=False)
        for k in range(3):
            cylinder(f"log{k}", (-0.08 + k * 0.08, -0.03, 0.06), 0.03, 0.3, toon("bark_dark"), root, verts=6, rot=(0, math.pi / 2, 0.3 * (k - 1)))
        halo = disc("halo", (0, -0.12, 0.2), 0.4, radial_material("firehalo", "ember_glow", 0.5), root)
        halo.rotation_euler = (math.pi / 2, 0, 0)
        halo.visible_shadow = False
        # Mantel dressing.
        sphere("jar", (-0.3, -0.04, 0.6), (0.05, 0.05, 0.06), toon("#5f8a96"), root)
        crescent_mesh("charm", 0.05, 0.015, toon("banner_gold", emission=0.9), root, loc=(0.0, -0.09, 0.66), outline=False)
        cylinder("candle", (0.3, -0.04, 0.6), 0.025, 0.08, toon("cream"), root, verts=8)
        sphere("cflame", (0.3, -0.04, 0.665), (0.018, 0.018, 0.03), toon("flame_core", emission=1.4), root, outline=False)
        sphere("kettle", (0.3, -0.24, 0.1), (0.09, 0.08, 0.07), toon("#a8714a"), root)
        cylinder("spout", (0.39, -0.24, 0.12), 0.018, 0.09, toon("#a8714a"), root, verts=6, rot=(0, 1.0, 0))


class Bookcase(Rig):
    """prop-shelf: tall bookcase with books, jars and a plant."""

    def __init__(self, seed: int = 61):
        root = empty("bookcase")
        super().__init__(root)
        rng = random.Random(seed)
        wood, dark = toon("wood"), toon("bark")
        w, d, h = 0.62, 0.26, 1.28
        box("back", (0, 0.11, h / 2), (w, 0.04, h), dark, root, outline=False)
        for sx in (-1, 1):
            box(f"side{sx}", (sx * w / 2, 0, h / 2), (0.05, d, h), wood, root)
        box("top", (0, 0, h), (w + 0.08, d + 0.04, 0.05), wood, root)
        cols = ["#c8574a", "#5f8a96", "#e8b85a", "#8e6a9e", "#6f9a5a", "#3f5f8a", "#b9502e"]
        for s, z in enumerate((0.04, 0.36, 0.68, 0.98)):
            box(f"shelf{s}", (0, 0, z), (w, d, 0.035), wood, root)
            if s == 3:
                continue
            x = -w / 2 + 0.05
            k = 0
            while x < w / 2 - 0.08:
                bw = rng.uniform(0.04, 0.065)
                bh = rng.uniform(0.18, 0.26)
                tilt = 0.25 if rng.random() < 0.12 else 0.0
                box(f"book{s}{k}", (x + bw / 2, -0.01, z + 0.02 + bh / 2), (bw, 0.18, bh), toon(cols[rng.randrange(len(cols))], shadow=0.45), root, rot=(0, tilt, 0), outline=False)
                x += bw + 0.006
                k += 1
                if s == 1 and k == 4:
                    sphere("jar", (x + 0.06, -0.02, z + 0.1), (0.055, 0.055, 0.08), toon("water_light", shadow=0.35), root)
                    x += 0.13
        # Top shelf: potted plant + scroll.
        cylinder("pot", (-0.14, -0.01, 1.06), 0.06, 0.1, toon("#c8743a"), root, verts=10)
        _canopy(empty("plant", (-0.14, -0.01, 1.1), root), random.Random(3), 3, ["leaf", "leaf_light"], spread=0.05, z=0.04, radius=(0.05, 0.07))
        cylinder("scroll", (0.12, -0.02, 1.04), 0.03, 0.2, toon("plaster"), root, verts=8, rot=(0, math.pi / 2, 0.3))
        contact_shadow(root, radius=0.38, squash=0.5, alpha=0.3)


class Loom(Rig):
    """prop-loom: upright weaving loom with a half-woven lilac cloth."""

    def __init__(self):
        root = empty("loom")
        super().__init__(root)
        wood, dark = toon("wood"), toon("bark")
        for sx in (-1, 1):
            box(f"post{sx}", (sx * 0.32, 0, 0.42), (0.06, 0.06, 0.84), wood, root)
            box(f"foot{sx}", (sx * 0.32, 0, 0.03), (0.08, 0.4, 0.06), dark, root)
        for z in (0.2, 0.8):
            cylinder(f"beam{z}", (0, 0, z), 0.035, 0.7, dark, root, verts=8, rot=(0, math.pi / 2, 0))
        cloth = toon("petal_lilac", shadow=0.45)
        box("cloth", (0, -0.005, 0.37), (0.56, 0.015, 0.32), cloth, root, outline=False)
        for k in range(4):
            box(f"stripe{k}", (0, -0.015, 0.24 + k * 0.08), (0.56, 0.012, 0.02), toon("banner" if k % 2 else "banner_gold", shadow=0.4), root, outline=False)
        thread = toon("cream", shadow=0.3)
        for k in range(8):
            box(f"warp{k}", (-0.25 + k * 0.071, 0.0, 0.65), (0.006, 0.006, 0.3), thread, root, outline=False)
        box("heddle", (0, -0.03, 0.56), (0.62, 0.03, 0.04), wood, root)
        cylinder("shuttle", (0.0, -0.06, 0.53), 0.025, 0.2, toon("#a8714a"), root, verts=8, rot=(0, math.pi / 2, 0))
        cylinder("basket", (0.26, -0.26, 0.08), 0.1, 0.14, toon("hay_dark"), root, verts=12)
        for k, c in enumerate(("rose", "petal_lilac", "banner_gold")):
            sphere(f"yarn{k}", (0.24 + 0.05 * (k - 1), -0.26 + 0.03 * (k % 2), 0.17), (0.05,) * 3, toon(c), root)
        contact_shadow(root, radius=0.4, squash=0.5, alpha=0.3)


class Doorway(Rig):
    """prop-door: open plank door, stone threshold, woven mat and spilled
    daylight; sits in the south wall gap of a cottage."""

    def __init__(self):
        root = empty("door")
        super().__init__(root)
        box("threshold", (0, 0.0, 0.02), (0.84, 0.3, 0.04), toon("stone", shadow=0.5), root)
        light = disc("daylight", (0, 0.28, 0.003), 0.42, radial_material("daylight", "window", 0.4), root, scale=(1.0, 0.8, 1))
        light.visible_shadow = False
        box("mat", (0, 0.36, 0.008), (0.5, 0.24, 0.012), toon("hay_dark", shadow=0.4), root)
        for k in range(3):
            box(f"matl{k}", (0, 0.29 + k * 0.07, 0.016), (0.46, 0.02, 0.006), toon("hay", shadow=0.4), root, outline=False)
        frame = toon("bark")
        for sx in (-1, 1):
            box(f"jamb{sx}", (sx * 0.42, 0.0, 0.32), (0.08, 0.12, 0.64), frame, root)
        door = empty("leaf", (-0.38, 0.06, 0.0), root)
        door.rotation_euler.z = math.radians(-70)
        planks = [toon("wood"), toon("#9a6a44")]
        for k in range(3):
            box(f"plank{k}", (0.06 + k * 0.1, 0, 0.3), (0.1, 0.04, 0.58), planks[k % 2], door)
        box("brace", (0.16, -0.025, 0.3), (0.3, 0.015, 0.04), frame, door, rot=(0, 0.9, 0), outline=False)
        sphere("knob", (0.26, -0.04, 0.3), (0.02, 0.02, 0.02), toon("banner_gold"), door)


class Table(Rig):
    """prop-table: round table with a teapot, cups and a stool."""

    def __init__(self):
        root = empty("table")
        super().__init__(root)
        wood, dark = toon("wood"), toon("bark")
        cylinder("top", (0, 0, 0.36), 0.3, 0.04, wood, root, verts=16)
        cylinder("leg", (0, 0, 0.18), 0.04, 0.34, dark, root, verts=8)
        cylinder("base", (0, 0, 0.02), 0.14, 0.04, dark, root, verts=10)
        sphere("teapot", (0.04, 0.02, 0.44), (0.08, 0.07, 0.07), toon("#5f8a96"), root)
        cylinder("tspout", (0.13, 0.02, 0.45), 0.015, 0.08, toon("#5f8a96"), root, verts=6, rot=(0, 1.0, 0))
        for k, (x, y) in enumerate(((-0.14, -0.08), (0.12, -0.16))):
            cylinder(f"cup{k}", (x, y, 0.41), 0.03, 0.05, toon("cream"), root, verts=8)
        sphere("bread", (-0.12, 0.12, 0.41), (0.07, 0.05, 0.035), toon("#d99a5a"), root)
        cylinder("stool", (0.34, -0.22, 0.12), 0.11, 0.04, wood, root, verts=12)
        for k in range(3):
            a = k * TAU / 3
            cylinder(f"sleg{k}", (0.34 + math.cos(a) * 0.06, -0.22 + math.sin(a) * 0.06, 0.05), 0.012, 0.1, dark, root, verts=4)
        contact_shadow(root, radius=0.4, squash=0.7, alpha=0.3)


class PottedPlant(Rig):
    """prop-plant: clay pot with a leafy plant."""

    def __init__(self):
        root = empty("plant")
        super().__init__(root)
        cylinder("pot", (0, 0, 0.1), 0.11, 0.2, toon("#c8743a"), root, verts=12, radius_top=0.13)
        cylinder("soil", (0, 0, 0.2), 0.115, 0.01, toon("bark_dark"), root, verts=12, outline=False)
        holder = empty("leaves", (0, 0, 0.2), root)
        _canopy(holder, random.Random(9), 4, ["leaf", "leaf_light", "leaf_dark"], spread=0.1, z=0.14, radius=(0.08, 0.12))
        _flower("pf", (0.04, -0.1, 0.36), root, "rose", size=0.03, outline=True)
        contact_shadow(root, radius=0.2, alpha=0.3)


class WallFace(Rig):
    """wall-cottage-face: the cottage back wall seen front-on, seamless in X
    (timber posts sit on the tile seams). Rendered top-down: +Y is up."""

    def __init__(self):
        root = empty("wallface")
        super().__init__(root)
        timber = toon("bark", shadow=0.4, rim=0.0)
        box("plaster", (0, 0, -0.05), (3.0, 3.0, 0.1), toon("plaster", shadow=0.4, rim=0.0), root, outline=False)
        for k in range(8):
            x = -0.5 + (k + 0.5) / 8
            box(f"wain{k}", (x, -0.18, 0.004), (1 / 8 - 0.012, 0.24, 0.008), toon("wood" if k % 2 else "#9a6a44", shadow=0.4, rim=0.0), root, outline=False)
        box("rail", (0, -0.05, 0.012), (1.2, 0.04, 0.01), timber, root, outline=False)
        box("beam", (0, 0.255, 0.012), (1.2, 0.07, 0.01), timber, root, outline=False)
        box("beamshade", (0, 0.212, 0.008), (1.2, 0.018, 0.006), toon("#d8c8a8", shadow=0.4, rim=0.0), root, outline=False)
        for sx in (-0.5, 0.5):
            box(f"post{sx}", (sx, 0.0, 0.016), (0.07, 0.62, 0.012), timber, root, outline=False)
        for k, (x, y) in enumerate(((-0.2, 0.1), (0.18, 0.06))):
            sphere(f"fleck{k}", (x, y, 0.004), (0.03, 0.012, 0.004), toon("#e3d4b4", shadow=0.4, rim=0.0), root, outline=False)


BUILDERS = {
    "wall-face": WallFace,
    "biome-ground": BiomeGround,
    "fen-backdrop": FenBackdrop,
    "mist-backdrop": MistBackdrop,
    "drystone": DrystoneWall,
    "pinewall": PineWall,
    "fenwall": FenWall,
    "seawall": SeaWall,
    "mist-pine": MistPine,
    "charred-tree": CharredTree,
    "dark-fern": Fern,
    "reeds": Reeds,
    "dune-grass": DuneGrass,
    "moss-stone": MossStone,
    "basalt": BasaltColumns,
    "ballast": BallastStones,
    "pebble-kind": PebbleKind,
    "glowcaps": Glowcaps,
    "fog": FogBank,
    "moss-log": MossLog,
    "brazier": Brazier,
    "crates": Crates,
    "boat": Rowboat,
    "hay": Haybale,
    "signpost": Signpost,
    "wildflowers": Wildflowers,
    "fireplace": Fireplace,
    "bookcase": Bookcase,
    "loom": Loom,
    "doorway": Doorway,
    "table": Table,
    "plant": PottedPlant,
}
