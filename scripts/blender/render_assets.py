"""Headless entry point: render every spec in specs.SPECS to PNG frames.

  Blender --background --factory-startup --python scripts/blender/render_assets.py -- \
      [--out art/rendered] [--only key1,key2] [--list]

Prefer `npm run render:assets` (scripts/render-assets.mjs finds Blender).
Writes <out>/<folder>/<frame>.png and <out>/anims/<key>.json (Phaser anim
metadata consumed by scripts/pack-imagine-atlas.mjs).
"""

from __future__ import annotations

import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
sys.path.insert(0, HERE)

import bpy  # noqa: E402

import biomes  # noqa: E402
import creatures  # noqa: E402
import models  # noqa: E402
import ocean  # noqa: E402
import stage  # noqa: E402
import village  # noqa: E402
from specs import SPECS  # noqa: E402

BUILDERS = {**models.BUILDERS, **village.BUILDERS, **biomes.BUILDERS, **ocean.BUILDERS, "creature": creatures.Creature}

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def parse_args(argv: list[str]) -> dict:
    args = argv[argv.index("--") + 1 :] if "--" in argv else []
    opts = {"out": os.path.join(ROOT, "art", "rendered"), "only": None, "list": False}
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--out":
            opts["out"] = os.path.abspath(args[i + 1])
            i += 1
        elif a == "--only":
            opts["only"] = set(args[i + 1].split(","))
            i += 1
        elif a == "--list":
            opts["list"] = True
        i += 1
    return opts


def frame_key(spec: dict, anim: dict, n: int) -> str:
    template = anim.get("frame_key", "{key}__{name}_{n:02d}")
    return template.format(key=spec["key"], name=anim["name"], n=n, n1=n + 1)


def render_spec(spec: dict, out: str) -> list[str]:
    random.seed(spec["key"])
    stage.reset_scene()
    rig = BUILDERS[spec["model"]](**spec.get("args", {}))
    if spec.get("shadow"):
        fade_from, fade_to = spec["shadow"]
        stage.ground_catcher(fade_from, fade_to)
    w, h = spec["size"]
    stage.camera(w, h, spec["ppu"], spec["pitch"], spec["anchor"])
    bpy.context.view_layer.update()
    if spec.get("outline"):
        stage.apply_outlines(spec["outline"] / spec["ppu"])

    folder = os.path.join(out, spec["folder"])
    os.makedirs(folder, exist_ok=True)
    written = []

    def shoot(name: str, pose: str, t: float) -> None:
        rig.pose(pose, t)
        bpy.context.view_layer.update()
        stage.render_to(os.path.join(folder, f"{name}.png"))
        written.append(name)

    for name, pose, t in spec.get("statics", []):
        shoot(name, pose, t)
    anims = []
    for anim in spec.get("anims", []):
        frames = []
        for n in range(anim["frames"]):
            name = frame_key(spec, anim, n)
            shoot(name, anim.get("pose", anim["name"]), n / anim["frames"])
            frames.append(name)
        anims.append(
            {
                "key": f"{spec['key']}__{anim['name']}",
                "frames": frames,
                "frameRate": anim["fps"],
                "repeat": anim["repeat"],
            }
        )
    anim_dir = os.path.join(out, "anims")
    os.makedirs(anim_dir, exist_ok=True)
    anim_path = os.path.join(anim_dir, f"{spec['key']}.json")
    if anims:
        with open(anim_path, "w") as f:
            json.dump({"anims": anims}, f, indent=2)
            f.write("\n")
    elif os.path.exists(anim_path):
        os.remove(anim_path)
    return written


def main() -> None:
    opts = parse_args(sys.argv)
    specs = [s for s in SPECS if not opts["only"] or s["key"] in opts["only"]]
    if opts["list"]:
        for s in SPECS:
            print(s["key"])
        return
    if not specs:
        raise SystemExit(f"no specs match {sorted(opts['only'] or [])}")
    total = 0
    for spec in specs:
        names = render_spec(spec, opts["out"])
        total += len(names)
        print(f"[render] {spec['key']}: {len(names)} frame(s)")
    print(f"[render] done: {total} frame(s) -> {opts['out']}")


main()
