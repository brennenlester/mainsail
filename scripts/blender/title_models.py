"""Title-screen hero renders (#363): Moon Shrine hill + companions.

Built from the same stage/kit as the overworld so the title shares the
palette, outline and light rig. Static (pose() is a no-op except the wisp's
idle); TitleScene adds the night tint, glow and motion in Phaser.
"""

from __future__ import annotations

import math
import random

import models
from models import TAU, Rig, _canopy, _face_decals, _flower
from stage import cylinder, contact_shadow, empty, sphere, toon


def _hill_z(x: float, y: float, cz: float, a: float, b: float, c: float) -> float:
    """Surface height of the ellipsoid hill at (x, y) (0 outside)."""
    k = 1 - (x * x) / (a * a) - (y * y) / (b * b)
    return cz + c * math.sqrt(k) if k > 0 else cz


class TitleShrineHill(Rig):
    """Grassy knoll crowned by the Moon Shrine and a ring of standing stones."""

    def __init__(self, seed: int = 363):
        root = empty("title-hill")
        super().__init__(root)
        rng = random.Random(seed)
        a, b, c, cz = 3.3, 2.1, 0.95, -0.62
        grass = toon("grass", shadow=0.45, highlight=0.18, rim=0.35)
        grass_dark = toon("grass_dark", shadow=0.5, rim=0.2)
        sphere("hill", (0, 0, cz), (a, b, c), grass, root, low=False, smooth=False)
        for i, (x, y, s) in enumerate(((-2.6, 0.5, 1.3), (2.7, 0.3, 1.2))):
            sphere(f"shoulder{i}", (x, y, cz - 0.15), (s * 1.3, s, s * 0.6), grass_dark, root, smooth=False)

        top = _hill_z(0, 0.15, cz, a, b, c)
        altar = models.ShrineAltar()
        altar.root.parent = root
        altar.root.location = (0, 0.15, top - 0.02)
        altar.root.scale = (1.8,) * 3
        altar.pose("idle", 0.25)

        for i, ang in enumerate((200, 245, 295, 340, 25, 155)):
            r = 1.25
            x, y = math.cos(math.radians(ang)) * r * 1.25, math.sin(math.radians(ang)) * r * 0.75 + 0.2
            if y < -0.35 and abs(x) < 0.8:
                continue  # keep the front open toward the camera
            st = models.StandingStone()
            st.root.parent = root
            st.root.location = (x, y, _hill_z(x, y, cz, a, b, c) - 0.03)
            st.root.rotation_euler.z = math.radians(ang + 90) + rng.uniform(-0.2, 0.2)
            st.root.scale = (1.05,) * 3

        for x, y, seed_, sc in ((-2.35, 0.75, 4, 1.45), (2.45, 0.9, 9, 1.6), (-1.6, 1.35, 12, 1.15)):
            tree = models.Tree(seed=seed_, scale=sc)
            tree.root.parent = root
            tree.root.location = (x, y, _hill_z(x, y, cz, a, b, c) - 0.05)

        for i, (x, y, sc) in enumerate(((-1.55, -1.05, 1.15), (1.7, -0.95, 1.25), (-2.4, -0.2, 1.0), (2.45, -0.25, 0.95))):
            holder = empty(f"bush{i}", (x, y, _hill_z(x, y, cz, a, b, c) - 0.04), root)
            holder.scale = (sc,) * 3
            _canopy(holder, rng, 4, ["leaf", "leaf_light", "leaf_dark"], spread=0.2, z=0.16, radius=(0.16, 0.22))

        stone = [toon("stone", shadow=0.5), toon("stone_dark", shadow=0.5), toon("#c9c2b0")]
        for i in range(6):
            y = -1.95 + i * 0.32
            x = 0.12 * math.sin(i * 1.3)
            z = _hill_z(x, y, cz, a, b, c)
            sphere(f"path{i}", (x, y, z + 0.0), (0.17, 0.12, 0.035), stone[i % 3], root, low=True, smooth=False, rot=(0, 0, rng.uniform(0, 3)))

        blade = toon("grass_dark", shadow=0.5, rim=0.0)
        for i in range(90):
            x, y = rng.uniform(-3.0, 3.0), rng.uniform(-1.9, 1.6)
            z = _hill_z(x, y, cz, a, b, c)
            if z <= cz + 0.05 or math.hypot(x, y - 0.15) < 0.85:
                continue
            if rng.random() < 0.3:
                _flower(f"hf{i}", (x, y, z), root, ["petal", "petal_lilac", "petal_gold"][i % 3], size=0.045)
            else:
                sphere(f"hb{i}", (x, y, z), (0.1, 0.022, 0.03), blade, root, outline=False, rot=(0, 0, rng.uniform(0, TAU)))


class Wisp(Rig):
    """Ember Wisp in the toon style: flame-drop body, glowing heart, tiny arms."""

    def __init__(self, facing_deg: float = 0.0, scale: float = 1.0):
        root = empty("wisp")
        root.rotation_euler.z = math.radians(facing_deg)
        root.scale = (scale,) * 3
        super().__init__(root)
        self.body = empty("body", (0, 0, 0.5), root)
        flame = toon("ember", shadow=0.35, highlight=0.4, rim=0.4)
        dark = toon("ember_dark", shadow=0.4, rim=0.3)
        glow = toon("ember_glow", emission=1.5)
        sphere("belly", (0, 0, 0), (0.3, 0.27, 0.31), flame, self.body)
        tongues = (
            (0.0, 0.04, 0.12, 0.25, 0.42, 0.18, flame),
            (0.18, 0.05, 0.06, 0.13, 0.26, -0.65, dark),
            (-0.19, 0.05, 0.05, 0.13, 0.24, 0.7, dark),
            (-0.06, 0.13, 0.18, 0.12, 0.26, 0.45, flame),
        )
        self.tongues = []
        for i, (x, y, z, r, h, tilt, mat) in enumerate(tongues):
            pivot = empty(f"tongue{i}", (x, y, z), self.body)
            pivot.rotation_euler = (0, tilt, 0)
            cylinder(f"cone{i}", (0, 0, h / 2), r, h, mat, pivot, verts=12, radius_top=0.0)
            self.tongues.append((pivot, tilt))
        cylinder("tail", (0.03, 0.05, -0.27), 0.015, 0.2, dark, self.body, verts=10, radius_top=0.17, rot=(0.2, 0.15, 0))
        sphere("heart", (0, -0.235, -0.16), (0.07, 0.04, 0.055), glow, self.body, outline=False)
        _face_decals(self.body, 0.1, -0.262, 0.04, (0.046, 0.03, 0.066), 0.185, -0.225, -0.04)
        sphere("mouth", (0, -0.29, -0.045), (0.028, 0.01, 0.012), toon("eye", shadow=0.0, highlight=0.0, rim=0.0), self.body, outline=False)
        for side in (-1, 1):
            sphere(f"arm{side}", (side * 0.3, -0.04, -0.05), (0.07, 0.06, 0.09), dark, self.body, rot=(0, side * 0.5, 0))
        contact_shadow(root, radius=0.26, squash=0.85, alpha=0.24)

    def pose(self, anim: str, t: float) -> None:
        s = math.sin(TAU * t)
        self.body.location.z = 0.5 + 0.03 * s
        for i, (pivot, tilt) in enumerate(self.tongues):
            pivot.rotation_euler.y = tilt + 0.08 * math.sin(TAU * t + i)


BUILDERS = {
    "title-hill": TitleShrineHill,
    "wisp": Wisp,
    "mossling": models.Mossling,
}
