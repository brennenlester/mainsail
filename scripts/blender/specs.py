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
# rendered at 2x (BATTLE_CREATURE_DISPLAY is 112x122 design px; #361 dropped
# 3x to keep atlas texture memory bounded with the full first-hour roster).
BATTLE_PPU = 200
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
        "size": (224, 244),
        "ppu": BATTLE_PPU,
        "pitch": BATTLE_PITCH,
        "anchor": 37,
        "outline": 3.5,
        "shadow": (0.16, 0.34),
        "statics": [("creature-mossling-battle", "idle", 0.0)],
        "anims": [
            {"name": "idle", "frames": 6, "fps": 8, "repeat": -1},
            {"name": "attack", "frames": 6, "fps": 14, "repeat": 0},
            {"name": "hurt", "frames": 4, "fps": 10, "repeat": 0},
            {"name": "faint", "frames": 4, "fps": 8, "repeat": 0},
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


def _creature(
    cid: str,
    ow: float,
    battle: float,
    encounter: float,
    facing: tuple[int, int, int] = (-15, -35, -20),
    ow_size: tuple[int, int] = (192, 208),
    ow_anchor: int = 26,
) -> list[dict]:
    """Overworld + battle + encounter specs for one creatures.SPECIES entry
    (#361). Same canvases, ppu and pitch as the Mossling so the whole roster
    shares one scale; `ow`/`battle`/`encounter` are per-species model scales
    (evolutions read larger)."""
    key = f"creature-{cid}"
    model = {"model": "creature", "folder": "creatures"}
    return [
        {
            **model,
            "key": key,
            "args": {"species": cid, "facing_deg": facing[0], "scale": ow},
            "size": ow_size,
            "ppu": OVERWORLD_PPU,
            "pitch": PITCH,
            "anchor": ow_anchor,
            "outline": 4.0,
            "shadow": (0.3, 0.48),
            "statics": [(key, "idle", 0.0), (f"{key}-idle", "idle", 0.0)],
            "anims": [{"name": "idle", "frames": 4, "fps": 6, "repeat": -1}],
        },
        {
            **model,
            "key": f"{key}-battle",
            "args": {"species": cid, "facing_deg": facing[1], "scale": battle},
            "size": (224, 244),
            "ppu": BATTLE_PPU,
            "pitch": BATTLE_PITCH,
            "anchor": 37,
            "outline": 3.5,
            "shadow": (0.16, 0.34),
            "statics": [(f"{key}-battle", "idle", 0.0)],
            "anims": [
                {"name": "idle", "frames": 4, "fps": 6, "repeat": -1},
                {"name": "attack", "frames": 5, "fps": 12, "repeat": 0},
                {"name": "hurt", "frames": 3, "fps": 10, "repeat": 0},
                {"name": "faint", "frames": 4, "fps": 8, "repeat": 0},
            ],
        },
        {
            **model,
            "key": f"{key}-encounter",
            "args": {"species": cid, "facing_deg": facing[2], "scale": encounter},
            "size": (480, 520),
            "ppu": 420,
            "pitch": 24,
            "anchor": 70,
            "outline": 6.0,
            "shadow": (0.22, 0.4),
            "statics": [(f"{key}-encounter", "idle", 0.25)],
            "anims": [],
        },
    ]


# First-hour roster (Grove / Shrine / Village + evolutions + the overworld
# trio). Archipelago species stay on legacy art (follow-up).
SPECS += [
    *_creature("bramblewarden", 0.9, 0.8, 0.95),
    *_creature("ember-wisp", 0.82, 0.88, 0.92),
    *_creature("hearthflame", 0.86, 0.8, 0.82),
    *_creature("brook-nymph", 0.85, 0.92, 0.98),
    *_creature("thunder-finch", 0.85, 0.9, 0.95),
    *_creature("cinder-toad", 0.82, 0.88, 0.92),
    *_creature("rootwalker", 0.85, 0.9, 0.95),
    *_creature("lantern-fox", 0.9, 0.95, 0.95, facing=(-40, -55, -40)),
    *_creature("stone-hound", 0.88, 0.92, 0.92, facing=(-40, -55, -40)),
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


# --------------------------------------------------------------------------
# #361: ground variants, paths, Shrine + Hearth Crossing kit, villagers,
# canopy backdrops, extra arenas.
# --------------------------------------------------------------------------
GROUND = {
    "grove": {"palette": ("grass", "grass_dark", "grass_light", "#79a858", "#85b360"), "petals": ("petal", "petal_lilac")},
    "shrine": {"palette": ("shrine_grass", "shrine_grass_dark", "shrine_grass_light", "#7ea371", "#8fb581"), "petals": ("petal_lilac", "moon", "petal_lilac")},
    "village": {"palette": ("village_grass", "village_grass_dark", "village_grass_light", "#8aaa56", "#9cbb66"), "petals": ("petal_gold", "petal", "rose")},
}
# v0 plain (most tiles), v1 a couple of flowers, v2 pebbles, v3 a flower clump.
FLOOR_VARIANTS = [
    {"seed": 11, "flowers": 0, "pebbles": 0, "patches": 3},
    {"seed": 12, "flowers": 2, "pebbles": 0, "patches": 4},
    {"seed": 13, "flowers": 1, "pebbles": 2, "patches": 3},
    {"seed": 14, "flowers": 4, "pebbles": 1, "patches": 2},
]


def _floor_set(zone: str) -> list[dict]:
    g = GROUND[zone]
    base = {"edge_seed": zone, "palette": g["palette"], "petals": g["petals"]}
    out = [_floor(f"floor-{zone}-v{i}", {**base, **v}) for i, v in enumerate(FLOOR_VARIANTS)]
    out.append(_floor(f"floor-{zone}-path", {**base, "seed": 19, "flowers": 0, "pebbles": 2, "patches": 2, "path": True}))
    # Rounded end caps where a path stops mid-grass (#361).
    for cap in ("west", "east"):
        out.append(_floor(f"floor-{zone}-path-{cap}", {**base, "seed": 19, "flowers": 0, "pebbles": 1, "patches": 2, "path": cap}))
    if zone != "grove":
        # Legacy light/dark keys (fallback path, other callers) share the look.
        out[0]["statics"].append((f"floor-{zone}-light", "idle", 0.0))
        out[1]["statics"].append((f"floor-{zone}-dark", "idle", 0.0))
    return out


def _canopy_tile(key: str, args: dict) -> dict:
    return {**_floor(key, args), "model": "canopy", "outline": 0.0}


def _villager(npc: str) -> dict:
    key = f"npc-{npc}"
    return {
        "key": key,
        "folder": "npcs",
        "model": "villager",
        "args": {"npc": npc},
        "size": (192, 288),  # NPC_DISPLAY 48x72
        "ppu": OVERWORLD_PPU,
        "pitch": PITCH,
        "anchor": 26,
        "outline": 4.0,
        "shadow": (0.25, 0.45),
        "statics": [(key, "idle", 0.0)],
        "anims": [
            {"name": "idle", "frames": 4, "fps": 4, "repeat": -1},
            {"name": "talk", "frames": 4, "fps": 8, "repeat": -1},
        ],
    }


def _arena(variant: str) -> dict:
    return {
        "key": f"arena-{variant}",
        "folder": "world",
        "model": "arena",
        "args": {"pitch": BATTLE_PITCH, "variant": variant},
        "size": (768, 768),
        "ppu": 120,
        "pitch": BATTLE_PITCH,
        "anchor": 480,
        "outline": 3.0,
        "shadow": None,
        "statics": [(f"arena-{variant}-{layer}", layer, 0.0) for layer in ("sky", "hills", "platform")],
        "anims": [],
    }


SPECS += [
    *_floor_set("grove"),
    *_floor_set("shrine"),
    *_floor_set("village"),
    _canopy_tile("backdrop-grove", {"seed": 31}),
    _canopy_tile("backdrop-shrine", {"seed": 32, "colors": ("#466f5e", "#5f8f78", "#3a5d52"), "ground": "#3b5a50", "accents": "petal_lilac"}),
    _canopy_tile("backdrop-village", {"seed": 33, "colors": ("leaf", "#7a9a48", "leaf_dark"), "ground": "#5d7a3e", "accents": "petal_gold"}),
    _prop("prop-gate", "gate", (48, 42), 30, {"scale": 0.82}),
    _prop("prop-gate-locked", "gate", (48, 42), 30, {"locked": True, "scale": 0.82}),
    _prop("prop-lantern", "lantern", (32, 56), 24),
    _prop("prop-moon-lantern", "lantern", (32, 56), 24, {"moon": True}),
    _prop("prop-banner", "banner", (36, 72), 24),
    _prop("prop-stall", "stall", (64, 56), 34),
    {**_prop("boundary-village", "fence", (48, 56), 40), "shadow": None},
    {**_prop("boundary-shrine", "shrine-boundary", (48, 56), 40), "shadow": None},
    *[_villager(n) for n in ("warden-bryn", "weaver-sable", "hearthkeep-odd", "island-hermit-reed")],
    _arena("village"),
    _arena("night"),
]


# --------------------------------------------------------------------------
# #392: Folklore Fields, Mistwood Reach, Emberfen Hollow, Moonwake Harbor,
# cottage interiors (biomes.py). Floors: `floor-<zone>-v0..3` + path pieces
# (`-path` along X, `-path-v` along Y, `-path-cross`, `-path-<end>` caps),
# `-shore` (bank on the south edge), whole-tile surfaces; see
# src/game/render/floorVariants.ts for which tile uses which key.
# --------------------------------------------------------------------------
BIOME_FLOORS = {
    "overworld": {
        "style": "fields",
        "variants": [
            {"patches": 3},
            {"flower": 3, "clover": 2},
            {"pebble": 2, "clover": 3, "flower": 1},
            {"tuft": 2, "flower": 2},
        ],
        "paths": ["h", "v", "cross"],
        "shore": True,
        "surfaces": ["islet"],
    },
    "mistwood": {
        "style": "mistwood",
        "variants": [
            {"patches": 3, "leaf": 8, "twig": 1},
            {"patches": 2, "leaf": 6, "moss": 3, "mushroom": 1},
            {"patches": 3, "leaf": 7, "glowcap": 1, "twig": 1},
            {"patches": 2, "leaf": 5, "moss": 2, "glowcap": 2},
        ],
        "paths": ["h"],
    },
    "emberfen": {
        "style": "emberfen",
        "variants": [
            {"patches": 3, "coal": 1},
            {"patches": 2, "reed": 2, "coal": 1},
            {"patches": 3, "puddle": 1, "coal": 2},
            {"patches": 2, "crack": 2, "reed": 1},
        ],
        "paths": ["h", "east"],
    },
    "harbor": {
        "style": "harbor",
        "variants": [{}, {}, {}, {}],
        "paths": ["h"],
        "shore": True,
    },
    "cottage": {
        "style": "cottage",
        "variants": [{}, {"knot": 2}, {"knot": 1, "straw": 2}, {"knot": 3}],
        "paths": ["v", "north"],
    },
}
PATH_SUFFIX = {"h": "path", "v": "path-v", "cross": "path-cross"}


def _biome_floor(key: str, args: dict) -> dict:
    return {**_floor(key, args), "model": "biome-ground"}


def _biome_floor_set(zone: str) -> list[dict]:
    cfg = BIOME_FLOORS[zone]
    base = {"style": cfg["style"], "edge_seed": zone}
    out = [_biome_floor(f"floor-{zone}-v{i}", {**base, "seed": 100 + i, "detail": d}) for i, d in enumerate(cfg["variants"])]
    if zone != "cottage":
        # Legacy light/dark keys (fallback path, other callers) share the look.
        out[0]["statics"].append((f"floor-{zone}-light", "idle", 0.0))
        out[1]["statics"].append((f"floor-{zone}-dark", "idle", 0.0))
    for p in cfg.get("paths", []):
        out.append(_biome_floor(f"floor-{zone}-{PATH_SUFFIX.get(p, 'path-' + p)}", {**base, "seed": 109, "detail": {}, "path": p}))
    if cfg.get("shore"):
        out.append(_biome_floor(f"floor-{zone}-shore", {**base, "seed": 110, "detail": cfg["variants"][1], "shore": True}))
    for s in cfg.get("surfaces", []):
        out.append(_biome_floor(f"floor-{zone}-{s}", {**base, "seed": 111, "surface": s}))
    return out


def _backdrop(key: str, model: str, args: dict | None = None) -> dict:
    return {**_floor(key, args or {}), "model": model, "outline": 0.0}


def _boundary(key: str, model: str) -> dict:
    return {**_prop(key, model, (48, 56), 40), "shadow": None}


SPECS += [
    *[s for z in BIOME_FLOORS for s in _biome_floor_set(z)],
    # Water + dock (global keys: Fields bay, Harbor, Archipelago).
    _biome_floor("tile-water-light", {"seed": 201, "surface": "water"}),
    _biome_floor("tile-water-dark", {"seed": 202, "surface": "water"}),
    _biome_floor("tile-dock-light", {"seed": 203, "surface": "pier"}),
    _biome_floor("tile-dock-dark", {"seed": 204, "surface": "pier"}),
    # Canopy backdrops around each playfield.
    _canopy_tile("backdrop-overworld", {"seed": 37, "colors": ("leaf", "#7aa04e", "leaf_light"), "ground": "#5f8a44", "accents": "petal_gold"}),
    _backdrop("backdrop-mistwood", "mist-backdrop"),
    _backdrop("backdrop-emberfen", "fen-backdrop"),
    _backdrop("backdrop-harbor", "sea-backdrop"),
    # Boundaries.
    _boundary("boundary-overworld", "drystone"),
    _boundary("boundary-mistwood", "pinewall"),
    _boundary("boundary-emberfen", "fenwall"),
    _boundary("boundary-harbor", "seawall"),
    # Per-zone variants of gatherable props (`prop-<kind>-<zone>`).
    _prop("prop-tree-mistwood", "mist-pine", (56, 84), 44),
    _prop("prop-tree-emberfen", "charred-tree", (56, 72), 44),
    _prop("prop-fern-mistwood", "dark-fern", (40, 32), 30),
    _prop("prop-fern-emberfen", "reeds", (40, 44), 30),
    _prop("prop-fern-harbor", "dune-grass", (40, 32), 30),
    _prop("prop-standing-stone-mistwood", "moss-stone", (42, 38), 36),
    _prop("prop-standing-stone-emberfen", "basalt", (42, 40), 36),
    _prop("prop-standing-stone-harbor", "ballast", (42, 38), 36),
    _prop("prop-pebble-pile-mistwood", "pebble-kind", (44, 32), 40, {"kind": "mistwood"}),
    _prop("prop-pebble-pile-emberfen", "pebble-kind", (44, 32), 40, {"kind": "emberfen"}),
    _prop("prop-pebble-pile-harbor", "pebble-kind", (44, 32), 40, {"kind": "harbor"}),
    # Decorative dressing.
    _prop("prop-glowcap", "glowcaps", (36, 36), 30),
    {**_prop("prop-fog", "fog", (64, 32), 40), "shadow": None, "outline": 0.0},
    _prop("prop-log", "moss-log", (56, 32), 40),
    {**_prop("prop-brazier", "brazier", (32, 48), 30), "shadow": (0.12, 0.28)},
    _prop("prop-crates", "crates", (48, 44), 36),
    _prop("prop-boat", "boat", (48, 40), 70),
    _prop("prop-hay", "hay", (40, 32), 34),
    {**_prop("prop-signpost", "signpost", (32, 56), 24), "shadow": (0.12, 0.28)},
    _prop("prop-wildflowers", "wildflowers", (36, 28), 30),
    # Cottage interiors.
    _prop("prop-hearth", "fireplace", (56, 64), 48),
    _prop("prop-shelf", "bookcase", (40, 72), 30),
    _prop("prop-loom", "loom", (46, 48), 34),
    {**_prop("prop-door", "doorway", (48, 40), 40), "shadow": None},
    _prop("prop-table", "table", (48, 44), 38),
    {**_prop("prop-plant", "plant", (28, 40), 26), "shadow": (0.12, 0.28)},
]


# #392: remaining Fields / Mistwood / Emberfen spawns (Peat Sprite replaces
# the dithered legacy cut) and the Cinder Matriarch boss. The Matriarch is
# drawn larger: overworld 72x72 logical (288 px), battle/encounter fill their
# canvases; `creature-cinder-matriarch-phase2*` is the Cinder (second) form.
SPECS += [
    *_creature("peat-sprite", 0.86, 0.9, 0.95),
    *_creature("bog-lantern", 0.85, 0.9, 0.95),
    *_creature("mist-serpent", 0.9, 0.92, 0.95, facing=(-20, -30, -20)),
    *_creature("cinder-matriarch", 1.15, 0.76, 0.82, facing=(-20, -35, -25), ow_size=(288, 288), ow_anchor=40),
    *_creature("cinder-matriarch-phase2", 1.15, 0.76, 0.82, facing=(-20, -35, -25), ow_size=(288, 288), ow_anchor=40),
]


# #392: Wren, the rival. `npc-rival-wren` (idle + talk, the overworld NPC
# sprite), four walk facings, and a bust portrait rendered closer and at
# higher resolution for the dialogue panel (not a scaled-up sprite).
def _wren(facing: str, deg: int) -> dict:
    key = f"npc-rival-wren-{facing}"
    return {
        "key": key,
        "folder": "npcs",
        "model": "wren",
        "args": {"facing_deg": deg},
        "size": (192, 288),
        "ppu": OVERWORLD_PPU,
        "pitch": PITCH,
        "anchor": 26,
        "outline": 4.0,
        "shadow": (0.22, 0.42),
        "statics": [(f"{key}-0", "idle", 0.0)],
        "anims": [{"name": "walk", "frames": 6, "fps": 10, "repeat": -1, "frame_key": f"{key}-{{n1}}"}],
    }


SPECS += [
    {**_villager("rival-wren"), "model": "wren", "args": {"facing_deg": -12}, "shadow": (0.22, 0.42)},
    *[_wren(f, d) for f, d in FACINGS.items()],
    {
        "key": "npc-rival-wren-portrait",
        "folder": "npcs",
        "model": "wren",
        "args": {"facing_deg": -18, "staff": False},
        "size": (384, 400),
        "ppu": 460,
        "pitch": 8,
        "anchor": -228,  # world origin below the frame: bust from mid-chest up
        "outline": 6.0,
        "shadow": None,
        "statics": [("npc-rival-wren-portrait", "idle", 0.0)],
        "anims": [
            {"name": "idle", "frames": 4, "fps": 4, "repeat": -1},
            {"name": "talk", "frames": 4, "fps": 8, "repeat": -1},
        ],
    },
]


# #392: cottage interior walls (IsometricScene.drawCottageWalls tiles these).
SPECS += [
    {**_floor("wall-cottage-face", {}), "model": "wall-face", "size": (192, 112), "anchor": 56, "outline": 0.0},
    _biome_floor("wall-cottage-top", {"style": "wallcap", "edge_seed": "wallcap", "seed": 300}),
]
