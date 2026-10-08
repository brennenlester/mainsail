"""Hearth Crossing / Moon Shrine kit + villagers (#361).

Same stage, light rig and palette as models.py. Villagers share one
parametric body (`Villager`, `VILLAGERS` table) so all three read as one
cast next to the player; props are static (pose() no-op) except lanterns.
"""

from __future__ import annotations

import math
import random

from models import TAU, Rig, _face_decals, _flower, crescent_mesh
from stage import box, contact_shadow, cylinder, disc, empty, mesh_from, radial_material, sphere, toon


# --------------------------------------------------------------------------
# Villagers
# --------------------------------------------------------------------------
VILLAGERS = {
    # Warden Bryn: stout ward-keeper, brimmed hat, vest + scarf, map scroll.
    "warden-bryn": {
        "robe": "#8a5a3a", "robe_dark": "#6a4128", "shirt": "#efe3c8", "sash": "#c8574a",
        "hair": "#7c4a34", "girth": 1.18, "hat": "brim", "hat_color": "#9b6a43",
        "beard": False, "item": "scroll",
    },
    # Weaver Sable: slim, dark bun, plum robe with a red sash, holds a spool.
    "weaver-sable": {
        "robe": "#8e6a9e", "robe_dark": "#6b4c7c", "shirt": "#f3ead3", "sash": "#b8434e",
        "hair": "#2e2a3e", "girth": 0.9, "hat": "bun", "hat_color": "#2e2a3e",
        "beard": False, "item": "spool",
    },
    # Hearthkeep Odd: round, red cap, ginger beard, apron, kettle.
    "hearthkeep-odd": {
        "robe": "#f0e2c4", "robe_dark": "#d8c6a2", "shirt": "#f0e2c4", "sash": "#b9502e",
        "hair": "#c8743a", "girth": 1.25, "hat": "cap", "hat_color": "#c8402c",
        "beard": True, "item": "kettle", "apron": "#b9502e",
    },
    # Reed (hermit / fusion sage): grey-teal cloak, hood, staff with a moon.
    "island-hermit-reed": {
        "robe": "#5f8a96", "robe_dark": "#46707c", "shirt": "#e6dcc4", "sash": "#e8b85a",
        "hair": "#d8d4cc", "girth": 1.0, "hat": "hood", "hat_color": "#46707c",
        "beard": True, "item": "staff",
    },
}


class Villager(Rig):
    def __init__(self, npc: str, facing_deg: float = -12.0):
        v = VILLAGERS[npc]
        root = empty(npc)
        root.rotation_euler.z = math.radians(facing_deg)
        super().__init__(root)
        g = v["girth"]
        robe, robe_dark = toon(v["robe"]), toon(v["robe_dark"])
        skin = toon("skin", shadow=0.38)
        hair = toon(v["hair"])
        boot = toon("boot")
        self.body = empty("body", (0, 0, 0), root)
        for side in (-1, 1):
            sphere(f"boot{side}", (side * 0.09 * g, -0.04, 0.05), (0.075, 0.11, 0.06), boot, root)
        cylinder("robe", (0, 0, 0.3), 0.24 * g, 0.5, robe, self.body, verts=16, radius_top=0.17 * g, scale=(1, 0.82, 1))
        cylinder("hem", (0, 0, 0.07), 0.245 * g, 0.06, robe_dark, self.body, verts=16, scale=(1, 0.83, 1), outline=False)
        cylinder("sash", (0, 0, 0.4), 0.205 * g, 0.06, toon(v["sash"]), self.body, verts=16, scale=(1, 0.83, 1), outline=False)
        if v.get("apron"):
            box("apron", (0, -0.17 * g, 0.24), (0.24 * g, 0.03, 0.3), toon(v["apron"]), self.body, rot=(0.12, 0, 0))
        sphere("collar", (0, -0.01, 0.6), (0.15 * g, 0.13 * g, 0.045), toon(v["shirt"]), self.body)
        self.arms = []
        for side in (-1, 1):
            p = empty(f"arm{side}", (side * 0.2 * g, 0, 0.56), self.body)
            p.rotation_euler.y = side * 0.18
            cylinder(f"sleeve{side}", (0, 0, -0.11), 0.06, 0.24, robe_dark, p, verts=10, radius_top=0.05)
            sphere(f"hand{side}", (0, 0, -0.25), (0.055,) * 3, skin, p)
            self.arms.append(p)
        self.head = empty("head", (0, 0, 0.62), self.body)
        sphere("skull", (0, 0, 0.2), (0.23, 0.22, 0.215), skin, self.head)
        sphere("hairback", (0, 0.07, 0.25), (0.24, 0.22, 0.22), hair, self.head)
        _face_decals(self.head, 0.085, -0.2, 0.18, (0.038, 0.022, 0.055), 0.14, -0.175, 0.1)
        self.mouth = sphere("mouth", (0, -0.212, 0.085), (0.035, 0.012, 0.012), toon("eye", shadow=0.0, highlight=0.0, rim=0.0), self.head, outline=False)
        if v["beard"]:
            sphere("beard", (0, -0.13, 0.05), (0.17, 0.11, 0.12), hair, self.head)
            sphere("moustache", (0, -0.2, 0.1), (0.09, 0.03, 0.03), hair, self.head, outline=False)
            self.mouth.hide_render = True
        hat = toon(v["hat_color"])
        kind = v["hat"]
        if kind == "brim":
            cylinder("brim", (0, 0.02, 0.36), 0.33, 0.035, hat, self.head, verts=20, rot=(0.12, 0, 0))
            cylinder("crown", (0, 0.03, 0.44), 0.17, 0.16, hat, self.head, verts=14, radius_top=0.15)
            cylinder("band", (0, 0.03, 0.39), 0.172, 0.04, toon(v["sash"]), self.head, verts=14, outline=False)
        elif kind == "bun":
            sphere("fringe", (0, -0.12, 0.33), (0.2, 0.1, 0.07), hair, self.head)
            sphere("bun", (0, 0.1, 0.46), (0.11, 0.1, 0.1), hair, self.head)
            cylinder("pin", (0.06, 0.1, 0.5), 0.012, 0.22, toon("banner_gold"), self.head, verts=6, rot=(0, 1.1, 0), outline=False)
        elif kind == "cap":
            sphere("cap", (0, 0.02, 0.33), (0.25, 0.235, 0.16), hat, self.head)
            sphere("pom", (0.0, 0.08, 0.5), (0.07,) * 3, toon("cream"), self.head)
            cylinder("cuff", (0, 0.0, 0.27), 0.245, 0.06, toon("#e2dccb"), self.head, verts=18)
        elif kind == "hood":
            sphere("hood", (0, 0.04, 0.26), (0.27, 0.26, 0.25), hat, self.head)
            sphere("hoodopen", (0, -0.12, 0.2), (0.2, 0.12, 0.2), skin, self.head, outline=False)
        item = v["item"]
        hand = self.arms[1]
        if item == "scroll":
            cylinder("scroll", (0.0, -0.06, -0.27), 0.04, 0.24, toon("plaster"), hand, verts=10, rot=(0, math.pi / 2, 0.3))
        elif item == "spool":
            cylinder("spool", (0, -0.06, -0.28), 0.06, 0.1, toon("#c9b2e6"), hand, verts=12)
            cylinder("spoolends", (0, -0.06, -0.28), 0.075, 0.03, toon("wood"), hand, verts=12, outline=False)
        elif item == "kettle":
            sphere("kettle", (0.02, -0.08, -0.33), (0.1, 0.09, 0.08), toon("#a8714a"), hand)
            cylinder("spout", (0.11, -0.08, -0.31), 0.02, 0.1, toon("#a8714a"), hand, verts=6, rot=(0, 1.0, 0))
        elif item == "staff":
            cylinder("staff", (0.0, -0.04, 0.0), 0.022, 1.1, toon("wood"), hand, verts=6)
            crescent_mesh("staffmoon", 0.07, 0.02, toon("moon", emission=1.2), hand, loc=(0, -0.05, 0.6))
        contact_shadow(root, radius=0.3 * g, alpha=0.3)

    def pose(self, anim: str, t: float) -> None:
        s = math.sin(TAU * t)
        self.body.scale = (1 + 0.012 * s, 1 + 0.012 * s, 1 + 0.018 * s)
        self.head.rotation_euler = (0, 0, 0)
        self.head.location.z = 0.62 + 0.006 * s
        self.arms[0].rotation_euler.x = 0.03 * s
        self.arms[1].rotation_euler.x = -0.03 * s
        self.mouth.scale = (0.035, 0.012, 0.012)
        if anim == "talk":
            # Nod + an open-hand gesture; mouth opens on beats.
            self.head.rotation_euler = (0.08 * math.sin(TAU * t * 2), 0, 0.06 * s)
            self.arms[0].rotation_euler = (-0.55 - 0.25 * math.sin(TAU * t), -0.3, 0)
            self.mouth.scale = (0.035, 0.012, 0.012 + 0.02 * abs(math.sin(TAU * t * 2)))


# --------------------------------------------------------------------------
# Wren, the rival (#392): the player's chibi build (legs that walk) with her
# own silhouette and signature rust red: short hooded capelet, high swinging
# ponytail with a wren feather, walking staff, tall boots.
# --------------------------------------------------------------------------
class Wren(Rig):
    def __init__(self, facing_deg: float = -12.0, staff: bool = True):
        root = empty("wren")
        root.rotation_euler.z = math.radians(facing_deg)
        super().__init__(root)
        red, red_dark = toon("wren_red"), toon("wren_red_dark")
        trim = toon("wren_trim")
        shirt = toon("cream", shadow=0.45)
        legs = toon("wren_legs")
        boot = toon("boot")
        sleeve = toon("wren_sleeve")
        skin = toon("skin", shadow=0.38)
        hair = toon("wren_hair")

        self.hip = empty("hip", (0, 0, 0.36), root)
        self.legs = []
        for side in (-1, 1):
            p = empty(f"leg{side}", (side * 0.08, 0, 0), self.hip)
            cylinder(f"thigh{side}", (0, 0, -0.12), 0.055, 0.22, legs, p, verts=10)
            cylinder(f"bootleg{side}", (0, -0.005, -0.25), 0.062, 0.14, boot, p, verts=10)
            cylinder(f"cuff{side}", (0, -0.005, -0.18), 0.07, 0.035, toon("wren_cuff"), p, verts=10, outline=False)
            sphere(f"foot{side}", (0, -0.04, -0.31), (0.07, 0.11, 0.055), boot, p)
            self.legs.append(p)
        self.torso = empty("torso", (0, 0, 0.0), self.hip)
        cylinder("tunic", (0, 0, 0.15), 0.17, 0.32, shirt, self.torso, verts=14, radius_top=0.13, scale=(1, 0.8, 1))
        cylinder("belt", (0, 0, 0.04), 0.175, 0.05, toon("satchel"), self.torso, verts=14, scale=(1, 0.82, 1), outline=False)
        box("pouch", (0.13, -0.1, 0.02), (0.08, 0.05, 0.08), toon("satchel"), self.torso, rot=(0, 0, 0.5), bevel=0.01)
        # Capelet: wide cone over the shoulders, gold-trimmed hem, clasp.
        cylinder("cape", (0, 0.01, 0.25), 0.27, 0.2, red, self.torso, verts=16, radius_top=0.12, scale=(1, 0.86, 1))
        cylinder("capehem", (0, 0.01, 0.152), 0.272, 0.025, trim, self.torso, verts=16, scale=(1, 0.86, 1), outline=False)
        sphere("hoodroll", (0, 0.09, 0.35), (0.16, 0.1, 0.07), red_dark, self.torso)
        sphere("clasp", (0, -0.115, 0.33), (0.03, 0.02, 0.03), toon("banner_gold"), self.torso, outline=False)
        self.cape_tail = empty("capetail", (0, 0.2, 0.3), self.torso)
        sphere("capeback", (0, 0.0, -0.08), (0.2, 0.05, 0.14), red, self.cape_tail)
        self.arms = []
        for side in (-1, 1):
            p = empty(f"arm{side}", (side * 0.19, 0, 0.27), self.torso)
            p.rotation_euler.y = side * 0.14
            cylinder(f"sleeve{side}", (0, 0, -0.09), 0.048, 0.2, sleeve, p, verts=10)
            cylinder(f"glove{side}", (0, 0, -0.19), 0.05, 0.05, toon("satchel"), p, verts=10, outline=False)
            sphere(f"hand{side}", (0, 0, -0.225), (0.05, 0.05, 0.05), skin, p)
            self.arms.append(p)
        if staff:
            cylinder("staff", (0.0, -0.05, 0.02), 0.022, 1.02, toon("wood"), self.arms[1], verts=6)
            sphere("staffknot", (0.0, -0.05, 0.53), (0.04, 0.04, 0.05), toon("bark"), self.arms[1])
            cylinder("staffwrap", (0.0, -0.05, 0.42), 0.027, 0.05, trim, self.arms[1], verts=6, outline=False)
        self.head = empty("head", (0, 0, 0.36), self.torso)
        sphere("skull", (0, 0, 0.2), (0.23, 0.22, 0.215), skin, self.head)
        sphere("hairback", (0, 0.07, 0.26), (0.24, 0.22, 0.22), hair, self.head)
        # Side-swept bangs + a lock over one eye side.
        sphere("bangs", (-0.05, -0.13, 0.33), (0.2, 0.1, 0.075), hair, self.head, rot=(0, 0.25, 0))
        for side in (-1, 1):
            sphere(f"sidehair{side}", (side * 0.2, -0.03, 0.17), (0.06, 0.08, 0.12), hair, self.head)
        # High side ponytail (her right) with a red tie: reads from the front
        # and swings on its own pivot.
        sphere("tie", (0.17, 0.08, 0.36), (0.055, 0.05, 0.05), red, self.head)
        self.tail = empty("pony", (0.2, 0.09, 0.37), self.head)
        teardrop_tail = [(0.04, 0.02, 0.0, 0.08), (0.08, 0.03, -0.08, 0.085), (0.1, 0.04, -0.18, 0.075), (0.1, 0.04, -0.28, 0.055), (0.09, 0.03, -0.35, 0.035)]
        for i, (x, y, z, r) in enumerate(teardrop_tail):
            sphere(f"pony{i}", (x, y, z), (r, r * 0.9, r * 1.2), hair, self.tail)
        # Wren feather tucked behind the left ear (ochre with a dark bar).
        feather = empty("feather", (-0.21, 0.06, 0.3), self.head)
        feather.rotation_euler = (0.7, -1.0, 0)
        sphere("vane", (0, 0, 0.08), (0.026, 0.01, 0.09), toon("wren_feather"), feather)
        for k in range(2):
            sphere(f"bar{k}", (0, -0.011, 0.05 + k * 0.05), (0.024, 0.004, 0.01), toon("bark_dark"), feather, outline=False)
        # Face: slightly narrower eyes, angled brows, freckles, smirk.
        _face_decals(self.head, 0.088, -0.203, 0.17, (0.038, 0.022, 0.052), 0.145, -0.18, 0.1)
        for side in (-1, 1):
            b = sphere(f"brow{side}", (side * 0.09, -0.206, 0.245), (0.045, 0.012, 0.012), hair, self.head, outline=False)
            b.rotation_euler = (0, -side * 0.28, 0)
            for k in range(2):
                sphere(f"freckle{side}{k}", (side * (0.12 + 0.025 * k), -0.19, 0.125 + 0.012 * k), (0.008, 0.004, 0.008), toon("#a8643d"), self.head, outline=False)
        self.mouth = sphere("mouth", (0.02, -0.213, 0.088), (0.042, 0.012, 0.008), toon("eye", shadow=0.0, highlight=0.0, rim=0.0), self.head, outline=False, rot=(0, -0.22, 0))
        contact_shadow(None, radius=0.25, squash=1.0, alpha=0.3)

    def pose(self, anim: str, t: float) -> None:
        s = math.sin(TAU * t)
        c = math.cos(TAU * t)
        for leg in self.legs:
            leg.rotation_euler = (0, 0, 0)
        self.torso.rotation_euler = (0, 0, 0)
        self.torso.scale = (1, 1, 1)
        self.head.rotation_euler = (0, 0, 0)
        self.head.location.z = 0.36
        self.hip.location.z = 0.36
        self.arms[0].rotation_euler = (0, -0.14, 0)
        self.arms[1].rotation_euler = (0, 0.14, 0)
        self.mouth.scale = (0.042, 0.012, 0.008)
        self.tail.rotation_euler = (0, 0, 0)
        self.cape_tail.rotation_euler = (0, 0, 0)
        if anim == "walk":
            swing = 0.55 * s
            self.legs[0].rotation_euler.x = swing
            self.legs[1].rotation_euler.x = -swing
            self.arms[0].rotation_euler.x = -0.5 * s
            self.arms[1].rotation_euler.x = 0.25 * s
            self.torso.rotation_euler.z = 0.07 * s
            self.hip.location.z = 0.36 - 0.014 * abs(c)
            self.tail.rotation_euler = (-0.25 - 0.2 * abs(c), 0.15 * s, 0)
            self.cape_tail.rotation_euler = (-0.25 - 0.12 * abs(c), 0, 0)
            return
        breath = 0.012 * s
        self.torso.scale = (1 + breath, 1 + breath, 1 + 0.02 * s)
        self.head.location.z = 0.36 + 0.008 * s
        self.tail.rotation_euler = (0.06 * s, 0.1 * math.sin(TAU * t + 0.8), 0)
        if anim == "talk":
            # Hand on hip, chin up, the other hand gestures; mouth on beats.
            self.arms[0].rotation_euler = (-0.2, -0.9, 0.3)
            self.arms[1].rotation_euler = (-0.35 - 0.2 * math.sin(TAU * t), 0.3, 0)
            self.head.rotation_euler = (-0.06 + 0.06 * math.sin(TAU * t * 2), 0, 0.08 * s)
            self.mouth.scale = (0.038, 0.012, 0.008 + 0.018 * abs(math.sin(TAU * t * 2)))
            self.tail.rotation_euler = (0.1 * s, 0.18 * math.sin(TAU * t + 0.8), 0)


# --------------------------------------------------------------------------
# Props
# --------------------------------------------------------------------------
class Gate(Rig):
    """Village gate: timber arch with a little roof. Locked = shut + bar."""

    def __init__(self, locked: bool = False, scale: float = 1.0):
        root = empty("gate")
        root.scale = (scale,) * 3
        super().__init__(root)
        timber = toon("bark", shadow=0.5)
        wood = toon("wood", shadow=0.5)
        roof = toon("roof", shadow=0.5)
        stone = toon("stone", shadow=0.5)
        for sx in (-1, 1):
            box(f"base{sx}", (sx * 0.42, 0, 0.06), (0.17, 0.17, 0.12), stone, root, bevel=0.02)
            box(f"post{sx}", (sx * 0.42, 0, 0.36), (0.1, 0.1, 0.62), timber, root)
        box("lintel", (0, 0, 0.69), (1.04, 0.12, 0.08), timber, root)
        for side in (-1, 1):
            box(f"roof{side}", (side * 0.27, 0, 0.8), (0.62, 0.26, 0.04), roof, root, rot=(0, side * 0.42, 0))
        _lamp(root, (0.0, -0.08, 0.6), small=True)
        if locked:
            for sx in (-1, 1):
                for k in range(3):
                    box(f"plank{sx}{k}", (sx * (0.07 + k * 0.11), 0, 0.33), (0.1, 0.05, 0.56), wood if k % 2 else timber, root)
            box("bar", (0, -0.04, 0.36), (0.78, 0.04, 0.06), toon("#5a4c48"), root)
            box("lock", (0, -0.07, 0.33), (0.08, 0.04, 0.09), toon("banner_gold"), root)
        else:
            for sx in (-1, 1):
                p = empty(f"door{sx}", (sx * 0.37, 0, 0), root)
                p.rotation_euler.z = sx * math.radians(-70)
                for k in range(3):
                    box(f"plank{sx}{k}", (-sx * (0.05 + k * 0.1), 0, 0.33), (0.09, 0.04, 0.56), wood if k % 2 else timber, p)
            for i in range(4):
                sphere(f"step{i}", ((i - 1.5) * 0.14, -0.05 + 0.04 * (i % 2), 0.01), (0.07, 0.06, 0.02), stone, root, low=True, smooth=False)
        contact_shadow(root, radius=0.5, squash=0.4, alpha=0.28)


def _lamp(parent, loc, small=False):
    k = 0.6 if small else 1.0
    holder = empty("lamp", loc, parent)
    box("lampcap", (0, 0, 0.09 * k), (0.12 * k, 0.12 * k, 0.03), toon("#3d3a44"), holder)
    box("lampglass", (0, 0, 0.0), (0.09 * k, 0.09 * k, 0.14 * k), toon("window", emission=1.4), holder)
    halo = disc("lamphalo", (0, -0.06, 0.0), 0.22 * k, radial_material("lamphalo", "window", 0.5), holder)
    halo.rotation_euler = (math.pi / 2, 0, 0)
    halo.visible_shadow = False
    return holder


class LanternPost(Rig):
    def __init__(self, moon: bool = False):
        root = empty("lanternpost")
        super().__init__(root)
        post = toon("#4a4048")
        cylinder("pole", (0, 0, 0.45), 0.035, 0.9, post, root, verts=8)
        cylinder("foot", (0, 0, 0.04), 0.09, 0.08, toon("stone"), root, verts=8)
        box("arm", (0.09, 0, 0.86), (0.2, 0.03, 0.03), post, root)
        if moon:
            holder = empty("moonlamp", (0.17, 0, 0.66), root)
            sphere("orb", (0, 0, 0), (0.09,) * 3, toon("moon", emission=1.3), holder)
            halo = disc("orbhalo", (0, 0.04, 0), 0.3, radial_material("orbhalo", "moon_glow", 0.5), holder)
            halo.rotation_euler = (math.pi / 2, 0, 0)
            halo.visible_shadow = False
            cylinder("chain", (0.17, 0, 0.78), 0.008, 0.14, post, root, verts=4, outline=False)
        else:
            cylinder("chain", (0.17, 0, 0.8), 0.008, 0.1, post, root, verts=4, outline=False)
            _lamp(root, (0.17, 0, 0.67))
        _flower("lf", (-0.1, -0.06, 0.02), root, "petal", size=0.03, outline=True)
        contact_shadow(root, radius=0.22, alpha=0.3)


class Banner(Rig):
    def __init__(self):
        root = empty("banner")
        super().__init__(root)
        pole = toon("bark")
        cylinder("pole", (0, 0, 0.6), 0.03, 1.2, pole, root, verts=8)
        sphere("finial", (0, 0, 1.23), (0.045,) * 3, toon("banner_gold"), root)
        box("bar", (0.14, 0, 1.12), (0.32, 0.03, 0.03), pole, root)
        cloth = toon("banner")
        verts = [(0.0, 0, 1.1), (0.3, 0, 1.1), (0.3, -0.02, 0.62), (0.15, -0.03, 0.72), (0.0, -0.02, 0.62)]
        mesh_from("cloth", [(x + 0.0, y, z) for x, y, z in verts], [(0, 1, 2, 3, 4)], cloth, root)
        mesh_from("clothb", [(x, y + 0.01, z) for x, y, z in verts], [(4, 3, 2, 1, 0)], cloth, root, outline=False)
        crescent_mesh("emblem", 0.06, 0.01, toon("banner_gold", emission=1.0), root, loc=(0.15, -0.03, 0.92), outline=False)
        cylinder("foot", (0, 0, 0.04), 0.1, 0.08, toon("stone"), root, verts=8)
        contact_shadow(root, radius=0.22, alpha=0.3)


class MarketStall(Rig):
    def __init__(self):
        root = empty("stall")
        super().__init__(root)
        rng = random.Random(4)
        wood, timber = toon("wood"), toon("bark")
        box("counter", (0, 0, 0.22), (0.9, 0.42, 0.44), wood, root, bevel=0.02)
        box("top", (0, 0, 0.45), (0.96, 0.48, 0.04), timber, root)
        for sx in (-1, 1):
            for sy in (-1, 1):
                cylinder(f"post{sx}{sy}", (sx * 0.44, sy * 0.2, 0.55), 0.025, 1.1 if sy > 0 else 0.92, timber, root, verts=6)
        # Striped awning sloping to the front.
        for i in range(6):
            col = toon("banner") if i % 2 else toon("awning")
            box(f"awn{i}", (-0.42 + i * 0.168, -0.02, 1.02), (0.17, 0.62, 0.025), col, root, rot=(-0.32, 0, 0), outline=i in (0, 5))
        for i in range(6):
            col = toon("banner") if i % 2 else toon("awning")
            sphere(f"scal{i}", (-0.42 + i * 0.168, -0.33, 0.9), (0.085, 0.02, 0.05), col, root, outline=False)
        goods = [("#e2768a", 0.07), ("#f2c75c", 0.06), ("#86bb5a", 0.07), ("#e6a34f", 0.06), ("#c9b2e6", 0.065)]
        for i in range(7):
            c, r = goods[i % len(goods)]
            sphere(f"good{i}", (-0.34 + i * 0.11 + rng.uniform(-0.02, 0.02), -0.06 + rng.uniform(-0.06, 0.06), 0.5 + r * 0.6), (r,) * 3, toon(c), root)
        box("crate", (0.36, -0.3, 0.1), (0.2, 0.2, 0.2), wood, root, rot=(0, 0, 0.3), bevel=0.01)
        sphere("sack", (-0.38, -0.3, 0.12), (0.12, 0.11, 0.13), toon("awning"), root)
        contact_shadow(root, radius=0.62, squash=0.6, alpha=0.28)


class Fence(Rig):
    """Village boundary block: picket fence + low hedge; rails bleed past the
    tile so neighbours join."""

    def __init__(self, seed: int = 13):
        root = empty("fence")
        super().__init__(root)
        rng = random.Random(seed)
        wood, timber = toon("wood"), toon("bark")
        leaf = [toon(c, shadow=0.55, highlight=0.3) for c in ("leaf", "leaf_light")]
        for i, x in enumerate((-0.36, 0.0, 0.36)):
            sphere(f"h{i}", (x, 0.12, 0.2), (0.24, 0.18, 0.2), leaf[i % 2], root, low=True, smooth=False, rot=(rng.random(), rng.random(), 0))
        for z in (0.2, 0.4):
            box(f"rail{z}", (0, -0.05, z), (1.06, 0.04, 0.05), timber, root)
        for i, x in enumerate((-0.375, -0.125, 0.125, 0.375)):
            h = 0.52 + 0.04 * (i % 2)
            box(f"picket{i}", (x, -0.08, h / 2), (0.085, 0.04, h), wood, root)
            cylinder(f"tip{i}", (x, -0.08, h + 0.03), 0.06, 0.07, wood, root, verts=4, radius_top=0.0, rot=(0, 0, math.pi / 4), smooth=False)


class ShrineBoundary(Rig):
    """Moon Shrine boundary: lilac-flecked hedge with pale moonstone pillars."""

    def __init__(self, seed: int = 17):
        root = empty("shrinewall")
        super().__init__(root)
        rng = random.Random(seed)
        leaf = [toon(c, shadow=0.55, highlight=0.3) for c in ("#4f7f6a", "#5f8f78", "#466f5e")]
        for i, x in enumerate((-0.48, -0.16, 0.16, 0.48)):
            r = rng.uniform(0.26, 0.31)
            sphere(f"h{i}", (x, 0.04, 0.24 + rng.uniform(0, 0.05)), (r, r * 0.85, r * 0.9), leaf[i % 3], root, low=True, smooth=False, rot=(rng.random(), rng.random(), rng.random()))
        stone = toon("#c9c6d8", shadow=0.5)
        box("pillar", (0.0, -0.12, 0.42), (0.2, 0.18, 0.84), stone, root, rot=(0, 0, 0.12), bevel=0.04)
        box("cap", (0.0, -0.12, 0.86), (0.26, 0.22, 0.06), toon("stone_dark"), root, rot=(0, 0, 0.12))
        crescent_mesh("glyph", 0.06, 0.015, toon("moon_glow", emission=1.5), root, loc=(0.0, -0.215, 0.55), outline=False)
        for i in range(3):
            _flower(f"sf{i}", (-0.35 + i * 0.3, -0.18, 0.1 + 0.05 * (i % 2)), root, "petal_lilac", size=0.035, outline=True)


class Backdrop(Rig):
    """Top-down forest canopy tile (seamless) that fills the space outside a
    zone so the playfield sits in a clearing instead of a flat void."""

    def __init__(self, seed: int = 31, colors=("leaf_dark", "leaf", "#356b3c"), ground="#3f6e41", accents=None):
        root = empty("canopy")
        super().__init__(root)
        rng = random.Random(seed)
        box("floor", (0, 0, -0.3), (3.2, 3.2, 0.1), toon(ground, shadow=0.4, rim=0.0), root, outline=False)
        mats = [toon(c, shadow=0.55, highlight=0.25, rim=0.0) for c in colors]
        pts = []
        # Poisson-ish jittered grid, wrapped 3x3 so the tile is seamless.
        n = 4
        for gy in range(n):
            for gx in range(n):
                pts.append(((gx + rng.uniform(0.15, 0.85)) / n, (gy + rng.uniform(0.15, 0.85)) / n, rng.uniform(0.17, 0.23), rng.randrange(len(mats)), rng.random()))
        for i, (u, v, r, m, rot) in enumerate(pts):
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    x, y = u - 0.5 + dx, v - 0.5 + dy
                    if abs(x) > 0.5 + r or abs(y) > 0.5 + r:
                        continue
                    sphere(f"c{i}_{dx}{dy}", (x, y, 0.0), (r, r, r * 0.7), mats[m], root, low=True, smooth=False, rot=(rot, rot * 2, rot * 3), outline=False)
                    if accents and i % 5 == 0:
                        _flower(f"a{i}_{dx}{dy}", (x + 0.03, y - 0.03, r * 0.72), root, accents, size=0.03)


BUILDERS = {
    "wren": Wren,
    "villager": Villager,
    "gate": Gate,
    "lantern": LanternPost,
    "banner": Banner,
    "stall": MarketStall,
    "fence": Fence,
    "shrine-boundary": ShrineBoundary,
    "canopy": Backdrop,
}
