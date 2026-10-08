"""Headless title-screen renders (#363) -> public/assets/title/*.png.

  Blender --background --factory-startup --python scripts/blender/render_title.py

Prefer `npm run render:title`. Standalone PNGs (not packed into the atlas):
TitleScene loads them directly, so this never touches public/assets/atlas.
"""

from __future__ import annotations

import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
sys.path.insert(0, HERE)

import bpy  # noqa: E402

import stage  # noqa: E402
import title_models  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "public", "assets", "title")

# (key, builder, args, (w, h), ppu, pitch, anchor_px, outline_px, pose_t)
TITLE_SPECS = [
    ("title-shrine-hill", "title-hill", {}, (1280, 760), 190, 18, 250, 4.0, 0.0),
    ("title-mossling", "mossling", {"facing_deg": 22}, (360, 380), 300, 16, 46, 5.0, 0.0),
    ("title-wisp", "wisp", {"facing_deg": -24}, (360, 420), 330, 16, 46, 5.0, 0.0),
]


def render(spec) -> None:
    key, builder, args, (w, h), ppu, pitch, anchor, outline, t = spec
    random.seed(key)
    stage.reset_scene()
    rig = title_models.BUILDERS[builder](**args)
    stage.camera(w, h, ppu, pitch, anchor)
    bpy.context.view_layer.update()
    stage.apply_outlines(outline / ppu)
    rig.pose("idle", t)
    bpy.context.view_layer.update()
    os.makedirs(OUT, exist_ok=True)
    stage.render_to(os.path.join(OUT, f"{key}.png"))
    print(f"[render] {key}: 1 frame(s)")


only = None
if "--" in sys.argv:
    rest = sys.argv[sys.argv.index("--") + 1 :]
    if "--only" in rest:
        only = set(rest[rest.index("--only") + 1].split(","))
for spec in TITLE_SPECS:
    if only is None or spec[0] in only:
        render(spec)
print(f"[render] done -> {OUT}")
