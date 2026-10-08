"""Per-asset render specs (#360). One dict per rendered asset.

Fields
  key        asset id; also the default frame-name prefix
  folder     subfolder under public/assets/rendered/ (player|creatures|world)
  model      builder name in models.BUILDERS
  args       kwargs for the builder (facing_deg, seed, ...)
  size       (w, h) render px. Keep the aspect of the logical display size in
             src/game/render/displaySizes.ts (overworld art is 4x logical).
  ppu        render px per world unit. Overworld = 192 (48 logical px x 4) so
             every overworld sprite shares one scale.
  pitch      camera degrees below horizontal (35 = 3/4 view, 90 = top-down)
  anchor     render px from the bottom edge where the world origin lands
  outline    inverted-hull outline width in render px (0 = none)
  shadow     ground shadow catcher (fade_from, fade_to) world units, or None
  statics    [(frame_key, pose, t)] single frames
  anims      [{name, frames, fps, repeat, pose?, frame_key?}]
             frame_key is a format string with {n} (0-based) / {n1} (1-based);
             default "{key}__{name}_{n:02d}". Phaser anim key = "{key}__{name}".
"""

OVERWORLD_PPU = 192  # 48 logical px per tile x 4
PITCH = 35  # 3/4 top-down

# Battle art lives in the 640-unit design space: 1 world unit = 100 design px,
# rendered at 3x (BATTLE_CREATURE_DISPLAY is 112x122 design px).
BATTLE_PPU = 300
BATTLE_PITCH = 22

FACINGS = {"south": 0, "east": 90, "north": 180, "west": -90}


def _player(facing: str, deg: int) -> dict:
    return {
        "key": f"player-{facing}",
        "folder": "player",
        "model": "player",
        "args": {"facing_deg": deg},
        "size": (192, 256),
        "ppu": OVERWORLD_PPU,
        "pitch": PITCH,
        "anchor": 26,
        "outline": 4.0,
        "shadow": (0.22, 0.42),
        "statics": [(f"player-{facing}-0", "idle", 0.0)],
        "anims": [
            {"name": "idle", "frames": 4, "fps": 4, "repeat": -1},
            {"name": "walk", "frames": 6, "fps": 10, "repeat": -1, "frame_key": f"player-{facing}-{{n1}}"},
        ],
    }


SPECS = [
    *[_player(f, d) for f, d in FACINGS.items()],
    {
        "key": "creature-mossling",
        "folder": "creatures",
        "model": "mossling",
        "args": {"facing_deg": -15, "scale": 0.78},
        "size": (192, 208),
        "ppu": OVERWORLD_PPU,
        "pitch": PITCH,
        "anchor": 26,
        "outline": 4.0,
        "shadow": (0.3, 0.48),
        "statics": [
            ("creature-mossling", "idle", 0.0),
            ("creature-mossling-idle", "idle", 0.0),
        ],
        "anims": [{"name": "idle", "frames": 6, "fps": 8, "repeat": -1}],
    },
    {
        "key": "creature-mossling-battle",
        "folder": "creatures",
        "model": "mossling",
        "args": {"facing_deg": -35, "scale": 0.85},
        "size": (336, 366),
        "ppu": BATTLE_PPU,
        "pitch": BATTLE_PITCH,
        "anchor": 56,
        "outline": 5.0,
        "shadow": (0.16, 0.34),
        "statics": [("creature-mossling-battle", "idle", 0.0)],
        "anims": [
            {"name": "idle", "frames": 6, "fps": 8, "repeat": -1},
            {"name": "attack", "frames": 6, "fps": 14, "repeat": 0},
            {"name": "hurt", "frames": 4, "fps": 10, "repeat": 0},
        ],
    },
    {
        "key": "creature-mossling-encounter",
        "folder": "creatures",
        "model": "mossling",
        "args": {"facing_deg": -20},
        "size": (480, 520),
        "ppu": 420,
        "pitch": 24,
        "anchor": 70,
        "outline": 6.0,
        "shadow": (0.22, 0.4),
        "statics": [("creature-mossling-encounter", "idle", 0.25)],
        "anims": [],
    },
]


def _prop(key: str, model: str, logical: tuple[int, int], anchor: int, args: dict | None = None, folder: str = "world") -> dict:
    return {
        "key": key,
        "folder": folder,
        "model": model,
        "args": args or {},
        "size": (logical[0] * 4, logical[1] * 4),
        "ppu": OVERWORLD_PPU,
        "pitch": PITCH,
        "anchor": anchor,
        "outline": 4.0,
        "shadow": (0.3, 0.5),
        "statics": [(key, "idle", 0.0)],
        "anims": [],
    }


def _floor(key: str, args: dict) -> dict:
    return {
        "key": key,
        "folder": "world",
        "model": "ground",
        "args": args,
        "size": (192, 192),
        "ppu": OVERWORLD_PPU,
        "pitch": 90,
        "anchor": 96,
        "outline": 2.5,
        "shadow": None,
        "statics": [(key, "idle", 0.0)],
        "anims": [],
    }


# Logical sizes must match PROP_DISPLAY / FLOOR_DISPLAY / BOUNDARY_DISPLAY.
SPECS += [
    _prop("prop-tree", "tree", (56, 72), 44),
    _prop("prop-fern", "bush", (40, 32), 30, {"scale": 0.78}),
    _prop("prop-standing-stone", "standing-stone", (42, 38), 36),
    _prop("prop-pebble-pile", "pebbles", (44, 32), 40),
    _prop("prop-shrine-altar", "shrine-altar", (56, 64), 60),
    _prop("prop-cottage", "cottage", (64, 64), 50),
    {**_prop("boundary-grove", "hedge", (48, 56), 40), "shadow": None},
    _floor("floor-grove-light", {"seed": 1, "flowers": 0, "pebbles": 0, "patches": 3}),
    _floor("floor-grove-dark", {"seed": 2, "flowers": 0, "pebbles": 0, "patches": 4}),
    {
        "key": "arena",
        "folder": "world",
        "model": "arena",
        "args": {"pitch": BATTLE_PITCH},
        "size": (768, 768),
        "ppu": 120,  # 640 design px = 6.4 units -> 1 unit = 100 design px
        "pitch": BATTLE_PITCH,
        "anchor": 480,  # dais center at design y=240, between the two spar sprites
        "outline": 3.0,
        "shadow": None,
        "statics": [("arena-sky", "sky", 0.0), ("arena-hills", "hills", 0.0), ("arena-platform", "platform", 0.0)],
        "anims": [],
    },
]
