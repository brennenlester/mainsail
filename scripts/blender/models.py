"""Procedural low-poly models for Ivyward renders (#359/#360).

Units: 1 Blender unit = 1 world tile (48 logical px). Characters face -Y
(toward the camera) at facing 0. Each builder returns a Rig whose
`pose(anim, t)` sets transforms for normalized time t in [0, 1).
"""

from __future__ import annotations

import math
import random

from stage import (
    box,
    contact_shadow,
    cylinder,
    empty,
    mesh_from,
    radial_material,
    disc,
    sphere,
    toon,
)

TAU = math.pi * 2


def keyframes(keys: list[tuple[float, float]], t: float) -> float:
    """Piecewise-linear lookup over (time, value) pairs sorted by time."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            u = (t - t0) / max(1e-6, t1 - t0)
            u = u * u * (3 - 2 * u)
            return v0 + (v1 - v0) * u
    return keys[-1][1]


class Rig:
    def __init__(self, root):
        self.root = root

    def pose(self, anim: str, t: float) -> None:  # pragma: no cover - overridden
        pass


def _face_decals(parent, eye_x, eye_y, eye_z, eye_scale, blush_x, blush_y, blush_z):
    eye_mat = toon("eye", shadow=0.0, highlight=0.0, rim=0.0)
    shine = toon("#ffffff", emission=1.0)
    blush = toon("blush", shadow=0.2, highlight=0.0, rim=0.0)
    eyes = []
    for side in (-1, 1):
        eye = sphere(f"eye{side}", (side * eye_x, eye_y, eye_z), eye_scale, eye_mat, parent, outline=False)
        # Child of the unit eye sphere: local coords are in eye-radius units.
        sphere(f"shine{side}", (-0.3, -0.9, 0.38), (0.36, 0.3, 0.27), shine, eye, outline=False)
        eyes.append(eye)
        sphere(f"blush{side}", (side * blush_x, blush_y, blush_z), (eye_scale[0] * 1.1, 0.015, eye_scale[2] * 0.45), blush, parent, outline=False)
    return eyes


# --------------------------------------------------------------------------
# Mossling
# --------------------------------------------------------------------------
class Mossling(Rig):
    def __init__(self, facing_deg: float = 0.0, scale: float = 1.0):
        root = empty("mossling")
        root.rotation_euler.z = math.radians(facing_deg)
        root.scale = (scale, scale, scale)
        super().__init__(root)
        self.mover = empty("mover", parent=root)
        self.body = empty("body", parent=self.mover)
        moss = toon("moss")
        dark = toon("moss_dark")
        leaf = toon("moss_light")

        sphere("torso", (0, 0, 0.34), (0.38, 0.35, 0.33), moss, self.body)
        for i, (x, y, z, r) in enumerate(((0.16, 0.16, 0.6, 0.11), (-0.12, 0.2, 0.58, 0.1), (0.0, 0.27, 0.46, 0.12), (0.26, 0.12, 0.45, 0.09))):
            sphere(f"tuft{i}", (x, y, z), (r, r, r * 0.8), dark, self.body, low=True, smooth=False)
        self.eyes = _face_decals(self.body, 0.125, -0.305, 0.4, (0.055, 0.03, 0.075), 0.225, -0.27, 0.31)
        sphere("mouth", (0, -0.337, 0.325), (0.03, 0.01, 0.012), toon("eye", shadow=0.0, highlight=0.0, rim=0.0), self.body, outline=False)
        self.ears = []
        for side in (-1, 1):
            pivot = empty(f"ear{side}", (side * 0.3, 0.02, 0.46), self.body)
            pivot.rotation_euler = (0, math.radians(-28), 0 if side > 0 else math.pi)
            sphere(f"earleaf{side}", (0.16, 0, 0), (0.17, 0.035, 0.08), dark, pivot)
            self.ears.append(pivot)
        self.sprout = empty("sprout", (0, 0.0, 0.64), self.body)
        cylinder("stem", (0, 0, 0.07), 0.02, 0.15, dark, self.sprout, verts=8)
        for side in (-1, 1):
            p = empty(f"sleaf{side}", (0, 0, 0.14), self.sprout)
            p.rotation_euler = (0, math.radians(-30), 0 if side > 0 else math.pi)
            sphere(f"sleafm{side}", (0.1, 0, 0), (0.11, 0.03, 0.05), leaf, p)
        for side in (-1, 1):
            sphere(f"foot{side}", (side * 0.17, -0.1, 0.05), (0.1, 0.12, 0.06), dark, self.mover)
        contact_shadow(root, radius=0.4, squash=0.9, alpha=0.3)

    def pose(self, anim: str, t: float) -> None:
        mv, body = self.mover, self.body
        mv.location = (0, 0, 0)
        body.rotation_euler = (0, 0, 0)
        for eye in self.eyes:
            eye.scale = (0.055, 0.03, 0.075)
        s = math.sin(TAU * t)
        if anim == "idle":
            body.scale = (1 - 0.03 * s, 1 - 0.03 * s, 1 + 0.055 * s)
            self.sprout.rotation_euler = (0, 0.16 * math.sin(TAU * t + 0.8), 0)
            for i, ear in enumerate(self.ears):
                ear.rotation_euler.y = math.radians(-28) - 0.12 * s
            return
        if anim == "attack":
            fwd = keyframes([(0, 0.0), (0.2, 0.08), (0.4, -0.24), (0.55, -0.27), (0.8, -0.08), (1, 0.0)], t)
            sz = keyframes([(0, 1.0), (0.2, 0.84), (0.4, 1.14), (0.55, 0.86), (0.8, 1.04), (1, 1.0)], t)
            tilt = keyframes([(0, 0.0), (0.2, 0.18), (0.4, -0.3), (0.55, -0.2), (1, 0.0)], t)
            mv.location = (0, fwd, max(0.0, -fwd * 0.25))
            sxy = 1 / math.sqrt(sz)
            body.scale = (sxy, sxy, sz)
            body.rotation_euler = (tilt, 0, 0)
            self.sprout.rotation_euler = (-tilt * 1.5, 0, 0)
            for ear in self.ears:
                ear.rotation_euler.y = math.radians(-28) + tilt * 0.8
            return
        if anim == "hurt":
            back = keyframes([(0, 0.2), (0.3, 0.24), (0.65, 0.1), (1, 0.03)], t)
            sz = keyframes([(0, 0.82), (0.3, 0.9), (0.65, 1.04), (1, 1.0)], t)
            mv.location = (0, back, 0)
            sxy = 1 / math.sqrt(sz)
            body.scale = (sxy, sxy, sz)
            body.rotation_euler = (keyframes([(0, 0.32), (0.65, 0.1), (1, 0.0)], t), 0, 0)
            squint = keyframes([(0, 0.2), (0.6, 0.25), (1, 0.8)], t)
            for eye in self.eyes:
                eye.scale = (0.06, 0.03, 0.075 * squint)
            for ear in self.ears:
                ear.rotation_euler.y = math.radians(-28) + 0.35
            return
        body.scale = (1, 1, 1)


# --------------------------------------------------------------------------
# Player (Wanderer)
# --------------------------------------------------------------------------
class Player(Rig):
    def __init__(self, facing_deg: float = 0.0):
        root = empty("player")
        root.rotation_euler.z = math.radians(facing_deg)
        super().__init__(root)
        tunic = toon("teal")
        sleeve = toon("teal_dark")
        pants = toon("pants")
        boot = toon("boot")
        skin = toon("skin", shadow=0.38)
        hair = toon("hair")
        scarf = toon("scarf")
        leather = toon("satchel")

        self.hip = empty("hip", (0, 0, 0.36), root)
        self.legs = []
        for side in (-1, 1):
            p = empty(f"leg{side}", (side * 0.085, 0, 0), self.hip)
            cylinder(f"thigh{side}", (0, 0, -0.15), 0.06, 0.28, pants, p, verts=10)
            sphere(f"boot{side}", (0, -0.035, -0.31), (0.072, 0.105, 0.06), boot, p)
            self.legs.append(p)
        self.torso = empty("torso", (0, 0, 0.0), self.hip)
        cylinder("tunic", (0, 0, 0.17), 0.2, 0.36, tunic, self.torso, verts=14, radius_top=0.14, scale=(1, 0.78, 1))
        cylinder("belt", (0, 0, 0.07), 0.195, 0.05, leather, self.torso, verts=14, scale=(1, 0.8, 1), outline=False)
        box("strap", (0.0, -0.128, 0.19), (0.045, 0.02, 0.42), leather, self.torso, rot=(0, math.radians(38), 0), outline=False)
        box("satchel", (-0.22, -0.02, 0.06), (0.07, 0.17, 0.14), leather, self.torso, bevel=0.02)
        sphere("collar", (0, 0, 0.34), (0.15, 0.13, 0.06), scarf, self.torso)
        self.scarf_tail = empty("scarftail", (0.08, 0.09, 0.33), self.torso)
        box("tail", (0, 0.0, -0.1), (0.07, 0.03, 0.2), scarf, self.scarf_tail, rot=(0.25, 0, 0.2))
        self.arms = []
        for side in (-1, 1):
            p = empty(f"arm{side}", (side * 0.195, 0, 0.3), self.torso)
            p.rotation_euler.y = side * 0.12
            cylinder(f"sleeve{side}", (0, 0, -0.1), 0.05, 0.22, sleeve, p, verts=10)
            sphere(f"hand{side}", (0, 0, -0.235), (0.052, 0.052, 0.052), skin, p)
            self.arms.append(p)
        self.head = empty("head", (0, 0, 0.37), self.torso)
        sphere("skull", (0, 0, 0.2), (0.235, 0.225, 0.22), skin, self.head)
        sphere("hairback", (0, 0.07, 0.26), (0.245, 0.225, 0.225), hair, self.head)
        sphere("fringe", (0.035, -0.13, 0.33), (0.19, 0.1, 0.075), hair, self.head)
        for side in (-1, 1):
            sphere(f"sidetuft{side}", (side * 0.2, -0.04, 0.17), (0.065, 0.09, 0.12), hair, self.head)
        sphere("backtuft", (0.02, 0.21, 0.13), (0.11, 0.09, 0.12), hair, self.head)
        cylinder("cowlick", (-0.05, 0.03, 0.49), 0.05, 0.12, hair, self.head, verts=6, radius_top=0.0, rot=(0.3, -0.5, 0))
        _face_decals(self.head, 0.088, -0.205, 0.18, (0.04, 0.022, 0.058), 0.145, -0.18, 0.1)
        contact_shadow(None, radius=0.25, squash=1.0, alpha=0.3)

    def pose(self, anim: str, t: float) -> None:
        s = math.sin(TAU * t)
        c = math.cos(TAU * t)
        for leg in self.legs:
            leg.rotation_euler = (0, 0, 0)
        self.torso.rotation_euler = (0, 0, 0)
        self.torso.scale = (1, 1, 1)
        self.head.location.z = 0.37
        self.hip.location.z = 0.36
        self.scarf_tail.rotation_euler = (0, 0, 0)
        if anim == "walk":
            swing = 0.55 * s
            self.legs[0].rotation_euler.x = swing
            self.legs[1].rotation_euler.x = -swing
            self.arms[0].rotation_euler.x = -0.5 * s
            self.arms[1].rotation_euler.x = 0.5 * s
            self.torso.rotation_euler.z = 0.07 * s
            self.hip.location.z = 0.36 - 0.012 * abs(c)
            self.scarf_tail.rotation_euler = (0.25 + 0.2 * abs(c), 0, 0.15 * s)
            return
        # idle: slow breath
        self.arms[0].rotation_euler.x = 0.03 * s
        self.arms[1].rotation_euler.x = -0.03 * s
        self.torso.scale = (1 + 0.012 * s, 1 + 0.012 * s, 1 + 0.02 * s)
        self.head.location.z = 0.37 + 0.008 * s
        self.scarf_tail.rotation_euler = (0.05 + 0.04 * s, 0, 0)




# --------------------------------------------------------------------------
# Environment kit (static props: pose() is a no-op)
# --------------------------------------------------------------------------
def _canopy(parent, rng, clumps, colors, spread=0.32, z=0.95, radius=(0.26, 0.36)):
    """Faceted low-poly foliage: overlapping ico spheres, flat shaded."""
    mats = [toon(c, shadow=0.55, highlight=0.3) for c in colors]
    for i in range(clumps):
        a = rng.uniform(0, TAU)
        d = spread * (0.35 + 0.65 * rng.random()) if i else 0.0
        r = rng.uniform(*radius) * (1.12 if i == 0 else 1.0)
        loc = (math.cos(a) * d, math.sin(a) * d * 0.8, z + rng.uniform(-0.08, 0.14) + (0.12 if i == 0 else 0))
        sphere(f"{parent.name}-clump{i}", loc, (r, r, r * 0.88), mats[i % len(mats)], parent, low=True, smooth=False, rot=(rng.random(), rng.random(), rng.random()))


class Tree(Rig):
    def __init__(self, seed: int = 3, scale: float = 1.0):
        root = empty("tree")
        root.scale = (scale,) * 3
        super().__init__(root)
        rng = random.Random(seed)
        bark = toon("bark", shadow=0.55)
        cylinder("trunk", (0, 0, 0.28), 0.11, 0.56, bark, root, verts=7, radius_top=0.065, smooth=False)
        cylinder("flare", (0, 0, 0.05), 0.16, 0.1, bark, root, verts=7, radius_top=0.1, smooth=False)
        cylinder("branch", (0.1, 0, 0.48), 0.035, 0.26, bark, root, verts=5, radius_top=0.015, smooth=False, rot=(0, 0.9, 0))
        _canopy(root, rng, 6, ["leaf", "leaf_dark", "leaf_light", "leaf"], spread=0.3, z=0.84, radius=(0.24, 0.33))
        contact_shadow(root, radius=0.3, alpha=0.3)


class Bush(Rig):
    """Round fern/bush clump with a few flowers (prop-fern)."""

    def __init__(self, seed: int = 5, scale: float = 1.0, flowers: int = 3):
        root = empty("bush")
        root.scale = (scale,) * 3
        super().__init__(root)
        rng = random.Random(seed)
        _canopy(root, rng, 4, ["leaf_light", "leaf", "leaf_light"], spread=0.2, z=0.16, radius=(0.17, 0.23))
        _flowers(root, rng, flowers, 0.24, 0.3, outline=True)
        contact_shadow(root, radius=0.34, alpha=0.28)


def _flower(name, loc, parent, color, size=0.035, outline=False):
    pet = toon(color, shadow=0.3, highlight=0.0)
    gold = toon("petal_gold", shadow=0.3)
    holder = empty(name, loc, parent)
    for k in range(5):
        a = k * TAU / 5
        sphere(f"{name}p{k}", (math.cos(a) * size, math.sin(a) * size, 0), (size * 0.75, size * 0.75, size * 0.4), pet, holder, outline=outline)
    sphere(f"{name}c", (0, 0, size * 0.25), (size * 0.5,) * 3, gold, holder, outline=False)
    return holder


def _flowers(parent, rng, count, radius, z, outline=False):
    for i in range(count):
        a = rng.uniform(0, TAU)
        d = radius * math.sqrt(rng.random())
        color = ["petal", "petal_lilac", "petal"][i % 3]
        _flower(f"{parent.name}-fl{i}", (math.cos(a) * d, math.sin(a) * d * 0.8 - 0.1, z + rng.uniform(0, 0.1)), parent, color, outline=outline)


class Pebbles(Rig):
    def __init__(self, seed: int = 7, count: int = 5):
        root = empty("pebbles")
        super().__init__(root)
        rng = random.Random(seed)
        mats = [toon("stone"), toon("stone_dark"), toon("#c9c2b0")]
        for i in range(count):
            a = rng.uniform(0, TAU)
            d = 0.22 * math.sqrt(rng.random()) if i else 0
            r = rng.uniform(0.09, 0.15) * (1.4 if i == 0 else 1)
            sphere(f"peb{i}", (math.cos(a) * d, math.sin(a) * d, r * 0.45), (r * 1.2, r, r * 0.7), mats[i % 3], root, low=True, smooth=False, rot=(0, 0, rng.uniform(0, 3)))
        contact_shadow(root, radius=0.34, alpha=0.25)


def crescent_mesh(name, radius, thickness, mat, parent, *, loc=(0, 0, 0), outline=True, segments=18):
    """Crescent moon standing in the XZ plane, facing -Y, horns to the right."""
    a0 = math.radians(48)
    outer = [(radius * math.cos(a), radius * math.sin(a)) for a in (a0 + (TAU - 2 * a0) * i / segments for i in range(segments + 1))]
    cx = radius * 0.42
    px, pz = outer[0]
    ri = math.hypot(px - cx, pz)
    b0 = math.atan2(pz, px - cx)
    inner = [(cx + ri * math.cos(b), ri * math.sin(b)) for b in (b0 + (TAU - 2 * b0) * i / segments for i in range(segments + 1))]
    verts, faces = [], []
    for y in (-thickness / 2, thickness / 2):
        for (ox, oz), (ix, iz) in zip(outer, inner):
            verts.append((ox, y, oz))
            verts.append((ix, y, iz))
    n = len(outer)
    back = 2 * n
    for i in range(n - 1):
        o, inn, o2, i2 = 2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 3
        faces.append((o, o2, i2, inn))
        faces.append((back + o, back + inn, back + i2, back + o2))
        faces.append((o, back + o, back + o2, o2))
        faces.append((inn, i2, back + i2, back + inn))
    obj = mesh_from(name, verts, faces, mat, parent, outline=outline)
    obj.location = loc
    return obj


class StandingStone(Rig):
    def __init__(self):
        root = empty("stone")
        super().__init__(root)
        stone = toon("stone", shadow=0.5)
        moss = toon("moss_dark")
        box("menhir", (0, 0, 0.3), (0.3, 0.22, 0.6), stone, root, rot=(0.04, -0.06, 0.2), bevel=0.05)
        sphere("cap", (0.02, 0.02, 0.6), (0.15, 0.12, 0.05), moss, root, low=True, smooth=False)
        glyph = crescent_mesh("glyph", 0.075, 0.02, toon("moon_glow", emission=1.6), root, loc=(0.0, -0.125, 0.36), outline=False)
        glyph.rotation_euler = (0.04, 0, 0.2)
        _flowers(root, random.Random(2), 2, 0.25, 0.02)
        contact_shadow(root, radius=0.3, alpha=0.3)


class ShrineAltar(Rig):
    """Moon Shrine: tiered octagonal plinth, glowing floating crescent."""

    def __init__(self):
        root = empty("altar")
        super().__init__(root)
        stone = toon("stone", shadow=0.5)
        dark = toon("stone_dark", shadow=0.5)
        moss = toon("moss_dark")
        cylinder("tier0", (0, 0, 0.06), 0.42, 0.12, dark, root, verts=8, smooth=False)
        cylinder("tier1", (0, 0, 0.17), 0.33, 0.11, stone, root, verts=8, smooth=False)
        cylinder("pillar", (0, 0, 0.36), 0.14, 0.28, stone, root, verts=8, radius_top=0.11, smooth=False)
        cylinder("bowl", (0, 0, 0.52), 0.2, 0.06, dark, root, verts=8, smooth=False)
        for i in range(3):
            a = 0.6 + i * 2.1
            sphere(f"moss{i}", (math.cos(a) * 0.38, math.sin(a) * 0.35, 0.12), (0.1, 0.08, 0.05), moss, root, low=True, smooth=False)
        self.moon = empty("moonpivot", (0, 0, 0.86), root)
        crescent_mesh("moon", 0.2, 0.06, toon("moon", emission=1.25), self.moon, outline=True)
        halo = disc("halo", (0, 0.05, 0), 0.42, radial_material("halo", "moon_glow", 0.55), self.moon)
        halo.rotation_euler = (math.pi / 2, 0, 0)
        contact_shadow(root, radius=0.5, alpha=0.3)

    def pose(self, anim, t):
        self.moon.location.z = 0.86 + 0.02 * math.sin(TAU * t)


class Cottage(Rig):
    """Village cottage; the gable faces the camera so it reads as a house."""

    def __init__(self):
        root = empty("cottage")
        super().__init__(root)
        plaster = toon("plaster", shadow=0.45)
        timber = toon("bark", shadow=0.5)
        roof = toon("roof", shadow=0.5)
        roof_dark = toon("teal_dark", shadow=0.5)
        stone = toon("stone", shadow=0.5)
        glow = toon("window", emission=1.15)
        w, d, h = 0.78, 0.74, 0.46
        box("walls", (0, 0, h / 2), (w, d, h), plaster, root)
        box("plinth", (0, 0, 0.04), (w + 0.05, d + 0.05, 0.08), stone, root)
        for sx in (-1, 1):
            box(f"post{sx}", (sx * w / 2, -d / 2, h / 2), (0.06, 0.06, h + 0.02), timber, root, outline=False)
        box("beam", (0, -d / 2 - 0.005, h - 0.02), (w, 0.04, 0.05), timber, root, outline=False)
        pitch = math.radians(42)
        half = w / 2 + 0.1
        slab = half / math.cos(pitch)
        ridge = h + math.tan(pitch) * half
        for side in (-1, 1):
            box(f"roof{side}", (side * half / 2, 0, (h + ridge) / 2 + 0.02), (slab + 0.04, d + 0.18, 0.07), roof, root, rot=(0, side * pitch, 0))
            for k in range(1, 3):
                u = k / 3
                box(
                    f"shingle{side}{k}",
                    (side * half * u, -0.002, h + (ridge - h) * (1 - u) + 0.065),
                    (0.025, d + 0.19, 0.02),
                    roof_dark,
                    root,
                    outline=False,
                    rot=(0, side * pitch, 0),
                )
        mesh_from(
            "gable",
            [(-w / 2, -d / 2, h), (w / 2, -d / 2, h), (0, -d / 2, ridge - 0.03), (-w / 2, d / 2, h), (w / 2, d / 2, h), (0, d / 2, ridge - 0.03)],
            [(0, 1, 2), (5, 4, 3)],
            plaster,
            root,
        )
        box("gablewin", (0, -d / 2 - 0.01, h + 0.13), (0.1, 0.03, 0.1), glow, root)
        box("chimney", (0.2, 0.18, ridge - 0.02), (0.12, 0.12, 0.34), stone, root)
        box("door", (-0.14, -d / 2 - 0.01, 0.17), (0.17, 0.03, 0.3), timber, root)
        box("window", (0.19, -d / 2 - 0.01, 0.25), (0.16, 0.03, 0.12), glow, root)
        box("sill", (0.19, -d / 2 - 0.03, 0.18), (0.2, 0.05, 0.025), timber, root, outline=False)
        for i, x in enumerate((0.11, 0.19, 0.27)):
            _flower(f"wf{i}", (x, -d / 2 - 0.07, 0.03), root, ["petal", "petal_lilac", "petal"][i], size=0.03, outline=True)
        contact_shadow(root, radius=0.6, alpha=0.26)


class Hedge(Rig):
    """Boundary hedge block: bleeds past the canvas sides so tiles join up."""

    def __init__(self, seed: int = 11):
        root = empty("hedge")
        super().__init__(root)
        rng = random.Random(seed)
        mats = [toon(c, shadow=0.55, highlight=0.3) for c in ("leaf_dark", "leaf", "leaf_dark")]
        for i, x in enumerate((-0.48, -0.16, 0.16, 0.48)):
            r = rng.uniform(0.3, 0.36)
            sphere(f"h{i}", (x, rng.uniform(-0.04, 0.06), 0.3 + rng.uniform(0, 0.08)), (r, r * 0.9, r), mats[i % 3], root, low=True, smooth=False, rot=(rng.random(), rng.random(), rng.random()))
        for i in range(3):
            r = rng.uniform(0.18, 0.24)
            sphere(f"t{i}", (-0.3 + i * 0.3 + rng.uniform(-0.05, 0.05), 0.02, 0.58), (r, r, r * 0.85), mats[1], root, low=True, smooth=False, rot=(rng.random(), 0, rng.random()))


# --------------------------------------------------------------------------
# Ground tile (rendered straight down, wraps seamlessly)
# --------------------------------------------------------------------------
class GroundTile(Rig):
    """Top-down grass tile. Every variant of a set shares the same `edge_seed`
    items along the borders (wrapped 3x3), and keeps its own seeded details
    strictly inside, so any variant sits seamlessly next to any other."""

    def __init__(self, seed: int = 1, flowers: int = 4, pebbles: int = 2, patches: int = 4, blades: int = 46, edge_seed: str = "grove"):
        root = empty("tile")
        super().__init__(root)
        base = toon("grass", shadow=0.4, rim=0.0)
        box("ground", (0, 0, -0.05), (3.2, 3.2, 0.1), base, root, outline=False)
        reach = {"patch": 0.24, "blade": 0.05, "flower": 0.05, "pebble": 0.05}
        items = []

        def scatter(rng, kind, count, size, *, edge: bool):
            r = reach[kind]
            made = 0
            while made < count:
                u, v = rng.random(), rng.random()
                near_edge = min(u, v, 1 - u, 1 - v) < r
                if near_edge != edge:
                    continue
                items.append((kind, u, v, rng.uniform(0, TAU), rng.uniform(*size), len(items)))
                made += 1

        shared = random.Random(f"edge:{edge_seed}")
        scatter(shared, "patch", 3, (0.14, 0.22), edge=True)
        scatter(shared, "blade", 16, (0.7, 1.2), edge=True)
        rng = random.Random(seed)
        scatter(rng, "patch", patches, (0.12, 0.2), edge=False)
        scatter(rng, "blade", blades - 16, (0.7, 1.2), edge=False)
        scatter(rng, "flower", flowers, (0.8, 1.1), edge=False)
        scatter(rng, "pebble", pebbles, (0.8, 1.3), edge=False)
        patch_mats = [toon("#79a858", shadow=0.4, rim=0.0), toon("#85b360", shadow=0.4, rim=0.0)]
        blade_mats = [toon("grass_dark", shadow=0.5, rim=0.0), toon("grass_light", shadow=0.5, rim=0.0)]
        stone = toon("stone")
        for kind, u, v, rot, s, i in items:
            # 3x3 copies so anything crossing an edge reappears on the far side.
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    x, y = u - 0.5 + dx, v - 0.5 + dy
                    if abs(x) > 0.85 or abs(y) > 0.85:
                        continue
                    tag = f"{kind}{i}_{dx}{dy}"
                    if kind == "patch":
                        sphere(tag, (x, y, -0.004), (s, s * 0.7, 0.01), patch_mats[i % 2], root, outline=False, rot=(0, 0, rot))
                    elif kind == "blade":
                        sphere(tag, (x, y, 0.004), (0.045 * s, 0.009, 0.012), blade_mats[i % 2], root, outline=False, rot=(0, 0, rot))
                    elif kind == "flower":
                        _flower(tag, (x, y, 0.012), root, ["petal", "petal_lilac"][i % 2], size=0.022 * s, outline=True)
                    else:
                        sphere(tag, (x, y, 0.008), (0.035 * s, 0.028 * s, 0.018), stone, root, low=True, smooth=False, outline=True, rot=(0, 0, rot))


# --------------------------------------------------------------------------
# Battle arena (three layers rendered from one scene)
# --------------------------------------------------------------------------
def _gradient_sky(name, stops):
    import bpy

    from stage import rgba

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    nt.links.new(tc.outputs["Window"], sep.inputs[0])
    nt.links.new(sep.outputs["Y"], ramp.inputs["Fac"])
    cr = ramp.color_ramp
    cr.elements[0].position, cr.elements[0].color = stops[0][0], rgba(stops[0][1])
    cr.elements[1].position, cr.elements[1].color = stops[-1][0], rgba(stops[-1][1])
    for pos, col in stops[1:-1]:
        cr.elements.new(pos).color = rgba(col)
    nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    return mat


class Arena(Rig):
    """Spar backdrop built from the overworld kit; pose(layer) shows one layer."""

    LAYERS = ("sky", "hills", "platform")

    def __init__(self, pitch: float = 22.0, seed: int = 21):
        from mathutils import Euler, Vector

        root = empty("arena")
        super().__init__(root)
        rng = random.Random(seed)
        self.groups = {name: empty(f"layer-{name}", parent=root) for name in self.LAYERS}
        cam_rot = Euler((math.radians(90 - pitch), 0, 0))
        rot = cam_rot.to_matrix()
        fwd = rot @ Vector((0, 0, -1))
        up = rot @ Vector((0, 1, 0))
        right = rot @ Vector((1, 0, 0))

        def screen(x, y, depth):
            # x/y in design px relative to the origin's on-screen spot (y down).
            return right * (x / 100) - up * (y / 100) + fwd * depth

        # --- sky: camera-facing gradient card + clouds + moon
        sky = self.groups["sky"]
        card = box("skycard", screen(0, -100, 40), (14, 14, 0.01), _gradient_sky("sky", [(0.5, "sky_low"), (0.7, "#e9cfa8"), (0.84, "sky_mid"), (1.0, "sky_top")]), sky, outline=False)
        card.rotation_euler = cam_rot
        cloud = toon("#f6ead2", shadow=0.25, highlight=0.0, rim=0.0)
        cloud_shade = toon("#e4d2bd", shadow=0.25, highlight=0.0, rim=0.0)
        for cx, cy, w in ((-210, -150, 1.0), (190, -180, 0.8), (60, -110, 0.55), (-60, -95, 0.45)):
            for k in range(4):
                r = 0.3 * w * rng.uniform(0.75, 1.15)
                p = screen(cx + (k - 1.5) * 50 * w, cy + rng.uniform(-6, 6) - (12 * w if k in (1, 2) else 0), 30)
                sphere(f"cloud{cx}{k}", p, (r * 1.5, r * 0.6, r), cloud if k % 2 else cloud_shade, sky, low=True, smooth=False, outline=False, rot=cam_rot)
        moon_p = screen(-215, -200, 25)
        m = crescent_mesh("skymoon", 0.36, 0.05, toon("moon", emission=1.1), sky, outline=False)
        m.location = moon_p
        m.rotation_euler = Euler((math.radians(-pitch), 0, 0))
        halo = disc("skyhalo", moon_p + fwd * 1.0, 0.95, radial_material("skyhalo", "moon_glow", 0.35), sky)
        halo.rotation_euler = cam_rot

        # --- hills: meadow, distant hills, tree line
        hills = self.groups["hills"]
        far = toon("#7ea77a", shadow=0.35, highlight=0.1, rim=0.2)
        farther = toon("#a3bfa0", shadow=0.3, highlight=0.1, rim=0.1)
        meadow = toon("grass", shadow=0.4, rim=0.0)
        box("meadow", (0, -4.5, -0.47), (9, 14.4, 0.1), meadow, hills, outline=False)
        for i in range(9):
            r = rng.uniform(0.9, 1.4)
            sphere(f"hillfar{i}", (-4 + i + rng.uniform(-0.3, 0.3), 3.3, -0.75), (r * 1.4, 0.6, r * 0.62), farther, hills, low=True, smooth=False, outline=False)
        for i in range(8):
            r = rng.uniform(0.6, 0.9)
            sphere(f"hill{i}", (-3.6 + i * 1.05 + rng.uniform(-0.2, 0.2), 2.9, -0.6), (r * 1.3, 0.5, r * 0.55), far, hills, low=True, smooth=False, outline=False)
        tree_mats = [toon(c, shadow=0.5, highlight=0.25) for c in ("leaf", "leaf_dark", "leaf_light")]
        bark = toon("bark")
        for i in range(16):
            x = -4.2 + i * 0.56 + rng.uniform(-0.15, 0.15)
            y = 2.35 + rng.uniform(-0.1, 0.2)
            r = rng.uniform(0.22, 0.34)
            cylinder(f"tt{i}", (x, y, -0.3), 0.05, 0.25, bark, hills, verts=5, smooth=False, outline=False)
            sphere(f"tc{i}", (x, y, -0.05 + r * 0.6), (r, r, r * 1.1), tree_mats[i % 3], hills, low=True, smooth=False, rot=(rng.random(), rng.random(), 0))
        blade = toon("grass_dark", shadow=0.5, rim=0.0)
        for i in range(70):
            x, y = rng.uniform(-4, 4), rng.uniform(-10.5, 2.2)
            if x * x / 7.0 + y * y / 1.5 < 1:
                continue
            if rng.random() < 0.18:
                _flower(f"mf{i}", (x, y, -0.41), hills, ["petal", "petal_lilac"][i % 2], size=0.05)
            else:
                sphere(f"mb{i}", (x, y, -0.41), (0.12, 0.025, 0.03), blade, hills, outline=False, rot=(0, 0, rng.uniform(0, TAU)))
        for x, y, sc in ((-3.2, -3.6, 1.6), (3.3, -3.2, 1.4), (-3.5, 0.9, 1.0), (3.4, 1.2, 1.1)):
            holder = empty(f"bush{x}", (x, y, -0.42), hills)
            holder.scale = (sc,) * 3
            _canopy(holder, rng, 4, ["leaf", "leaf_light", "leaf_dark"], spread=0.22, z=0.18, radius=(0.17, 0.24))
        disc("plat-shadow", (0.3, -0.25, -0.415), 2.7, radial_material("plat-shadow", "navy", 0.4), hills, scale=(1.05, 0.85, 1))

        # --- platform: grassy stone dais the combatants stand on
        plat = self.groups["platform"]
        grass_top = toon("grass_light", shadow=0.4, highlight=0.15, rim=0.0)
        cylinder("dais", (0, 0, -0.22), 2.62, 0.44, toon("stone", shadow=0.5), plat, verts=16, smooth=False)
        cylinder("daistop", (0, 0, 0.0), 2.55, 0.04, grass_top, plat, verts=16, smooth=False, outline=False)
        # Flat self-lit decals: thin stacked cylinders shadow-acne under the sun.
        disc("ring", (0, 0, 0.021), 1.9, toon("#8ab865", emission=1.0), plat)
        disc("inner", (0, 0, 0.022), 1.8, toon("grass_light", emission=1.0), plat)
        stone_mats = [toon("stone"), toon("stone_dark"), toon("#c9c2b0")]
        for i in range(16):
            a = i * TAU / 16 + rng.uniform(-0.08, 0.08)
            if math.sin(a) < -0.3 and abs(math.cos(a)) < 0.6:
                continue  # keep the front edge open
            r = rng.uniform(0.13, 0.22)
            sphere(f"rim{i}", (math.cos(a) * 2.55, math.sin(a) * 2.55, 0.02), (r * 1.2, r, r * 0.8), stone_mats[i % 3], plat, low=True, smooth=False, rot=(0, 0, a))
        pblade = toon("grass", shadow=0.5, rim=0.0)
        for i in range(22):
            a, d = rng.uniform(0, TAU), rng.uniform(0.4, 2.4)
            x, y = math.cos(a) * d, math.sin(a) * d
            if math.hypot(x + 1.18, y + 1.73) < 0.55 or math.hypot(x - 1.16, y - 0.99) < 0.55:
                continue  # keep the combatant spots clean
            if i % 4 == 0:
                _flower(f"pf{i}", (x, y, 0.04), plat, ["petal", "petal_lilac", "petal_gold"][i % 3], size=0.05)
            else:
                sphere(f"pb{i}", (x, y, 0.04), (0.11, 0.022, 0.03), pblade, plat, outline=False, rot=(0, 0, rng.uniform(0, TAU)))
        for x, y in ((-2.1, 1.5), (2.2, 1.3)):
            holder = empty(f"pbush{x}", (x, y, 0.0), plat)
            _canopy(holder, rng, 4, ["leaf", "leaf_light", "leaf_dark"], spread=0.22, z=0.18, radius=(0.17, 0.24))

    def pose(self, anim, t):
        for name, group in self.groups.items():
            hidden = name != anim
            for obj in [group, *group.children_recursive]:
                obj.hide_render = hidden


BUILDERS = {
    "mossling": Mossling,
    "player": Player,
    "tree": Tree,
    "bush": Bush,
    "pebbles": Pebbles,
    "standing-stone": StandingStone,
    "shrine-altar": ShrineAltar,
    "cottage": Cottage,
    "hedge": Hedge,
    "ground": GroundTile,
    "arena": Arena,
}
