"""Archipelago / Harbor ocean kit (#412).

Same stage, light rig and toon palette as biomes.py. Top-down (pitch 90),
+Y is screen-up (grid north), 1 unit = 1 tile.

  * `OceanTile` — seamless open water. Every deep and shallow variant shares
    the items that touch the tile border (seeded "ocean-edge", wrapped 3x3),
    so any variant sits next to any other; deep variants add dark swells and
    the odd whitecap inside, shallow variants lighter patches and caustics.
  * `ShoreQuad` — one transparent tile *quadrant* (the NE one; the game
    turns it in 90° steps about the tile centre). Bands follow one signed
    distance field around the quadrant's outer corner (see "Shore
    quadrants"), so pieces always join: straight coasts wobble a little,
    convex island corners are rounded, concave ones filleted. Cases:
        edge-n / edge-e  the other region lies past local N / E and continues
        end-n / end-e    ... past N / E but stops at the corner (convex end)
        inner            past both sides
        outer            only past the NE corner point
    Families: "sand" (island beach + foam + lagoon tint, water side),
    "land" (sand rim inside the island tile), "foam" (quay / sea-wall foam).
  * `PierTop` — transparent pier planks + posts with their shadow on the
    water, drawn over a water tile (dock tiles).
"""

from __future__ import annotations

import math
import random

from models import TAU, Rig
from biomes import _copies
from stage import alpha_material, box, cylinder, empty, mesh_from, sphere, toon

# --------------------------------------------------------------------------
# Open water
# --------------------------------------------------------------------------
class OceanTile(Rig):
    def __init__(self, depth: str = "deep", seed: int = 1):
        _ALPHA.clear()
        root = empty("ocean")
        super().__init__(root)
        self.root = root
        box("water", (0, 0, -0.05), (3.2, 3.2, 0.1), toon("sea", shadow=0.3, rim=0.0), root, outline=False)
        shared = random.Random("ocean-edge")
        rng = random.Random(f"{depth}:{seed}")
        swell = toon("#4689b9", shadow=0.3, rim=0.0)
        trough = toon("sea_dark", shadow=0.3, rim=0.0)
        light = toon("sea_light", shadow=0.2, rim=0.0)
        ripple = toon("#7db8dc", shadow=0.2, rim=0.0)
        bright = toon("#5ba3cd", shadow=0.3, rim=0.0)

        def place(r, count, edge, size, mat, tag, z, aspect):
            """Border items wrap (shared seed); interior items must fit
            strictly inside so they never cut a tile edge."""
            made, guard = 0, 0
            while made < count and guard < 4000:
                guard += 1
                u, v = r.random(), r.random()
                s = r.uniform(*size)
                rx, ry = s * aspect[0] + 0.01, s * aspect[1] + 0.01
                inside = rx < u < 1 - rx and ry < v < 1 - ry
                if edge == inside:
                    continue
                for dx, dy, x, y in _copies(u, v, s * aspect[0]):
                    sphere(f"{tag}{made}_{dx}{dy}", (x, y, z), (s * aspect[0], s * aspect[1], 0.004), mat, root, outline=False)
                made += 1

        # Border items: identical in every variant (deep and shallow).
        place(shared, 2, True, (0.13, 0.17), swell, "es", -0.002, (1.7, 0.6))
        place(shared, 2, True, (0.05, 0.08), light, "er", 0.001, (1.6, 0.16))
        place(shared, 2, True, (0.05, 0.08), ripple, "em", 0.001, (1.6, 0.16))
        if depth == "deep":
            # Broad calm swells with one darker trough; the odd whitecap.
            place(rng, 1, False, (0.13, 0.16), swell, "ds", -0.0025, (1.5, 0.6))
            place(rng, 1, False, (0.07, 0.1), trough, "dw", -0.002, (1.6, 0.5))
            place(rng, 2, False, (0.05, 0.09), ripple, "dr", 0.001, (1.6, 0.16))
            if seed % 2:
                cx, cy = rng.uniform(-0.18, 0.18), rng.uniform(-0.18, 0.18)
                foam = toon("#eef7f8", shadow=0.2, rim=0.0)
                sphere("cap0", (cx, cy, 0.002), (0.07, 0.013, 0.004), foam, root, outline=False)
                sphere("cap1", (cx + 0.05, cy - 0.025, 0.002), (0.035, 0.01, 0.004), foam, root, outline=False)
        else:
            # Shallows: lighter sun patches and more glints, no troughs.
            place(rng, 2, False, (0.11, 0.15), bright, "sp", -0.0025, (1.4, 0.75))
            place(rng, 3, False, (0.05, 0.08), light, "sr", 0.001, (1.5, 0.16))
        shine = toon("#eaf6ff", emission=1.0)
        for i in range(1 + seed % 2):
            u, v = rng.uniform(0.18, 0.82), rng.uniform(0.18, 0.82)
            sphere(f"spk{i}", (u - 0.5, v - 0.5, 0.004), (0.014, 0.014, 0.003), shine, root, outline=False)


# --------------------------------------------------------------------------
# Shore quadrants
# --------------------------------------------------------------------------
# Coordinates are "P-coords": the quadrant's outer corner P (the tile corner
# it touches) is (0, 0) and the quadrant itself is Q = [-0.5, 0]^2. The four
# quadrants that meet at P (Q = SW, plus NW / SE / NE) are each water or
# land; `s` is the signed distance from the coastline (> 0 toward water):
#   2 adjacent water quadrants -> straight coast through P (bands wobble)
#   3 water (1 land)           -> convex land corner, rounded by R_CONVEX
#   1 water (3 land)           -> concave corner, water corner rounded by R_CONCAVE
# Every piece is a crop of that one field, so neighbours always agree.
CASES = {
    # case: (a = other past local N, b = other past local E, d = other past NE corner)
    "edge-n": (1, 0, 1),
    "edge-e": (0, 1, 1),
    "end-n": (1, 0, 0),
    "end-e": (0, 1, 0),
    "inner": (1, 1, 1),
    "outer": (0, 0, 1),
}
L = 0.62  # contour half-length (past Q in every direction)
EPS = 0.012  # crop margin: geometry runs past Q so frame-edge pixels are fully covered
N_LINE = 26
N_ARC = 22


def _smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def _lin(a, b, n):
    return [a + (b - a) * i / (n - 1) for i in range(n)]


def _wave_h(u):
    """Along-coast wobble for a horizontal coast; zero at u = -0.5, -0.25, 0."""
    return math.sin(4 * math.pi * u) * 0.9 + 0.35 * math.sin(8 * math.pi * u)


def _wave_v(u):
    return -math.sin(4 * math.pi * u) * 0.7 + 0.45 * math.sin(8 * math.pi * u)


def _rounded_contour(t, radius):
    """Level-t contour of the SDF of the quarter-plane x<0, y<0 with its corner
    rounded by `radius` (canonical orientation), from (-L, t) to (t, -L)."""
    r = radius + t
    corner = min(-radius, t)
    pts = [(x, t) for x in _lin(-L, corner, N_LINE)]
    for a in _lin(math.pi / 2, 0.0, N_ARC)[1:-1]:
        pts.append((-radius + r * math.cos(a), -radius + r * math.sin(a)) if r > 0 else (t, t))
    pts += [(t, y) for y in _lin(corner, -L, N_LINE)]
    return pts


class _Coast:
    def __init__(self, own_water: bool, case: str, amp: float, r_convex: float, r_concave: float):
        a, b, d = CASES[case]
        water = {
            "sw": own_water,
            "nw": own_water != bool(a),
            "se": own_water != bool(b),
            "ne": own_water != bool(d),
        }
        sign = {"sw": (-1, -1), "nw": (-1, 1), "se": (1, -1), "ne": (1, 1)}
        count = sum(water.values())
        self.amp = amp
        if count == 3 or count == 1:
            # The odd quadrant out: land (convex) or water (concave).
            odd = next(k for k, w in water.items() if w == (count == 1))
            self.kind = "convex" if count == 3 else "concave"
            self.k = sign[odd]
            self.radius = r_convex if count == 3 else r_concave
        elif water["sw"] == water["nw"] and water["sw"] != water["se"]:
            # Vertical coast along x = 0; water on the side of SW iff SW is water.
            self.kind = "vertical"
            self.k = (-1 if water["sw"] else 1, 0)
        elif water["sw"] == water["se"] and water["sw"] != water["nw"]:
            self.kind = "horizontal"
            self.k = (0, -1 if water["sw"] else 1)
        else:
            raise ValueError(f"unsupported shore case {case} own_water={own_water}")

    def wob(self, s):
        return self.amp * _smooth(0.0, 0.07, abs(s)) * (1 - _smooth(0.24, 0.4, abs(s)))

    def contour(self, s):
        if self.kind == "horizontal":
            # Water toward y * k; coast at y = 0 -> contour y = k * s.
            ky = self.k[1]
            return [(x, ky * (s + self.wob(s) * _wave_h(x))) for x in _lin(-L, L, 2 * N_LINE)]
        if self.kind == "vertical":
            kx = self.k[0]
            return [(kx * (s + self.wob(s) * _wave_v(y)), y) for y in _lin(-L, L, 2 * N_LINE)]
        # Canonical K = SW quadrant; mirror into the odd quadrant's corner.
        t = s if self.kind == "convex" else -s
        kx, ky = self.k
        return [(-kx * x, -ky * y) for x, y in _rounded_contour(t, self.radius)]


def _clip(poly, x0, y0, x1, y1):
    """Sutherland-Hodgman clip of a polygon to an axis-aligned rectangle."""

    def cut(pts, inside, inter):
        out = []
        for i, p in enumerate(pts):
            q = pts[i - 1]
            if inside(p):
                if not inside(q):
                    out.append(inter(q, p))
                out.append(p)
            elif inside(q):
                out.append(inter(q, p))
        return out

    def ix(xc):
        return lambda p, q: (xc, p[1] + (q[1] - p[1]) * (xc - p[0]) / (q[0] - p[0]))

    def iy(yc):
        return lambda p, q: (p[0] + (q[0] - p[0]) * (yc - p[1]) / (q[1] - p[1]), yc)

    for inside, inter in (
        (lambda p: p[0] >= x0, ix(x0)),
        (lambda p: p[0] <= x1, ix(x1)),
        (lambda p: p[1] >= y0, iy(y0)),
        (lambda p: p[1] <= y1, iy(y1)),
    ):
        if not poly:
            break
        poly = cut(poly, inside, inter)
    return poly


def _area(poly):
    return 0.5 * sum(poly[i - 1][0] * p[1] - p[0] * poly[i - 1][1] for i, p in enumerate(poly))


def _band(coast, root, name, s0, s1, mat, z):
    a = coast.contour(s0)
    b = coast.contour(s1)
    lo, hi = -0.5 - EPS, EPS
    verts, faces = [], []
    for i in range(len(a) - 1):
        poly = _clip([a[i], a[i + 1], b[i + 1], b[i]], lo, lo, hi, hi)
        if len(poly) < 3 or abs(_area(poly)) < 1e-7:
            continue
        if _area(poly) < 0:
            poly.reverse()  # +Z normals (toon shading is lit from above)
        base = len(verts)
        verts += [(x, y, z) for x, y in poly]
        faces.append(tuple(range(base, base + len(poly))))
    if faces:
        mesh_from(name, verts, faces, mat, root, outline=False)


_ALPHA: dict = {}


def _tint(color: str, alpha: float):
    key = (color, alpha)
    if key not in _ALPHA:

        def build(nt):
            v = nt.nodes.new("ShaderNodeValue")
            v.outputs[0].default_value = alpha
            return v.outputs[0]

        _ALPHA[key] = alpha_material(f"tint:{color}:{alpha}", color, build)
    return _ALPHA[key]


FOAM = "#eef7f8"
# Bands by signed coast distance s (> 0 toward water): (s0, s1, color, alpha
# or None for an opaque toon surface). Lagoon tint fades out before s = 0.42
# so nothing reaches a tile's centre lines.
SAND_BANDS = [
    (-0.14, 0.105, "sand", None),
    (0.105, 0.155, "sand_wet", None),
    (0.155, 0.215, FOAM, None),
    (0.215, 0.28, "lagoon", 0.62),
    (0.28, 0.34, "lagoon", 0.42),
    (0.34, 0.39, "lagoon", 0.24),
    (0.39, 0.42, "lagoon", 0.1),
]
FAMILIES = {
    # Island coast seen from a water tile (beach, foam line, lagoon tint).
    "sand": {"own_water": True, "amp": 0.026, "r": (0.42, 0.3), "bands": [(-0.5, *SAND_BANDS[0][1:]), *SAND_BANDS[1:]], "foam": 0.185, "dashes": 0.3},
    # The same coast inside the island tile: sand rim over the grass edge;
    # a rounded convex corner also shows its water tip (opaque sea under it).
    "land": {"own_water": False, "amp": 0.026, "r": (0.42, 0.3), "bands": SAND_BANDS, "sea": 0.215, "foam": 0.185, "scallops": -0.128},
    # Quay / sea wall: no beach, a dark wet line, foam, a pale wash.
    "foam": {
        "own_water": True,
        "amp": 0.012,
        "r": (0.06, 0.06),
        "bands": [
            (-0.5, 0.035, "navy", 0.3),
            (0.035, 0.095, FOAM, None),
            (0.095, 0.17, "sea_light", 0.34),
            (0.17, 0.27, "sea_light", 0.18),
            (0.27, 0.38, "sea_light", 0.07),
        ],
        "foam": 0.065,
        "dashes": 0.2,
    },
}


class ShoreQuad(Rig):
    def __init__(self, family: str = "sand", case: str = "edge-n", seed: int = 1):
        _ALPHA.clear()  # stage.reset_scene() dropped last spec's materials
        frame = empty("shore")
        super().__init__(frame)
        # P-coords: Q = [-0.5, 0]^2 is centred on the frame.
        root = empty("quad", (0.25, 0.25, 0), frame)
        self.root = root
        fam = FAMILIES[family]
        coast = _Coast(fam["own_water"], case, fam["amp"], *fam["r"])
        rng = random.Random(f"{family}:{case}:{seed}")
        z = 0.0
        if "sea" in fam:
            _band(coast, root, "sea", fam["sea"], 3.0, toon("sea", shadow=0.3, rim=0.0), -0.002)
        for i, (s0, s1, color, alpha) in enumerate(fam["bands"]):
            mat = toon(color, shadow=0.35, highlight=0.15, rim=0.0) if alpha is None else _tint(color, alpha)
            _band(coast, root, f"b{i}", s0, s1, mat, z + 0.001 * i)

        def along(s, count, margin, jitter=0.0):
            """Points spread along the level-s contour that sit inside Q."""
            pts = [p for p in coast.contour(s) if min(-p[0], -p[1], p[0] + 0.5, p[1] + 0.5) > margin]
            if not pts:
                return []
            out = []
            for i in range(count):
                k = (i + rng.uniform(0.5 - jitter, 0.5 + jitter)) / count
                out.append(pts[min(len(pts) - 1, int(k * len(pts)))])
            return out

        bubble = toon("#f6fbfb", shadow=0.2, highlight=0.0, rim=0.0)
        for i, (x, y) in enumerate(along(fam["foam"], 8, 0.04, 0.35)):
            r = rng.uniform(0.011, 0.02)
            sphere(f"bub{i}", (x + rng.uniform(-0.008, 0.008), y + rng.uniform(-0.008, 0.008), 0.012), (r, r, 0.004), bubble, root, outline=False)
        if "dashes" in fam:
            dash = _tint("#f6fbfb", 0.5)
            pts = along(fam["dashes"], 3, 0.06, 0.3)
            for i, (x, y) in enumerate(pts):
                # Orient along the contour (finite difference on the level set).
                c = coast.contour(fam["dashes"])
                j = min(range(len(c)), key=lambda n: (c[n][0] - x) ** 2 + (c[n][1] - y) ** 2)
                j2 = min(len(c) - 1, j + 1)
                rot = math.atan2(c[j2][1] - c[j][1], c[j2][0] - c[j][0]) if j2 != j else 0.0
                sphere(f"dash{i}", (x, y, 0.011), (0.045, 0.008, 0.003), dash, root, outline=False, rot=(0, 0, rot))
        if "scallops" in fam:
            # Ragged sand over the grass edge, then a shell or pebble.
            sand = toon("sand", shadow=0.35, highlight=0.15, rim=0.0)
            for i, (x, y) in enumerate(along(fam["scallops"], 6, 0.05, 0.2)):
                r = rng.uniform(0.028, 0.04)
                sphere(f"sc{i}", (x, y, 0.0005), (r * 1.3, r, 0.003), sand, root, outline=False, rot=(0, 0, rng.uniform(0, TAU)))
            spots = along(-0.06, 1, 0.07, 0.3)
            for x, y in spots:
                if rng.random() < 0.5:
                    sphere("shell", (x, y, 0.008), (0.022, 0.018, 0.01), toon("#f1d9c4"), root, outline=True, rot=(0, 0, rng.uniform(0, TAU)))
                else:
                    sphere("peb", (x, y, 0.008), (0.026, 0.02, 0.012), toon("stone"), root, low=True, smooth=False)


# --------------------------------------------------------------------------
# Pier over water
# --------------------------------------------------------------------------
class PierTop(Rig):
    """Planks running N-S, two posts at the south end, the pier's shadow on
    the water (falls up-right with the key light) and ripple rings at the
    posts. Transparent everywhere else: the water tile shows through."""

    def __init__(self, seed: int = 1):
        _ALPHA.clear()
        root = empty("pier")
        super().__init__(root)
        self.root = root
        shadow = _tint("navy", 0.3)
        box("shadow", (0.06, 0.02, -0.004), (0.76, 1.04, 0.002), shadow, root, outline=False)
        under = toon("dock_wood_dark", shadow=0.4, rim=0.0)
        for sx in (-1, 1):
            box(f"stringer{sx}", (sx * 0.3, 0, 0.004), (0.05, 1.03, 0.008), under, root, outline=False)
        cols = [toon(c, shadow=0.4, highlight=0.2, rim=0.0) for c in ("dock_wood", "dock_wood_light", "#9a7650", "dock_wood")]
        for i in range(5):
            x = -0.3 + i * 0.15
            box(f"pl{i}", (x, 0, 0.012), (0.135, 1.03, 0.012), cols[i % len(cols)], root, outline=False)
        seam = toon("dock_wood_dark", shadow=0.4, rim=0.0)
        box("seam", (0, 0.08, 0.019), (0.74, 0.012, 0.002), seam, root, outline=False)
        nail = toon("#5a4c48", shadow=0.3, rim=0.0)
        for i in range(5):
            for y in (-0.42, 0.08):
                sphere(f"pn{i}{y}", (-0.3 + i * 0.15, y + 0.03, 0.02), (0.009, 0.009, 0.003), nail, root, outline=False)
        ring = _tint("#f6fbfb", 0.45)
        post = toon("dock_wood_dark", shadow=0.5)
        for sx in (-1, 1):
            sphere(f"ring{sx}", (sx * 0.39, -0.35, -0.002), (0.085, 0.06, 0.002), ring, root, outline=False)
            cylinder(f"post{sx}", (sx * 0.39, -0.35, 0.03), 0.05, 0.06, post, root, verts=10)


BUILDERS = {
    "ocean": OceanTile,
    "shore-quad": ShoreQuad,
    "pier-top": PierTop,
}
