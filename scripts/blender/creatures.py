"""Parametric creature body plans (#361).

One `Creature` rig serves every converted species: a body plan (blob, wisp,
bird, toad, quad, stump) builds the mesh from a species dict in `SPECIES`
(palette names, ears, tails, crowns, emissive bits), and registers animated
parts. `pose(anim, t)` is shared, so idle/attack/hurt/faint read the same
across the roster:

  idle    breathing squash + part sway (ears, tails, wings, flames), hover bob
  attack  wind-up, lunge toward the camera-facing front (-Y), recover
  hurt    knocked back, squashed, squinting
  faint   slumps over, sinks, eyes shut, flames/ears droop (last frame holds)

Animated parts are always empties (pivots); meshes are never scaled after
creation so outlines stay even. Loops are seamless: every idle term is a
whole number of sine periods over t in [0, 1).
"""

from __future__ import annotations

import math

import bmesh

from models import TAU, Rig, _canopy, _flower, keyframes
from stage import contact_shadow, cylinder, disc, empty, mesh_from, radial_material, sphere, toon


# --------------------------------------------------------------------------
# Mesh helpers
# --------------------------------------------------------------------------
def _recalc_normals(obj) -> None:
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()


def teardrop(name, loc, radius, height, mat, parent, *, bend=0.0, squash=1.0, rot=(0, 0, 0), outline=True, segs=14, rings=12, bulb=0.32):
    """Flame / droplet / leaf: round bulb at the base, tapering to a tip at
    +Z. `bend` curls the tip along +X (in units of height)."""
    verts = [(0.0, 0.0, 0.0)]
    for i in range(1, rings):
        u = i / rings
        if u < bulb:
            r = radius * math.sqrt(max(0.0, 1 - ((bulb - u) / bulb) ** 2))
        else:
            r = radius * ((1 - u) / (1 - bulb)) ** 1.15
        x0 = bend * u * u * height
        for k in range(segs):
            a = k * TAU / segs
            verts.append((x0 + r * math.cos(a), r * math.sin(a) * squash, u * height))
    tip = len(verts)
    verts.append((bend * height, 0.0, height))
    faces = []
    for k in range(segs):
        faces.append((0, 1 + (k + 1) % segs, 1 + k))
    for i in range(rings - 2):
        a0 = 1 + i * segs
        a1 = a0 + segs
        for k in range(segs):
            k1 = (k + 1) % segs
            faces.append((a0 + k, a0 + k1, a1 + k1, a1 + k))
    last = 1 + (rings - 2) * segs
    for k in range(segs):
        faces.append((last + k, last + (k + 1) % segs, tip))
    obj = mesh_from(name, verts, faces, mat, parent, smooth=True, outline=outline)
    _recalc_normals(obj)
    obj.location = loc
    obj.rotation_euler = rot
    return obj


def bolt(name, loc, size, mat, parent, *, thickness=0.03, rot=(0, 0, 0), outline=True):
    """Zig-zag lightning bolt standing in the XZ plane."""
    pts = [(-0.02, 1.0), (0.38, 1.0), (0.12, 0.56), (0.36, 0.56), (-0.22, -0.1), (0.0, 0.4), (-0.24, 0.4)]
    pts = [(x * size, z * size) for x, z in pts]
    verts = [(x, -thickness / 2, z) for x, z in pts] + [(x, thickness / 2, z) for x, z in pts]
    n = len(pts)
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    obj = mesh_from(name, verts, faces, mat, parent, outline=outline)
    _recalc_normals(obj)
    obj.location = loc
    obj.rotation_euler = rot
    return obj


def surface_y(center, radii, x, z, inset=0.0):
    """Front (-Y) surface of an ellipsoid at (x, z); for placing face decals."""
    cx, cy, cz = center
    rx, ry, rz = radii
    k = 1 - ((x - cx) / rx) ** 2 - ((z - cz) / rz) ** 2
    return cy - ry * math.sqrt(max(0.0, k)) + inset


# --------------------------------------------------------------------------
# Rig
# --------------------------------------------------------------------------
class Creature(Rig):
    def __init__(self, species: str, facing_deg: float = 0.0, scale: float = 1.0):
        sp = SPECIES[species]
        root = empty(species)
        root.rotation_euler.z = math.radians(facing_deg)
        root.scale = (scale,) * 3
        super().__init__(root)
        self.sp = sp
        self.hover = sp.get("hover", 0.0)
        self.mover = empty("mover", parent=root)
        self.body = empty("body", parent=self.mover)
        self.parts: list[dict] = []
        self.eyes: list = []
        PLANS[sp["plan"]](self, sp)
        if sp.get("glow"):
            halo = disc("glowhalo", (0, 0, 0.006), sp.get("shadow", 0.4) * 1.25, radial_material("glow", sp["glow"], 0.45), root, scale=(1, 0.85, 1))
            halo.visible_shadow = False
        contact_shadow(root, radius=sp.get("shadow", 0.4), squash=0.9, alpha=0.3)
        for p in self.parts:
            o = p["obj"]
            p["base"] = (o.location.copy(), o.rotation_euler.copy(), o.scale.copy())
        self._eye_base = [e.scale.copy() for e in self.eyes]

    # -- registration -----------------------------------------------------
    def part(self, obj, kind: str, *, axis: int = 1, amp: float = 0.12, phase: float = 0.0, droop: float | None = None):
        """kind: swing (rotate `axis`), flame (scale pulse), spin (rotate Z,
        `amp` = full turn fraction per loop), pulse (uniform scale)."""
        self.parts.append({"obj": obj, "kind": kind, "axis": axis, "amp": amp, "phase": phase, "droop": droop})
        return obj

    def pivot(self, name, loc, parent=None, rot=(0, 0, 0)):
        p = empty(name, loc, parent or self.body)
        p.rotation_euler = rot
        return p

    def face(self, parent, center, radii, *, eye_x, eye_z, eye_size=(0.055, 0.03, 0.075), blush=True, mouth=True, brow=None, lift=0.0):
        """`lift` pulls decals forward (-Y) to sit on top of a face plate."""
        eye_mat = toon("eye", shadow=0.0, highlight=0.0, rim=0.0)
        shine = toon("#ffffff", emission=1.0)
        blush_mat = toon("blush", shadow=0.2, highlight=0.0, rim=0.0)
        for side in (-1, 1):
            x = center[0] + side * eye_x
            y = surface_y(center, radii, x, eye_z, 0.02) - lift
            eye = sphere(f"eye{side}", (x, y, eye_z), eye_size, eye_mat, parent, outline=False)
            sphere(f"shine{side}", (-0.3, -0.9, 0.38), (0.36, 0.3, 0.27), shine, eye, outline=False)
            self.eyes.append(eye)
            if blush:
                bx, bz = center[0] + side * eye_x * 1.8, eye_z - eye_size[2] * 1.2
                sphere(f"blush{side}", (bx, surface_y(center, radii, bx, bz, 0.012) - lift * 0.5, bz), (eye_size[0] * 1.1, 0.015, eye_size[2] * 0.45), blush_mat, parent, outline=False)
            if brow:
                bz = eye_z + eye_size[2] * 1.35
                bx = x + side * 0.005
                b = sphere(f"brow{side}", (bx, surface_y(center, radii, bx, bz, 0.012) - lift, bz), (eye_size[0] * 1.3, 0.015, 0.016), toon(brow, shadow=0.2), parent, outline=False)
                b.rotation_euler = (0, side * 0.35, 0)
        if mouth:
            mz = eye_z - eye_size[2] * 1.15
            sphere("mouth", (center[0], surface_y(center, radii, center[0], mz, 0.005) - lift, mz), (0.03, 0.01, 0.012), eye_mat, parent, outline=False)

    # -- animation ----------------------------------------------------------
    def pose(self, anim: str, t: float) -> None:
        mv, body = self.mover, self.body
        for p in self.parts:
            loc, rot, scl = p["base"]
            p["obj"].location = loc.copy()
            p["obj"].rotation_euler = rot.copy()
            p["obj"].scale = scl.copy()
        for eye, scl in zip(self.eyes, self._eye_base):
            eye.scale = scl.copy()
        mv.location = (0, 0, self.hover)
        body.rotation_euler = (0, 0, 0)
        body.scale = (1, 1, 1)
        s = math.sin(TAU * t)
        breath = self.sp.get("breath", 1.0)

        if anim == "idle":
            body.scale = (1 - 0.03 * s * breath, 1 - 0.03 * s * breath, 1 + 0.05 * s * breath)
            if self.hover:
                mv.location.z = self.hover + 0.03 * math.sin(TAU * t + 0.6)
            self._parts(lambda ph: math.sin(TAU * t + ph), t, spin=True)
            return
        if anim == "attack":
            fwd = keyframes([(0, 0.0), (0.2, 0.08), (0.4, -0.24), (0.55, -0.27), (0.8, -0.08), (1, 0.0)], t)
            sz = keyframes([(0, 1.0), (0.2, 0.86), (0.4, 1.12), (0.55, 0.88), (0.8, 1.03), (1, 1.0)], t)
            tilt = keyframes([(0, 0.0), (0.2, 0.18), (0.4, -0.3), (0.55, -0.2), (1, 0.0)], t)
            mv.location = (0, fwd, self.hover + max(0.0, -fwd * 0.25))
            sxy = 1 / math.sqrt(sz)
            body.scale = (sxy, sxy, sz)
            body.rotation_euler = (tilt, 0, 0)
            strike = keyframes([(0, 0.0), (0.2, -0.8), (0.42, 1.4), (0.7, 0.6), (1, 0.0)], t)
            self._parts(lambda ph: strike, t)
            return
        if anim == "hurt":
            back = keyframes([(0, 0.2), (0.3, 0.24), (0.65, 0.1), (1, 0.03)], t)
            sz = keyframes([(0, 0.82), (0.3, 0.9), (0.65, 1.04), (1, 1.0)], t)
            mv.location = (0, back, self.hover * 0.7)
            sxy = 1 / math.sqrt(sz)
            body.scale = (sxy, sxy, sz)
            body.rotation_euler = (keyframes([(0, 0.32), (0.65, 0.1), (1, 0.0)], t), 0, 0)
            squint = keyframes([(0, 0.2), (0.6, 0.25), (1, 0.8)], t)
            for eye, scl in zip(self.eyes, self._eye_base):
                eye.scale = (scl[0] * 1.1, scl[1], scl[2] * squint)
            jolt = keyframes([(0, 1.6), (0.5, 0.8), (1, 0.2)], t)
            self._parts(lambda ph: jolt, t, hurt=True)
            return
        if anim == "faint":
            # 4 frames at t = 0, .25, .5, .75: the last frame is the held pose.
            u = keyframes([(0, 0.15), (0.25, 0.45), (0.5, 0.8), (0.75, 1.0), (1, 1.0)], t)
            sz = 1 - 0.24 * u
            sxy = 1 + 0.08 * u
            body.scale = (sxy, sxy, sz)
            body.rotation_euler = (0.12 * u, 0.38 * u, 0)
            mv.location = (0.05 * u, 0.04 * u, self.hover * (1 - u))
            shut = max(0.1, 1 - 1.2 * u)
            for eye, scl in zip(self.eyes, self._eye_base):
                eye.scale = (scl[0] * 1.15, scl[1], scl[2] * shut)
            self._parts(lambda ph: 0.0, t, faint=u)
            return

    def _parts(self, wave, t, *, spin=False, hurt=False, faint=0.0):
        for p in self.parts:
            o, kind, amp = p["obj"], p["kind"], p["amp"]
            w = wave(p["phase"])
            if kind == "swing":
                droop = p["droop"] if p["droop"] is not None else amp * 3
                o.rotation_euler[p["axis"]] += amp * w + droop * faint
            elif kind == "flame":
                k = 1 + amp * w
                if hurt:
                    k = 1 - 0.18 * w / 1.6
                k *= 1 - 0.6 * faint
                o.scale = (o.scale[0] * (2 - k) ** 0.5, o.scale[1] * (2 - k) ** 0.5, o.scale[2] * k)
            elif kind == "pulse":
                k = (1 + amp * w) * (1 - 0.5 * faint)
                o.scale = (o.scale[0] * k, o.scale[1] * k, o.scale[2] * k)
            elif kind == "spin" and spin:
                o.rotation_euler.z += TAU * amp * t


# --------------------------------------------------------------------------
# Shared bits
# --------------------------------------------------------------------------
def _feet(rig, sp, xs=0.17, y=-0.1, size=(0.1, 0.12, 0.06)):
    mat = toon(sp.get("feet", sp["dark"]))
    for side in (-1, 1):
        sphere(f"foot{side}", (side * xs, y, size[2] * 0.85), size, mat, rig.mover)


def _leaf_ears(rig, sp, x, z, length=0.17, color=None, lift=-28):
    mat = toon(color or sp["dark"])
    for side in (-1, 1):
        pivot = rig.pivot(f"ear{side}", (side * x, 0.02, z), rot=(0, math.radians(lift), 0 if side > 0 else math.pi))
        sphere(f"earleaf{side}", (length * 0.95, 0, 0), (length, 0.035, length * 0.48), mat, pivot)
        rig.part(pivot, "swing", amp=0.12, phase=side * 0.4, droop=0.55)


def _flame_tongue(rig, name, loc, radius, height, colors, *, tilt=(0, 0, 0), bend=0.0, phase=0.0, amp=0.14, parent=None, core=True):
    pivot = rig.pivot(name, loc, parent, rot=tilt)
    teardrop(f"{name}-outer", (0, 0, 0), radius, height, toon(colors[0], shadow=0.3, highlight=0.35, rim=0.3), pivot, bend=bend)
    if core:
        teardrop(f"{name}-core", (0, -radius * 0.35, radius * 0.15), radius * 0.55, height * 0.6, toon(colors[1], emission=1.15), pivot, bend=bend * 0.8, outline=False)
    rig.part(pivot, "flame", amp=amp, phase=phase)
    return pivot


# --------------------------------------------------------------------------
# Body plans
# --------------------------------------------------------------------------
def plan_blob(rig: Creature, sp: dict) -> None:
    rx, ry, rz = sp.get("body", (0.38, 0.35, 0.33))
    cz = rz + 0.01
    center = (0, 0, cz)
    main, dark, light = toon(sp["color"]), toon(sp["dark"]), toon(sp["light"])
    sphere("torso", center, (rx, ry, rz), main, rig.body)
    if sp.get("belly"):
        sphere("belly", (0, -ry * 0.62, cz - rz * 0.3), (rx * 0.62, ry * 0.42, rz * 0.55), toon(sp["belly"], shadow=0.4), rig.body, outline=False)
    _feet(rig, sp, xs=rx * 0.45, size=(rx * 0.27, rx * 0.32, 0.06))
    face_z = cz + rz * sp.get("face_z", 0.18)
    rig.face(rig.body, center, (rx, ry, rz), eye_x=rx * 0.33, eye_z=face_z, eye_size=sp.get("eye", (0.055, 0.03, 0.075)), brow=sp.get("brow"))
    for extra in sp.get("extras", []):
        EXTRAS[extra](rig, sp, center, (rx, ry, rz))


def plan_wisp(rig: Creature, sp: dict) -> None:
    r = sp.get("radius", 0.26)
    h = sp.get("height", 0.78)
    outer, mid, core = sp["color"], sp["dark"], sp["light"]
    body_mat = toon(outer, shadow=0.3, highlight=0.4, rim=0.4)
    teardrop("flamebody", (0, 0, 0.0), r, h, body_mat, rig.body, bend=sp.get("bend", 0.12), bulb=0.4)
    cz = h * 0.36
    center = (0, 0, cz)
    radii = (r * 0.98, r * 0.98, r * 1.05)
    # Bright inner-flame face plate; the body's curve clips it to an oval.
    sphere("faceplate", (0, surface_y(center, radii, 0, cz - 0.02, 0.03), cz - 0.02), (r * 0.62, 0.03, r * 0.6), toon(core, emission=1.05), rig.body, outline=False)
    # Side flame tongues ("arms") and a crown.
    for side in (-1, 1):
        _flame_tongue(rig, f"arm{side}", (side * r * 0.85, 0.0, cz - 0.02), r * 0.32, h * 0.38, (mid, core), tilt=(0, side * 1.05, 0), bend=0.25, phase=side * 1.3)
    for i, (x, tilt, hh, ph) in enumerate(sp.get("crown", [(-0.11, -0.55, 0.32, 0.7), (0.12, 0.5, 0.36, 2.1)])):
        _flame_tongue(rig, f"crown{i}", (x, 0.04, h * 0.48), r * 0.33, h * hh, (mid, core), tilt=(0, tilt, 0), bend=0.15 * (1 if tilt > 0 else -1), phase=ph)
    rig.face(rig.body, center, radii, eye_x=r * 0.36, eye_z=cz + 0.02, eye_size=sp.get("eye", (0.05, 0.03, 0.07)), blush=sp.get("blush", True), brow=sp.get("brow"), lift=0.045)
    for extra in sp.get("extras", []):
        EXTRAS[extra](rig, sp, center, radii)


def plan_bird(rig: Creature, sp: dict) -> None:
    rx, ry, rz = sp.get("body", (0.3, 0.29, 0.29))
    cz = 0.16 + rz
    center = (0, 0, cz)
    main, dark = toon(sp["color"]), toon(sp["dark"])
    sphere("torso", center, (rx, ry, rz), main, rig.body)
    sphere("belly", (0, -ry * 0.55, cz - rz * 0.32), (rx * 0.66, ry * 0.5, rz * 0.6), toon(sp["belly"], shadow=0.4), rig.body, outline=False)
    beak = toon(sp.get("beak", "beak"))
    bz = cz + rz * 0.05
    cylinder("beak", (0, surface_y(center, (rx, ry, rz), 0, bz, 0.02) - 0.05, bz), 0.05, 0.12, beak, rig.body, verts=8, radius_top=0.0, rot=(math.pi / 2, 0, 0))
    rig.face(rig.body, center, (rx, ry, rz), eye_x=rx * 0.4, eye_z=cz + rz * 0.3, eye_size=(0.05, 0.03, 0.065), blush=True, mouth=False)
    for side in (-1, 1):
        p = rig.pivot(f"wing{side}", (side * rx * 0.86, 0.04, cz + 0.03), rot=(0, math.radians(18), 0 if side > 0 else math.pi))
        sphere(f"wingm{side}", (0.06, 0.02, -0.1), (0.07, 0.19, 0.16), dark, p, rot=(0.25, 0.2, 0))
        sphere(f"wingtip{side}", (0.07, 0.1, -0.2), (0.05, 0.11, 0.08), toon(sp.get("wingtip", sp["dark"])), p, rot=(0.6, 0.2, 0))
        rig.part(p, "swing", amp=-0.22, phase=0.0, droop=0.5)
    tail = rig.pivot("tail", (0, ry * 0.8, cz - 0.08), rot=(math.radians(-40), 0, 0))
    for i, a in enumerate((-0.4, 0.0, 0.4)):
        teardrop(f"feather{i}", (0, 0, 0), 0.06, 0.26, dark, tail, rot=(0, a, 0), squash=0.45)
    rig.part(tail, "swing", axis=0, amp=-0.15, phase=1.0, droop=0.6)
    leg = toon(sp.get("beak", "beak"))
    for side in (-1, 1):
        cylinder(f"leg{side}", (side * 0.1, -0.02, 0.09), 0.022, 0.16, leg, rig.mover, verts=6)
        sphere(f"toe{side}", (side * 0.1, -0.05, 0.02), (0.05, 0.07, 0.025), leg, rig.mover)
    for extra in sp.get("extras", []):
        EXTRAS[extra](rig, sp, center, (rx, ry, rz))


def plan_toad(rig: Creature, sp: dict) -> None:
    rx, ry, rz = sp.get("body", (0.42, 0.36, 0.25))
    cz = rz + 0.02
    center = (0, 0, cz)
    main, dark = toon(sp["color"]), toon(sp["dark"])
    sphere("torso", center, (rx, ry, rz), main, rig.body)
    sphere("belly", (0, -ry * 0.6, cz - rz * 0.35), (rx * 0.66, ry * 0.42, rz * 0.6), toon(sp["belly"], shadow=0.4), rig.body, outline=False)
    eyes_z = cz + rz * 0.92
    bumps = []
    for side in (-1, 1):
        bumps.append(sphere(f"bump{side}", (side * rx * 0.42, -ry * 0.42, eyes_z), (0.11, 0.1, 0.1), toon(sp.get("bump", sp["color"])), rig.body))
    # Eyes on the front of the bumps (`eye_glow` makes them self-lit, #392).
    eye_mat = toon(sp.get("eye_color", "eye"), shadow=0.0, highlight=0.0, rim=0.0, emission=sp.get("eye_glow", 0.0))
    shine = toon("#ffffff", emission=1.0)
    for side in (-1, 1):
        e = sphere(f"eye{side}", (side * rx * 0.42, -ry * 0.42 - 0.085, eyes_z + 0.01), (0.055, 0.03, 0.07), eye_mat, rig.body, outline=False)
        sphere(f"shine{side}", (-0.3, -0.9, 0.38), (0.36, 0.3, 0.27), shine, e, outline=False)
        rig.eyes.append(e)
        sphere(f"blush{side}", (side * rx * 0.62, surface_y(center, (rx, ry, rz), side * rx * 0.62, cz + 0.06, 0.012), cz + 0.06), (0.06, 0.015, 0.03), toon("blush", shadow=0.2, highlight=0.0, rim=0.0), rig.body, outline=False)
        if sp.get("lids"):
            # Heavy lids give the boss a stern, half-closed look (#392).
            lid = sphere(f"lid{side}", (side * rx * 0.42, -ry * 0.42 - 0.05, eyes_z + 0.045), (0.105, 0.075, 0.05), toon(sp.get("bump", sp["color"])), rig.body)
            lid.rotation_euler = (0.25, side * -0.3, 0)
    mz = cz + rz * 0.35
    sphere("mouth", (0, surface_y(center, (rx, ry, rz), 0, mz, 0.006), mz), (0.15, 0.01, 0.012), eye_mat, rig.body, outline=False)
    throat = rig.pivot("throat", (0, -ry * 0.72, cz - rz * 0.1))
    sphere("throatsac", (0, 0, 0), (0.12, 0.08, 0.08), toon(sp["belly"], shadow=0.35), throat, outline=False)
    rig.part(throat, "pulse", amp=0.18, phase=0.0)
    for side in (-1, 1):
        sphere(f"hind{side}", (side * rx * 0.86, ry * 0.15, 0.1), (0.14, 0.2, 0.1), main, rig.mover)
        sphere(f"front{side}", (side * rx * 0.5, -ry * 0.78, 0.05), (0.07, 0.08, 0.05), main, rig.mover)
    for extra in sp.get("extras", []):
        EXTRAS[extra](rig, sp, center, (rx, ry, rz))


def plan_quad(rig: Creature, sp: dict) -> None:
    low = sp.get("faceted", False)
    main, dark, cream = toon(sp["color"]), toon(sp["dark"]), toon(sp["belly"], shadow=0.4)
    bx, by, bz = sp.get("body", (0.2, 0.3, 0.19))
    body_c = (0, 0.1, 0.3)
    sphere("torso", body_c, (bx, by, bz), main, rig.body, low=low, smooth=not low)
    hr = sp.get("head", (0.22, 0.2, 0.2))
    head = rig.pivot("head", (0, -0.17, 0.5))
    rig.part(head, "swing", axis=0, amp=0.05, phase=0.6, droop=0.35)
    hc = (0, 0, 0)
    sphere("skull", hc, hr, main, head, low=low, smooth=not low)
    sphere("ruff", (0, -0.13, 0.33), (bx * 0.85, 0.12, 0.14), cream, rig.body, outline=False, low=low, smooth=not low)
    snout_y = surface_y(hc, hr, 0, -0.06, 0.0)
    sphere("snout", (0, snout_y - 0.02, -0.07), (0.1, 0.09, 0.07), cream, head, low=low, smooth=not low)
    sphere("nose", (0, snout_y - 0.105, -0.045), (0.035, 0.025, 0.025), toon("eye", shadow=0.0, rim=0.0), head, outline=False)
    rig.face(head, hc, hr, eye_x=hr[0] * 0.42, eye_z=0.04, eye_size=sp.get("eye", (0.045, 0.03, 0.06)), blush=sp.get("blush", True), mouth=False)
    ear_mat = toon(sp.get("ear", sp["color"]))
    inner = toon(sp.get("ear_inner", sp["dark"]))
    eh = sp.get("ear_h", 0.2)
    for side in (-1, 1):
        p = rig.pivot(f"ear{side}", (side * hr[0] * 0.55, 0.0, hr[2] * 0.75), head, rot=(0, side * 0.35, 0))
        cylinder(f"earcone{side}", (0, 0, eh / 2), 0.075, eh, ear_mat, p, verts=8 if not low else 5, radius_top=0.0, smooth=not low, scale=(1, 0.55, 1))
        cylinder(f"earin{side}", (0, -0.025, eh * 0.42), 0.045, eh * 0.7, inner, p, verts=8, radius_top=0.0, outline=False, scale=(1, 0.4, 1))
        rig.part(p, "swing", axis=1, amp=0.08 * side, phase=side * 0.5, droop=0.5 * side)
    leg_mat = main
    paw = toon(sp.get("paw", sp["dark"]))
    for i, (x, y) in enumerate(((-0.1, -0.06), (0.1, -0.06), (-0.1, 0.27), (0.1, 0.27))):
        cylinder(f"leg{i}", (x, y, 0.12), 0.05, 0.2, leg_mat, rig.mover, verts=8 if not low else 6, smooth=not low)
        sphere(f"paw{i}", (x, y - 0.015, 0.03), (0.06, 0.07, 0.04), paw, rig.mover, low=low, smooth=not low)
    tail = rig.pivot("tail", (0, 0.36, 0.36))
    rig.part(tail, "swing", axis=2, amp=0.35, phase=0.0, droop=0.0)
    TAILS[sp.get("tail", "brush")](rig, sp, tail)
    for extra in sp.get("extras", []):
        EXTRAS[extra](rig, sp, hc, hr, head)


def plan_stump(rig: Creature, sp: dict) -> None:
    bark, dark, light = toon(sp["color"], shadow=0.55), toon(sp["dark"], shadow=0.55), toon(sp["light"], shadow=0.4)
    cylinder("trunk", (0, 0, 0.32), 0.3, 0.5, bark, rig.body, verts=9, radius_top=0.25, smooth=False)
    cylinder("cut", (0, 0, 0.58), 0.25, 0.04, light, rig.body, verts=9, smooth=False)
    disc("ring", (0, 0, 0.602), 0.14, toon(sp["dark"], emission=0.9), rig.body).visible_shadow = False
    sphere("facepatch", (0, -0.2, 0.38), (0.18, 0.08, 0.14), light, rig.body, outline=False)
    center, radii = (0, 0, 0.38), (0.3, 0.29, 0.3)
    rig.face(rig.body, center, radii, eye_x=0.085, eye_z=0.42, eye_size=(0.045, 0.03, 0.06))
    crown = rig.pivot("crown", (0, 0.02, 0.6))
    import random as _r

    _canopy(crown, _r.Random(9), 4, ["leaf", "leaf_light", "leaf_dark"], spread=0.14, z=0.14, radius=(0.12, 0.16))
    rig.part(crown, "swing", axis=0, amp=0.05, phase=0.4, droop=0.3)
    for i, a in enumerate((0.6, 2.4, 3.9, 5.4)):
        cylinder(f"root{i}", (math.cos(a) * 0.3, math.sin(a) * 0.28, 0.06), 0.08, 0.26, dark, rig.mover, verts=6, radius_top=0.02, smooth=False, rot=(0, math.radians(72), a))
    for side in (-1, 1):
        p = rig.pivot(f"arm{side}", (side * 0.27, 0.0, 0.44), rot=(0, math.radians(-15), 0 if side > 0 else math.pi))
        cylinder(f"branch{side}", (0.13, 0, 0), 0.035, 0.26, bark, p, verts=6, radius_top=0.018, smooth=False, rot=(0, math.pi / 2, 0))
        _canopy(p, _r.Random(10 + side), 2, ["leaf_light", "leaf"], spread=0.04, z=0.02, radius=(0.06, 0.08))
        for c in p.children:
            if "clump" in c.name:
                c.location.x += 0.27
        rig.part(p, "swing", amp=-0.18, phase=side * 0.9, droop=0.7)
    sphere("moss", (0.18, -0.16, 0.18), (0.12, 0.08, 0.06), toon("moss_dark"), rig.body, low=True, smooth=False)
    _flower("budflower", (-0.12, 0.05, 0.62), rig.body, "petal", size=0.035, outline=True)


def tube(name, pts, radii, mat, parent, *, segs=12, outline=True):
    """Swept circle along a polyline (parallel-transport frames), capped.
    Used for serpent bodies (#392)."""
    from mathutils import Vector

    P = [Vector(p) for p in pts]
    verts, faces = [], []
    prev = None
    for i, p in enumerate(P):
        t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
        ref = prev if prev is not None else (Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0)))
        n = (ref - t * ref.dot(t)).normalized()
        prev = n
        b = t.cross(n)
        for k in range(segs):
            a = k * TAU / segs
            verts.append(tuple(p + (n * math.cos(a) + b * math.sin(a)) * radii[i]))
    for i in range(len(P) - 1):
        a0, a1 = i * segs, (i + 1) * segs
        for k in range(segs):
            k1 = (k + 1) % segs
            faces.append((a0 + k, a0 + k1, a1 + k1, a1 + k))
    c0 = len(verts)
    verts.append(tuple(P[0]))
    c1 = len(verts)
    verts.append(tuple(P[-1]))
    last = (len(P) - 1) * segs
    for k in range(segs):
        k1 = (k + 1) % segs
        faces.append((c0, k1, k))
        faces.append((c1, last + k, last + k1))
    obj = mesh_from(name, verts, faces, mat, parent, smooth=True, outline=outline)
    _recalc_normals(obj)
    return obj


def plan_serpent(rig: Creature, sp: dict) -> None:
    """Mist Serpent (#392): body coiled on the ground, neck rising to a
    finned, whiskered head that faces the camera."""
    from mathutils import Vector

    main, dark, light = toon(sp["color"]), toon(sp["dark"]), toon(sp["light"], shadow=0.35)
    n = 44
    turns = sp.get("turns", 1.75)
    coil_end = 0.66
    head = Vector(sp.get("head_at", (0.0, -0.1, 0.62)))
    pts, radii = [], []
    end = None
    for i in range(n):
        t = i / (n - 1)
        if t <= coil_end:
            u = t / coil_end
            a = u * turns * TAU
            r = 0.27 - 0.07 * u
            p = Vector((math.cos(a) * r, math.sin(a) * r * 0.9, 0.07 + 0.16 * u))
            end = p
        else:
            u = (t - coil_end) / (1 - coil_end)
            c = Vector((end.x * 0.2, end.y * 0.4 - 0.04, 0.5))
            p = end * (1 - u) ** 2 + c * 2 * u * (1 - u) + head * u * u
        pts.append(tuple(p))
        radii.append(0.022 + 0.088 * min(1.0, t / 0.3) - 0.025 * max(0.0, (t - 0.6) / 0.4))
    tube("body", pts, radii, main, rig.body)
    # Pale belly scales along the visible front of the neck.
    for i in range(int(n * 0.72), n - 2, 2):
        p = Vector(pts[i])
        sphere(f"scale{i}", (p.x, p.y - radii[i] * 0.85, p.z), (radii[i] * 0.7, 0.02, radii[i] * 0.45), light, rig.body, outline=False)
    # Dorsal fins along the coil.
    for k, i in enumerate((8, 15, 22, 29)):
        p = Vector(pts[i])
        f = rig.pivot(f"dfin{k}", (p.x, p.y, p.z + radii[i] * 0.8))
        teardrop(f"dfinm{k}", (0, 0, 0), 0.05, 0.14, light, f, squash=0.35, bend=-0.3, rot=(0, 0, math.atan2(p.y, p.x)))
        rig.part(f, "swing", axis=1, amp=0.12, phase=k * 0.8, droop=0.4)
    hp = rig.pivot("head", tuple(head))
    rig.part(hp, "swing", axis=0, amp=0.07, phase=0.5, droop=0.5)
    hr = (0.15, 0.15, 0.12)
    sphere("skull", (0, 0, 0), hr, main, hp)
    sphere("snout", (0, -0.12, -0.03), (0.09, 0.08, 0.065), main, hp)
    sphere("jaw", (0, -0.1, -0.07), (0.08, 0.07, 0.035), light, hp, outline=False)
    rig.face(hp, (0, 0, 0), hr, eye_x=0.07, eye_z=0.02, eye_size=(0.045, 0.03, 0.06), blush=True, mouth=False)
    for side in (-1, 1):
        horn = rig.pivot(f"horn{side}", (side * 0.07, 0.04, 0.09), hp, rot=(-0.5, side * 0.35, 0))
        cylinder(f"hornm{side}", (0, 0, 0.06), 0.025, 0.13, toon(sp.get("horn", "cream"), shadow=0.35), horn, verts=6, radius_top=0.0)
        wh = rig.pivot(f"whisk{side}", (side * 0.08, -0.17, -0.04), hp, rot=(0, math.radians(95), 0 if side > 0 else math.pi))
        teardrop(f"whiskm{side}", (0, 0, 0), 0.014, 0.2, light, wh, squash=1.0, bend=0.4)
        rig.part(wh, "swing", axis=1, amp=0.18, phase=side * 0.9, droop=0.6)
        fin = rig.pivot(f"earfin{side}", (side * 0.13, 0.05, 0.02), hp, rot=(0, math.radians(-40), 0 if side > 0 else math.pi))
        teardrop(f"earfinm{side}", (0, 0, 0), 0.06, 0.2, light, fin, rot=(0, math.pi / 2 - 0.3, 0), squash=0.3, bend=0.2)
        rig.part(fin, "swing", amp=0.15, phase=side * 0.6, droop=0.6)
    crest = rig.pivot("crest", (0, 0.06, 0.1), hp, rot=(-0.6, 0, 0))
    for k, (x, h) in enumerate(((-0.04, 0.16), (0.0, 0.2), (0.04, 0.15))):
        teardrop(f"crestm{k}", (x, 0, 0), 0.035, h, light, crest, squash=0.35, bend=-0.25, rot=(0, x * 4, 0))
    rig.part(crest, "swing", axis=0, amp=0.1, phase=1.2, droop=0.6)
    # Mist curling around the coil.
    ring = rig.pivot("mist", (0, 0, 0.05))
    for k in range(4):
        a = k * TAU / 4 + 0.4
        sphere(f"puff{k}", (math.cos(a) * 0.36, math.sin(a) * 0.33, 0.02 + 0.04 * (k % 2)), (0.1, 0.07, 0.05), toon(sp.get("mist", "#ece8f8"), shadow=0.2, highlight=0.4), ring, outline=False)
    rig.part(ring, "spin", amp=0.25)
    for extra in sp.get("extras", []):
        EXTRAS[extra](rig, sp, (0, 0, 0.3), (0.3, 0.3, 0.3))


def plan_lantern(rig: Creature, sp: dict) -> None:
    """Bog Lantern (#392): a floating paper lantern with a face, bronze cap
    and curled hook, a hanging tail and smoke wisps orbiting it."""
    r = sp.get("radius", 0.27)
    cz = r + 0.12
    center = (0, 0, cz)
    radii = (r, r * 0.95, r * 0.98)
    body = toon(sp["color"], shadow=0.28, highlight=0.45, rim=0.45)
    sphere("paper", center, radii, body, rig.body)
    rib = toon(sp["dark"], shadow=0.3)
    for k in range(8):
        a = k * TAU / 8 + TAU / 16
        if math.sin(a) < -0.45:
            continue  # keep the face clear
        sphere(f"rib{k}", center, (radii[0] * 1.012, 0.012, radii[2] * 1.005), rib, rig.body, outline=False, rot=(0, 0, a))
    for side in (-1, 1):
        sphere(f"swirl{side}", (side * r * 0.62, surface_y(center, radii, side * r * 0.62, cz - r * 0.35, 0.006), cz - r * 0.35), (0.05, 0.012, 0.03), toon(sp["light"], emission=1.1), rig.body, outline=False, rot=(0, side * 0.6, 0))
    bronze = toon(sp.get("cap", "#7a4a2a"), shadow=0.5, highlight=0.3)
    cylinder("cap", (0, 0, cz + r * 0.95), r * 0.48, 0.07, bronze, rig.body, verts=12, radius_top=r * 0.3)
    cylinder("capring", (0, 0, cz - r * 0.95), r * 0.42, 0.06, bronze, rig.body, verts=12, radius_top=r * 0.48)
    hook = rig.pivot("hook", (0, 0, cz + r * 1.0))
    teardrop("hookm", (0, 0, 0), 0.035, 0.22, bronze, hook, bend=-0.55, squash=0.8)
    rig.part(hook, "swing", amp=0.08, phase=0.3, droop=0.3)
    tail = rig.pivot("tail", (0, 0, cz - r * 0.98), rot=(math.pi, 0, 0))
    teardrop("tailm", (0, 0, 0), 0.05, 0.24, toon("wood", shadow=0.5), tail, bend=0.5)
    rig.part(tail, "swing", axis=1, amp=0.2, phase=0.8, droop=0.4)
    sphere("core", (0, surface_y(center, radii, 0, cz - 0.02, 0.03), cz - 0.03), (r * 0.6, 0.02, r * 0.55), toon(sp["light"], emission=1.0), rig.body, outline=False)
    rig.face(rig.body, center, radii, eye_x=r * 0.36, eye_z=cz + 0.02, eye_size=(0.058, 0.03, 0.078), blush=True, brow=None, lift=0.035)
    smoke = toon(sp.get("smoke", "#f1e6cf"), shadow=0.25, highlight=0.35)
    # Smoke curls drift behind and beside the lantern (never over the face).
    for k, (a, z) in enumerate(((0.15, 0.06), (1.6, 0.14), (2.95, 0.02))):
        p = rig.pivot(f"wisp{k}", (math.cos(a) * r * 1.25, math.sin(a) * r * 1.25 + 0.04, cz + z), rot=(0, 0, a + math.pi / 2))
        teardrop(f"wispm{k}", (0, 0, -0.1), 0.04, 0.26, smoke, p, squash=0.4, bend=0.5)
        rig.part(p, "swing", axis=0, amp=0.25, phase=k * 2.1, droop=0.5)
    for extra in sp.get("extras", []):
        EXTRAS[extra](rig, sp, center, radii)


PLANS = {
    "blob": plan_blob,
    "wisp": plan_wisp,
    "bird": plan_bird,
    "toad": plan_toad,
    "quad": plan_quad,
    "stump": plan_stump,
    "serpent": plan_serpent,
    "lantern": plan_lantern,
}


# --------------------------------------------------------------------------
# Extras (per-species features layered on a plan)
# --------------------------------------------------------------------------
def x_sprout(rig, sp, center, radii):
    top = center[2] + radii[2]
    sprout = rig.pivot("sprout", (0, 0, top - 0.02))
    stem = toon(sp["dark"])
    cylinder("stem", (0, 0, 0.07), 0.02, 0.15, stem, sprout, verts=8)
    for side in (-1, 1):
        p = empty(f"sleaf{side}", (0, 0, 0.14), sprout)
        p.rotation_euler = (0, math.radians(-30), 0 if side > 0 else math.pi)
        sphere(f"sleafm{side}", (0.1, 0, 0), (0.11, 0.03, 0.05), toon(sp["light"]), p)
    rig.part(sprout, "swing", amp=0.16, phase=0.8, droop=0.6)


def x_leaf_ears(rig, sp, center, radii):
    _leaf_ears(rig, sp, radii[0] * 0.8, center[2] + radii[2] * 0.35)


def x_tufts(rig, sp, center, radii):
    dark = toon(sp["dark"])
    for i, (x, y, z, r) in enumerate(((0.42, 0.45, 0.8, 0.29), (-0.32, 0.55, 0.75, 0.27), (0.0, 0.75, 0.4, 0.31), (0.66, 0.35, 0.35, 0.24))):
        sphere(f"tuft{i}", (x * radii[0], y * radii[1], center[2] + z * radii[2] * 0.8), (r * radii[0], r * radii[0], r * radii[0] * 0.8), dark, rig.body, low=True, smooth=False)


def x_thorn_crown(rig, sp, center, radii):
    """Bramblewarden: bramble ring + roses on the crown, leaf mantle."""
    top = center[2] + radii[2]
    crown = rig.pivot("crown", (0, 0.03, top - 0.06))
    thorn = toon("bark_dark", shadow=0.5)
    for i in range(6):
        a = i * TAU / 6 + 0.3
        cylinder(f"thorn{i}", (math.cos(a) * 0.15, math.sin(a) * 0.13, 0.08), 0.04, 0.2, thorn, crown, verts=5, radius_top=0.0, smooth=False, rot=(math.sin(a) * -0.6, math.cos(a) * 0.6, 0))
    for i in range(5):
        a = i * TAU / 5
        sphere(f"vine{i}", (math.cos(a) * 0.14, math.sin(a) * 0.12, 0.03), (0.07, 0.07, 0.05), toon(sp["dark"]), crown, low=True, smooth=False)
    _flower("rose0", (-0.12, -0.1, 0.09), crown, "rose", size=0.045, outline=True)
    _flower("rose1", (0.14, -0.04, 0.12), crown, "rose", size=0.038, outline=True)
    rig.part(crown, "swing", axis=0, amp=0.04, phase=0.5, droop=0.25)
    mantle = toon(sp["light"], shadow=0.5)
    # Leaf mantle over the shoulders and back only: the face stays clear.
    for i in range(8):
        side = 1 if i < 4 else -1
        a = -math.pi / 2 + side * (1.0 + (i % 4) * 0.42)
        p = rig.pivot(f"mantle{i}", (math.cos(a) * radii[0] * 0.92, math.sin(a) * radii[1] * 0.92, center[2] + radii[2] * 0.3), rot=(0, 0, a))
        sphere(f"mleaf{i}", (0.08, 0, -0.03), (0.13, 0.05, 0.07), mantle if i % 2 else toon(sp["dark"]), p, rot=(0, 0.6, 0))
    for side in (-1, 1):
        p = rig.pivot(f"arm{side}", (side * radii[0] * 0.95, -0.05, center[2] - 0.02), rot=(0, math.radians(35), 0 if side > 0 else math.pi))
        sphere(f"armm{side}", (0.06, 0, -0.04), (0.1, 0.09, 0.12), toon(sp["color"]), p)
        sphere(f"cuff{side}", (0.03, 0, 0.03), (0.08, 0.08, 0.04), toon(sp["dark"]), p, low=True, smooth=False)
        rig.part(p, "swing", amp=-0.12, phase=side * 0.7, droop=0.5)


def x_fin_ears(rig, sp, center, radii):
    fin = toon(sp["light"], shadow=0.35)
    for side in (-1, 1):
        p = rig.pivot(f"fin{side}", (side * radii[0] * 0.92, 0.02, center[2] + radii[2] * 0.2), rot=(0, math.radians(-22), 0 if side > 0 else math.pi))
        teardrop(f"finm{side}", (0, 0, 0), 0.09, 0.3, fin, p, rot=(0, math.pi / 2 - 0.2, 0), squash=0.3, bend=0.18)
        rig.part(p, "swing", amp=0.15, phase=side * 0.5, droop=0.7)


def x_droplet(rig, sp, center, radii):
    """Brook Nymph: water-drop topknot + lily pad with a bloom."""
    top = center[2] + radii[2]
    knot = rig.pivot("knot", (0, 0.02, top - 0.07))
    teardrop("drop", (0, 0, 0), 0.13, 0.32, toon(sp["color"], shadow=0.4, highlight=0.4), knot, bend=-0.22)
    sphere("dropshine", (-0.05, -0.1, 0.07), (0.03, 0.015, 0.045), toon("#ffffff", emission=1.0), knot, outline=False)
    rig.part(knot, "swing", amp=0.12, phase=0.9, droop=0.6)
    pad = rig.pivot("pad", (radii[0] * 0.5, 0.05, top - 0.05), rot=(0.1, 0.35, 0.4))
    cylinder("lilypad", (0, 0, 0), 0.16, 0.025, toon("lily", shadow=0.45), pad, verts=14)
    _flower("lilybloom", (0.02, 0, 0.03), pad, "petal_lilac", size=0.04, outline=True)
    rig.part(pad, "swing", axis=0, amp=0.06, phase=1.6, droop=0.3)
    tail = rig.pivot("tail", (0, radii[1] * 0.8, 0.14), rot=(math.radians(-55), 0, 0))
    teardrop("tailfin", (0, 0, 0), 0.1, 0.3, toon(sp["light"], shadow=0.35), tail, squash=0.35, bend=0.15)
    rig.part(tail, "swing", axis=1, amp=0.3, phase=0.3, droop=0.3)


def x_hearth_ring(rig, sp, center, radii):
    """Hearthflame: orbiting hearth stones + embers (spin loops by 1/5 turn)."""
    ring = rig.pivot("ring", (0, 0, 0.03))  # orbits the base, clear of the face
    mats = [toon("stone", shadow=0.55), toon("stone_dark", shadow=0.55)]
    for i in range(5):
        a = i * TAU / 5
        sphere(f"hs{i}", (math.cos(a) * 0.46, math.sin(a) * 0.42, 0.02 * (i % 2)), (0.075, 0.065, 0.06), mats[i % 2], ring, low=True, smooth=False, rot=(i, i * 0.5, 0))
        sphere(f"ember{i}", (math.cos(a + 0.6) * 0.4, math.sin(a + 0.6) * 0.36, 0.16 + 0.04 * (i % 2)), (0.022,) * 3, toon("flame_core", emission=1.4), ring, outline=False)
    rig.part(ring, "spin", amp=0.2)


def x_storm_crest(rig, sp, center, radii):
    top = center[2] + radii[2]
    crest = rig.pivot("crest", (0.0, -0.02, top - 0.03), rot=(0, 0.15, 0))
    bolt("bolt", (0, 0, 0), 0.24, toon("spark", emission=1.1), crest)
    for i, (x, a) in enumerate(((-0.06, -0.5), (0.05, 0.25))):
        teardrop(f"crestf{i}", (x, 0.04, 0), 0.04, 0.16, toon(sp["dark"]), crest, rot=(0, a, 0), squash=0.5)
    rig.part(crest, "swing", amp=0.1, phase=0.4, droop=0.6)
    spark = toon("spark", emission=1.1)
    for side in (-1, 1):
        bolt(f"wingbolt{side}", (side * radii[0] * 1.02, 0.05, center[2] - 0.08), 0.1, spark, rig.body, rot=(0, 0, side * math.pi / 2), outline=False)


def x_embers(rig, sp, center, radii):
    """Cinder Toad: basalt plates + glowing ember cracks on the back."""
    plates = toon("basalt", shadow=0.5)
    glow = toon("flame_core", emission=1.25)
    for i, (x, y) in enumerate(((-0.17, 0.08), (0.15, 0.12), (0.0, 0.24), (-0.05, -0.02), (0.22, -0.06))):
        z = center[2] + radii[2] * math.sqrt(max(0.05, 1 - (x / radii[0]) ** 2 - (y / radii[1]) ** 2)) - 0.03
        sphere(f"plate{i}", (x, y, z), (0.1, 0.085, 0.05), plates, rig.body, low=True, smooth=False, rot=(0, 0, i))
        e = rig.pivot(f"emb{i}", (x + 0.05, y - 0.04, z + 0.035))
        sphere(f"embm{i}", (0, 0, 0), (0.028, 0.028, 0.02), glow, e, outline=False)
        rig.part(e, "pulse", amp=0.25, phase=i * 1.3)


def x_rune(rig, sp, hc, hr, head):
    from models import crescent_mesh

    z = hr[2] * 0.55
    crescent_mesh("rune", 0.05, 0.015, toon("rune", emission=1.4), head, loc=(0, surface_y(hc, hr, 0, z, 0.005), z), outline=False)
    moss = toon("moss_dark")
    for i, (x, y, z2) in enumerate(((0.06, 0.1, 0.47), (-0.08, 0.2, 0.46), (0.04, 0.3, 0.42))):
        sphere(f"bmoss{i}", (x, y, z2), (0.1, 0.09, 0.05), moss, rig.body, low=True, smooth=False)


def x_fox_mask(rig, sp, hc, hr, head):
    # Cream cheeks give the fox its mask; a lantern charm on the collar.
    cream = toon(sp["belly"], shadow=0.4)
    for side in (-1, 1):
        x = side * hr[0] * 0.55
        sphere(f"cheek{side}", (x, surface_y(hc, hr, x, -0.08, 0.04), -0.08), (0.09, 0.05, 0.07), cream, head, outline=False)


def _on_body(center, radii, a, z_frac, out=0.0):
    """Point on an ellipsoid at azimuth `a` (0 = +X, -pi/2 = front) and
    height fraction `z_frac` in [-1, 1]."""
    k = math.sqrt(max(0.0, 1 - z_frac * z_frac))
    return (
        center[0] + math.cos(a) * radii[0] * k * (1 + out),
        center[1] + math.sin(a) * radii[1] * k * (1 + out),
        center[2] + z_frac * radii[2] * (1 + out),
    )


def _clear_of_face(a, z_frac):
    """True unless (a, z) is on the front face region."""
    front = abs(math.atan2(math.sin(a + math.pi / 2), math.cos(a + math.pi / 2)))
    return front > 1.0 or z_frac > 0.72 or z_frac < -0.55


def x_peat_lumps(rig, sp, center, radii):
    """Peat Sprite (#392): faceted peat clods over the head, back and sides."""
    import random as _r

    rng = _r.Random(sp.get("seed", 4))
    mats = [toon(sp["dark"], shadow=0.5), toon(sp["color"], shadow=0.5), toon(sp["light"], shadow=0.5)]
    made = 0
    while made < 16:
        a = rng.uniform(0, TAU)
        z = rng.uniform(-0.35, 0.95)
        if not _clear_of_face(a, z):
            continue
        r = rng.uniform(0.07, 0.11)
        sphere(f"lump{made}", _on_body(center, radii, a, z, -0.08), (r, r * 0.9, r * 0.85), mats[made % 3], rig.body, low=True, smooth=False, rot=(rng.random(), rng.random(), rng.random()))
        made += 1


def x_twig_horns(rig, sp, center, radii):
    wood = toon(sp.get("horn", "wood"), shadow=0.5)
    for side in (-1, 1):
        p = rig.pivot(f"twig{side}", (side * radii[0] * 0.55, 0.04, center[2] + radii[2] * 0.72), rot=(0.15, side * 0.55, 0))
        cylinder(f"twigm{side}", (0, 0, 0.13), 0.045, 0.28, wood, p, verts=6, radius_top=0.008, smooth=False)
        b = empty(f"twigb{side}", (0, 0, 0.12), p)
        b.rotation_euler = (0, side * 0.8, 0)
        cylinder(f"twigbm{side}", (0, 0, 0.05), 0.02, 0.1, wood, b, verts=5, radius_top=0.005, smooth=False)
        rig.part(p, "swing", amp=0.05, phase=side * 0.7, droop=0.25)
    _flower("sprig", (radii[0] * 0.2, 0.08, center[2] + radii[2] * 0.98), rig.body, "petal_gold", size=0.03, outline=True)


def x_stub_arms(rig, sp, center, radii):
    mat = toon(sp["color"], shadow=0.5)
    dark = toon(sp["dark"], shadow=0.5)
    for side in (-1, 1):
        p = rig.pivot(f"arm{side}", (side * radii[0] * 0.92, -0.04, center[2] - radii[2] * 0.2), rot=(0, math.radians(55), 0 if side > 0 else math.pi))
        sphere(f"armm{side}", (0.08, 0, 0), (0.1, 0.085, 0.08), mat, p, low=True, smooth=False)
        sphere(f"hand{side}", (0.17, -0.01, -0.02), (0.065, 0.065, 0.06), dark, p, low=True, smooth=False)
        rig.part(p, "swing", amp=-0.15, phase=side * 0.8, droop=0.55)


def x_ember_flecks(rig, sp, center, radii):
    import random as _r

    rng = _r.Random(7)
    glow = toon("ember", emission=1.35)
    made = 0
    while made < 9:
        a = rng.uniform(0, TAU)
        z = rng.uniform(-0.6, 0.85)
        if not _clear_of_face(a, z):
            continue
        sphere(f"fleck{made}", _on_body(center, radii, a, z, 0.02), (0.016, 0.016, 0.016), glow, rig.body, outline=False)
        made += 1


def x_peat_mantle(rig, sp, center, radii):
    """Cinder Matriarch, Mire form: a mossy peat mantle with reeds on her back
    and a smouldering seam."""
    import random as _r

    rng = _r.Random(11)
    mats = [toon(c, shadow=0.5) for c in (sp["dark"], "#5f6a3e", sp["color"])]
    for k in range(12):
        a = rng.uniform(math.pi * 0.05, math.pi * 0.95)  # back half (+Y)
        z = rng.uniform(0.15, 0.9)
        r = rng.uniform(0.09, 0.14)
        sphere(f"mantle{k}", _on_body(center, radii, a, z, -0.1), (r * 1.2, r, r * 0.7), mats[k % 3], rig.body, low=True, smooth=False, rot=(rng.random(), rng.random(), rng.random()))
    stalk = toon("#8a7a5a", shadow=0.5)
    head = toon("#6b4630", shadow=0.5)
    for k, (x, y) in enumerate(((-0.2, 0.18), (-0.12, 0.24), (0.22, 0.2), (0.15, 0.27))):
        z = center[2] + radii[2] * 0.8
        p = rig.pivot(f"reed{k}", (x, y, z), rot=(rng.uniform(-0.2, 0.1), x * 0.8, 0))
        cylinder(f"reedm{k}", (0, 0, 0.13), 0.012, 0.26, stalk, p, verts=5)
        if k % 2 == 0:
            cylinder(f"reedh{k}", (0, 0, 0.23), 0.028, 0.07, head, p, verts=8)
        rig.part(p, "swing", amp=0.08, phase=k * 0.9, droop=0.4)
    glow = toon("ember", emission=float(sp.get("seam_glow", 1.2)))
    for k in range(4):
        a = math.pi * (0.3 + 0.13 * k)
        sphere(f"seam{k}", _on_body(center, radii, a, 0.55 + 0.08 * (k % 2), 0.01), (0.05, 0.016, 0.014), glow, rig.body, outline=False, rot=(0, 0, a))


def x_ash_crown(rig, sp, center, radii):
    """Cinder Matriarch: a crown of basalt spikes behind the eye bumps."""
    mat = toon(sp.get("crown", "basalt"), shadow=0.5, highlight=0.3)
    for k in range(5):
        a = math.pi * (0.2 + 0.15 * k)
        x, y, z = _on_body(center, radii, a, 0.78, -0.05)
        h = 0.16 + 0.07 * (1 - abs(k - 2) / 2)
        cylinder(f"spike{k}", (x, y, z + h / 2 - 0.02), 0.045, h, mat, rig.body, verts=5, radius_top=0.0, smooth=False, rot=(math.sin(a) * -0.35, math.cos(a) * 0.35, 0))


def x_ember_back(rig, sp, center, radii):
    """Cinder Matriarch, Cinder form: the back splits open; flames erupt
    from glowing fissures."""
    glow = toon("flame_core", emission=1.45)
    for k in range(5):
        a = math.pi * (0.18 + 0.16 * k)
        sphere(f"rift{k}", _on_body(center, radii, a, 0.5 + 0.12 * (k % 2), 0.005), (0.09, 0.02, 0.02), glow, rig.body, outline=False, rot=(0, 0, a + math.pi / 2))
    for k, (a, z, h, ph) in enumerate(((0.3, 0.75, 0.34, 0.2), (0.5, 0.85, 0.44, 1.4), (0.7, 0.75, 0.32, 2.6), (0.42, 0.55, 0.24, 3.4), (0.6, 0.55, 0.26, 4.2))):
        x, y, zz = _on_body(center, radii, math.pi * a, z, -0.04)
        _flame_tongue(rig, f"backflame{k}", (x, y, zz), 0.07, h, ("ember", "flame_core"), tilt=(-0.25, (x / radii[0]) * 0.5, 0), bend=0.1 * (1 if x > 0 else -1), phase=ph)
    halo = disc("backhalo", (0, 0.1, center[2] + radii[2]), 0.55, radial_material("backhalo", "ember_glow", 0.4), rig.body)
    halo.rotation_euler = (math.pi / 2, 0, 0)
    halo.visible_shadow = False


EXTRAS = {
    "peat_lumps": x_peat_lumps,
    "twig_horns": x_twig_horns,
    "stub_arms": x_stub_arms,
    "ember_flecks": x_ember_flecks,
    "peat_mantle": x_peat_mantle,
    "ash_crown": x_ash_crown,
    "ember_back": x_ember_back,
    "sprout": x_sprout,
    "leaf_ears": x_leaf_ears,
    "tufts": x_tufts,
    "thorn_crown": x_thorn_crown,
    "fin_ears": x_fin_ears,
    "droplet": x_droplet,
    "hearth_ring": x_hearth_ring,
    "storm_crest": x_storm_crest,
    "embers": x_embers,
    "rune": x_rune,
    "fox_mask": x_fox_mask,
}


# --------------------------------------------------------------------------
# Tails (quadrupeds)
# --------------------------------------------------------------------------
def tail_brush(rig, sp, pivot, *, lantern=False):
    main = toon(sp["color"])
    tip = toon(sp["belly"], shadow=0.4)
    pts = [(0.0, 0.0, 0.0, 0.07), (0.0, 0.1, 0.06, 0.1), (0.0, 0.17, 0.17, 0.115), (0.0, 0.19, 0.3, 0.1)]
    for i, (x, y, z, r) in enumerate(pts):
        sphere(f"tail{i}", (x, y, z), (r, r, r * 1.05), main if i < 3 else tip, pivot)
    if lantern:
        sphere("lantern", (0, 0.17, 0.43), (0.075,) * 3, toon("lantern", emission=1.5), pivot)
        cylinder("lanterncap", (0, 0.17, 0.5), 0.045, 0.03, toon("fox_dark"), pivot, verts=8)
        halo = disc("lanternhalo", (0, 0.12, 0.43), 0.22, radial_material("lanternhalo", "lantern", 0.6), pivot)
        halo.rotation_euler = (math.pi / 2, 0, 0)
        halo.visible_shadow = False


def tail_lantern(rig, sp, pivot):
    tail_brush(rig, sp, pivot, lantern=True)


def tail_stub(rig, sp, pivot):
    sphere("stub", (0, 0.04, 0.05), (0.07, 0.08, 0.07), toon(sp["color"]), pivot, low=True, smooth=False)
    sphere("stubtip", (0, 0.07, 0.13), (0.05, 0.05, 0.06), toon(sp["dark"]), pivot, low=True, smooth=False)


TAILS = {"brush": tail_brush, "lantern": tail_lantern, "stub": tail_stub}


# --------------------------------------------------------------------------
# Species (palette names from stage.PALETTE)
# --------------------------------------------------------------------------
SPECIES: dict[str, dict] = {
    "bramblewarden": {
        "plan": "blob",
        "color": "bramble",
        "dark": "bramble_dark",
        "light": "bramble_light",
        "belly": "#a9cf7f",
        "feet": "bark",
        "body": (0.4, 0.37, 0.38),
        "eye": (0.048, 0.03, 0.062),
        "brow": "bramble_dark",
        "face_z": 0.12,
        "breath": 0.8,
        "shadow": 0.46,
        "extras": ["tufts", "thorn_crown"],
    },
    "ember-wisp": {
        "plan": "wisp",
        "color": "ember",
        "dark": "ember_deep",
        "light": "flame_core",
        "radius": 0.25,
        "height": 0.74,
        "hover": 0.1,
        "glow": "flame_core",
        "shadow": 0.3,
        "breath": 1.3,
    },
    "hearthflame": {
        "plan": "wisp",
        "color": "ember_deep",
        "dark": "hearth_red",
        "light": "flame_core",
        "radius": 0.3,
        "height": 0.92,
        "bend": 0.16,
        "hover": 0.12,
        "glow": "ember",
        "shadow": 0.38,
        "brow": "hearth_red",
        "eye": (0.05, 0.03, 0.062),
        "crown": [(-0.14, -0.6, 0.3, 0.7), (0.0, 0.05, 0.42, 1.9), (0.14, 0.6, 0.32, 3.1), (-0.05, -0.2, 0.26, 4.4)],
        "extras": ["hearth_ring"],
    },
    "brook-nymph": {
        "plan": "blob",
        "color": "water",
        "dark": "water_dark",
        "light": "water_light",
        "belly": "#d6efff",
        "body": (0.33, 0.31, 0.3),
        "eye": (0.055, 0.03, 0.075),
        "shadow": 0.36,
        "extras": ["fin_ears", "droplet"],
    },
    "thunder-finch": {
        "plan": "bird",
        "color": "storm",
        "dark": "storm_dark",
        "belly": "cream",
        "wingtip": "#3f4b78",
        "body": (0.29, 0.28, 0.28),
        "shadow": 0.34,
        "extras": ["storm_crest"],
    },
    "cinder-toad": {
        "plan": "toad",
        "color": "toad",
        "dark": "ember_deep",
        "belly": "toad_belly",
        "body": (0.4, 0.34, 0.24),
        "shadow": 0.46,
        "breath": 0.6,
        "extras": ["embers"],
    },
    "rootwalker": {
        "plan": "stump",
        "color": "bark",
        "dark": "bark_dark",
        "light": "wood_light",
        "shadow": 0.42,
        "breath": 0.5,
    },
    "lantern-fox": {
        "plan": "quad",
        "color": "fox",
        "dark": "fox_dark",
        "belly": "fox_cream",
        "ear_inner": "#5a3a2a",
        "paw": "#5a3a2a",
        "ear_h": 0.22,
        "tail": "lantern",
        "shadow": 0.42,
        "extras": ["fox_mask"],
    },
    "stone-hound": {
        "plan": "quad",
        "color": "hound",
        "dark": "hound_dark",
        "belly": "#c9c8cf",
        "ear_inner": "hound_dark",
        "paw": "hound_dark",
        "faceted": True,
        "body": (0.23, 0.32, 0.21),
        "head": (0.23, 0.21, 0.2),
        "ear_h": 0.13,
        "tail": "stub",
        "blush": False,
        "shadow": 0.45,
        "breath": 0.6,
        "extras": ["rune"],
    },
    # ---- #392: Mistwood / Emberfen spawns + the Cinder Matriarch boss ----
    "peat-sprite": {
        "plan": "blob",
        "color": "peat_body",
        "dark": "peat_body_dark",
        "light": "peat_body_light",
        "feet": "peat_body_dark",
        "body": (0.32, 0.29, 0.34),
        "eye": (0.06, 0.03, 0.08),
        "face_z": 0.12,
        "shadow": 0.4,
        "breath": 0.8,
        "horn": "wood_light",
        "extras": ["peat_lumps", "twig_horns", "stub_arms", "ember_flecks"],
    },
    "bog-lantern": {
        "plan": "lantern",
        "color": "bog_lantern",
        "dark": "bog_lantern_dark",
        "light": "flame_core",
        "radius": 0.27,
        "hover": 0.14,
        "glow": "bog_lantern",
        "shadow": 0.32,
        "breath": 0.7,
    },
    "mist-serpent": {
        "plan": "serpent",
        "color": "serpent",
        "dark": "serpent_dark",
        "light": "serpent_light",
        "glow": "serpent_light",
        "shadow": 0.42,
        "breath": 0.6,
    },
    "cinder-matriarch": {
        "plan": "toad",
        "color": "matriarch",
        "dark": "matriarch_dark",
        "belly": "matriarch_belly",
        "body": (0.52, 0.44, 0.31),
        "shadow": 0.6,
        "breath": 0.5,
        "seam_glow": 0.9,
        "lids": True,
        "extras": ["peat_mantle", "ash_crown"],
    },
    "cinder-matriarch-phase2": {
        "plan": "toad",
        "color": "matriarch_cinder",
        "dark": "matriarch_cinder_dark",
        "belly": "ember_deep",
        "bump": "matriarch_cinder_dark",
        "body": (0.52, 0.44, 0.31),
        "eye_color": "flame_core",
        "eye_glow": 1.3,
        "glow": "ember",
        "shadow": 0.62,
        "breath": 0.7,
        "crown": "char",
        "lids": True,
        "extras": ["embers", "ash_crown", "ember_back"],
    },
}
