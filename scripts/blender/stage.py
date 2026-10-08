"""Shared Blender stage for Ivyward sprite renders (#359/#360).

Everything here is deterministic: no wall-clock, no unseeded randomness,
fixed sample counts, dither off. Run inside Blender (`bpy` must import).

Look: stylized low-poly toon. One world-fixed light rig for every asset:
  key  — warm sun from front-left (casts the only shadows)
  fill — weak cool sun from the right (lifts shadow sides, no shadows)
  rim  — shader term on silhouettes facing the back-light direction
Shading is a 3-band toon ramp (navy-tinted shadow / base / cream highlight)
and every mesh gets a dark-navy inverted-hull outline.
"""

from __future__ import annotations

import math

import bpy
from mathutils import Matrix, Vector

# --------------------------------------------------------------------------
# Palette (sRGB hex). Keep new colors inside these families.
# --------------------------------------------------------------------------
PALETTE = {
    "navy": "#1f2a44",  # outline, shadow tint, title-screen navy
    "cream": "#f3ead3",  # highlight tint, title-screen cream
    "rim": "#e9f4ff",
    "moss": "#79ad55",
    "moss_dark": "#4f8a48",
    "moss_light": "#a6cf6a",
    "grass": "#7fae5c",
    "grass_dark": "#5f9150",
    "grass_light": "#9cc56c",
    "leaf": "#5c9a4c",
    "leaf_dark": "#3f7743",
    "leaf_light": "#86bb5a",
    "bark": "#80553a",
    "bark_dark": "#5e3c2a",
    "wood": "#a8714a",
    "stone": "#b7b2a5",
    "stone_dark": "#8d897f",
    "plaster": "#efe3c8",
    "roof": "#4f7d88",
    "teal": "#3f8f95",
    "teal_dark": "#2f6d78",
    "skin": "#f2c7a0",
    "hair": "#7c4a34",
    "pants": "#34466b",
    "boot": "#6b4630",
    "satchel": "#9b6a43",
    "scarf": "#e6a34f",
    "moon": "#e8eefc",
    "moon_glow": "#bcd4ff",
    "window": "#ffd27a",
    "petal": "#fbf3e2",
    "petal_lilac": "#c9b2e6",
    "petal_gold": "#f2c75c",
    "blush": "#ee9a8f",
    "eye": "#20243a",
    "sky_top": "#22304f",
    "sky_mid": "#4f7f93",
    "sky_low": "#f1dcb6",
    # Creature families (#361): one base / dark / light (+ accent) per line.
    "bramble": "#4f8f47",
    "bramble_dark": "#2f6338",
    "bramble_light": "#93c467",
    "rose": "#e2768a",
    "ember": "#f08a3c",
    "ember_deep": "#d9532e",
    "hearth_red": "#c8402c",
    "flame_core": "#ffd66b",
    "water": "#5aa6dc",
    "water_dark": "#3a78b8",
    "water_light": "#a8dcf2",
    "lily": "#6fb35a",
    "storm": "#c9d3ee",
    "storm_dark": "#5d6c9e",
    "spark": "#f7d84a",
    "beak": "#f0a64a",
    "toad": "#d4623a",
    "toad_belly": "#f2c48c",
    "basalt": "#4a4048",
    "wood_light": "#d9b384",
    "fox": "#e9a13b",
    "fox_dark": "#a8642a",
    "fox_cream": "#fbecd0",
    "lantern": "#ffe9a3",
    "hound": "#a3a4ae",
    "hound_dark": "#74768a",
    "rune": "#7fe0d8",
    # Village kit (#361)
    "banner": "#c8574a",
    "banner_gold": "#e8b85a",
    "awning": "#e7d6b0",
    "path": "#d8c49a",
    "path_dark": "#b9a37a",
    "cobble": "#c9c0ad",
    "shrine_grass": "#86ad78",
    "shrine_grass_dark": "#6b9468",
    "shrine_grass_light": "#a3c48e",
    "village_grass": "#93b35e",
    "village_grass_dark": "#779a4c",
    "village_grass_light": "#b0c874",
}

OUTLINE_HEX = PALETTE["navy"]

# Light rig directions (direction the light travels, world space).
KEY_DIR = Vector((0.55, 0.9, -1.0)).normalized()
FILL_DIR = Vector((-1.0, 0.35, -0.5)).normalized()
RIM_FROM = Vector((0.35, 0.85, 0.55)).normalized()  # where the rim light sits

SAMPLES = 32


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgba(hex_or_name: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    """Palette name or #rrggbb -> linear RGBA."""
    h = PALETTE.get(hex_or_name, hex_or_name).lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), alpha)


def mix(a, b, t: float):
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(4))


# --------------------------------------------------------------------------
# Scene
# --------------------------------------------------------------------------
def reset_scene() -> bpy.types.Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _MATS.clear()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = SAMPLES
    scene.eevee.use_shadows = True
    scene.eevee.shadow_resolution_scale = 1.0
    scene.render.film_transparent = True
    scene.render.dither_intensity = 0.0
    # No date/time/render-time text chunks: identical pixels -> identical bytes.
    for attr in dir(scene.render):
        if attr.startswith("use_stamp"):
            setattr(scene.render, attr, False)
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 90
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0

    world = bpy.data.worlds.new("toon-world")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = rgba("#9fb3d6")
    bg.inputs["Strength"].default_value = 0.12
    scene.world = world
    _light_rig(scene)
    return scene


def _sun(name: str, direction: Vector, strength: float, color: str, shadow: bool):
    data = bpy.data.lights.new(name, "SUN")
    data.energy = strength
    data.color = rgba(color)[:3]
    data.use_shadow = shadow
    data.angle = math.radians(4.0)
    obj = bpy.data.objects.new(name, data)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("-Z", "Y")
    bpy.context.scene.collection.objects.link(obj)
    return obj


def _light_rig(scene) -> None:
    _sun("key", KEY_DIR, 1.5, "#fff3dc", True)
    _sun("fill", FILL_DIR, 0.16, "#cfe0ff", False)


# --------------------------------------------------------------------------
# Materials
# --------------------------------------------------------------------------
_MATS: dict[str, bpy.types.Material] = {}


def toon(
    color: str,
    *,
    shadow: float = 0.5,
    highlight: float = 0.22,
    rim: float = 0.55,
    emission: float = 0.0,
    name: str | None = None,
) -> bpy.types.Material:
    """3-band toon material with a navy-tinted shadow and a cream highlight.

    `emission` > 0 makes the surface self-lit (moon, windows): the ramp is
    skipped and the color is output at that strength.
    """
    key = name or f"toon:{color}:{shadow}:{highlight}:{rim}:{emission}"
    if key in _MATS:
        return _MATS[key]
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    base = rgba(color)
    if emission > 0:
        emit.inputs["Color"].default_value = base
        emit.inputs["Strength"].default_value = emission
        _MATS[key] = mat
        return mat

    diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
    diff.inputs["Color"].default_value = (1, 1, 1, 1)
    s2r = nt.nodes.new("ShaderNodeShaderToRGB")
    nt.links.new(diff.outputs[0], s2r.inputs[0])
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    nt.links.new(s2r.outputs["Color"], bw.inputs[0])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.interpolation = "LINEAR"
    shadow_col = mix(base, rgba("navy"), shadow)
    hi_col = mix(base, rgba("cream"), highlight)
    cr.elements[0].position = 0.2
    cr.elements[0].color = shadow_col
    cr.elements[1].position = 0.25
    cr.elements[1].color = base
    e = cr.elements.new(0.95)
    e.color = base
    e = cr.elements.new(1.02)
    e.color = hi_col
    nt.links.new(bw.outputs[0], ramp.inputs["Fac"])

    # Rim: silhouette (Facing) * how much the normal points at the rim light.
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.35
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    dot.inputs[1].default_value = RIM_FROM
    nt.links.new(geo.outputs["Normal"], dot.inputs[0])
    clamp = nt.nodes.new("ShaderNodeMath")
    clamp.operation = "MAXIMUM"
    clamp.inputs[1].default_value = 0.0
    nt.links.new(dot.outputs["Value"], clamp.inputs[0])
    edge = nt.nodes.new("ShaderNodeMath")
    edge.operation = "GREATER_THAN"
    edge.inputs[1].default_value = 0.62
    nt.links.new(lw.outputs["Facing"], edge.inputs[0])
    rim_amt = nt.nodes.new("ShaderNodeMath")
    rim_amt.operation = "MULTIPLY"
    nt.links.new(edge.outputs[0], rim_amt.inputs[0])
    nt.links.new(clamp.outputs[0], rim_amt.inputs[1])
    rim_scaled = nt.nodes.new("ShaderNodeMath")
    rim_scaled.operation = "MULTIPLY"
    rim_scaled.inputs[1].default_value = rim
    nt.links.new(rim_amt.outputs[0], rim_scaled.inputs[0])

    mixn = nt.nodes.new("ShaderNodeMix")
    mixn.data_type = "RGBA"
    mixn.blend_type = "MIX"
    nt.links.new(rim_scaled.outputs[0], mixn.inputs[0])
    nt.links.new(ramp.outputs["Color"], mixn.inputs[6])
    mixn.inputs[7].default_value = rgba("rim")
    nt.links.new(mixn.outputs[2], emit.inputs["Color"])
    _MATS[key] = mat
    return mat


def outline_material() -> bpy.types.Material:
    key = "outline"
    if key in _MATS:
        return _MATS[key]
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = rgba(OUTLINE_HEX)
    # The hull encloses the mesh; it must not cast shadows onto it.
    path = nt.nodes.new("ShaderNodeLightPath")
    transp = nt.nodes.new("ShaderNodeBsdfTransparent")
    mixs = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(path.outputs["Is Shadow Ray"], mixs.inputs[0])
    nt.links.new(emit.outputs[0], mixs.inputs[1])
    nt.links.new(transp.outputs[0], mixs.inputs[2])
    nt.links.new(mixs.outputs[0], out.inputs["Surface"])
    mat.use_transparent_shadow = True
    mat.use_backface_culling = True
    mat.use_backface_culling_shadow = True
    _MATS[key] = mat
    return mat


def alpha_material(name: str, color: str, alpha_node_builder) -> bpy.types.Material:
    """Emission color with alpha from a node subgraph (shadows, glows)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.surface_render_method = "BLENDED"
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Color"].default_value = rgba(color)
    transp = nt.nodes.new("ShaderNodeBsdfTransparent")
    mixs = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(transp.outputs[0], mixs.inputs[1])
    nt.links.new(emit.outputs[0], mixs.inputs[2])
    alpha_socket = alpha_node_builder(nt)
    nt.links.new(alpha_socket, mixs.inputs[0])
    nt.links.new(mixs.outputs[0], out.inputs["Surface"])
    return mat


def shadow_catcher_material(strength: float, fade_from: float, fade_to: float) -> bpy.types.Material:
    """Transparent except where the key light is blocked.

    Shadow fades out radially between `fade_from` and `fade_to` (world units
    from the origin) so cast shadows never hit the sprite's canvas edge.
    """

    def build(nt):
        diff = nt.nodes.new("ShaderNodeBsdfDiffuse")
        s2r = nt.nodes.new("ShaderNodeShaderToRGB")
        nt.links.new(diff.outputs[0], s2r.inputs[0])
        bw = nt.nodes.new("ShaderNodeRGBToBW")
        nt.links.new(s2r.outputs["Color"], bw.inputs[0])
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = 0.3
        mr.inputs["From Max"].default_value = 0.55
        mr.inputs["To Min"].default_value = strength
        mr.inputs["To Max"].default_value = 0.0
        nt.links.new(bw.outputs[0], mr.inputs["Value"])
        tc = nt.nodes.new("ShaderNodeTexCoord")
        length = nt.nodes.new("ShaderNodeVectorMath")
        length.operation = "LENGTH"
        nt.links.new(tc.outputs["Object"], length.inputs[0])
        fade = nt.nodes.new("ShaderNodeMapRange")
        fade.interpolation_type = "SMOOTHSTEP"
        fade.inputs["From Min"].default_value = fade_from
        fade.inputs["From Max"].default_value = fade_to
        fade.inputs["To Min"].default_value = 1.0
        fade.inputs["To Max"].default_value = 0.0
        nt.links.new(length.outputs["Value"], fade.inputs["Value"])
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        nt.links.new(mr.outputs["Result"], mul.inputs[0])
        nt.links.new(fade.outputs["Result"], mul.inputs[1])
        return mul.outputs[0]

    return alpha_material("shadow-catcher", "navy", build)


def radial_material(name: str, color: str, alpha: float) -> bpy.types.Material:
    """Soft radial blob (contact shadow, glow halo) on a unit disc/plane."""

    def build(nt):
        tc = nt.nodes.new("ShaderNodeTexCoord")
        length = nt.nodes.new("ShaderNodeVectorMath")
        length.operation = "LENGTH"
        nt.links.new(tc.outputs["Object"], length.inputs[0])
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.interpolation_type = "SMOOTHSTEP"
        mr.inputs["From Min"].default_value = 0.25
        mr.inputs["From Max"].default_value = 1.0
        mr.inputs["To Min"].default_value = alpha
        mr.inputs["To Max"].default_value = 0.0
        nt.links.new(length.outputs["Value"], mr.inputs["Value"])
        return mr.outputs["Result"]

    return alpha_material(name, color, build)


# --------------------------------------------------------------------------
# Geometry helpers
# --------------------------------------------------------------------------
def _link(obj, parent=None):
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def empty(name: str, loc=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    obj.location = loc
    return _link(obj, parent)


def _finish(obj, mat, parent, smooth: bool, outline: bool):
    bpy.context.view_layer.objects.active = obj
    obj.data.materials.append(mat)
    if outline:
        obj.data.materials.append(outline_material())
        obj["ivy_outline"] = True
        # Bake own scale into the mesh so the solidify outline stays even.
        obj.data.transform(Matrix.Diagonal(tuple(obj.scale) + (1.0,)))
        obj.scale = (1, 1, 1)
    for poly in obj.data.polygons:
        poly.use_smooth = smooth
    if parent is not None:
        obj.parent = parent
    return obj


def _from_op(op, name, **kw):
    op(**kw)
    obj = bpy.context.active_object
    obj.name = name
    return obj


def sphere(name, loc, scale, mat, parent=None, *, smooth=True, outline=True, low=False, rot=(0, 0, 0)):
    if low:
        obj = _from_op(bpy.ops.mesh.primitive_ico_sphere_add, name, subdivisions=1, radius=1, location=(0, 0, 0))
    else:
        obj = _from_op(bpy.ops.mesh.primitive_uv_sphere_add, name, segments=24, ring_count=12, radius=1, location=(0, 0, 0))
    obj.location = loc
    obj.scale = scale
    obj.rotation_euler = rot
    return _finish(obj, mat, parent, smooth, outline)


def cylinder(name, loc, radius, depth, mat, parent=None, *, verts=12, radius_top=None, smooth=True, outline=True, rot=(0, 0, 0), scale=(1, 1, 1)):
    if radius_top is None:
        obj = _from_op(bpy.ops.mesh.primitive_cylinder_add, name, vertices=verts, radius=radius, depth=depth, location=(0, 0, 0))
    else:
        obj = _from_op(bpy.ops.mesh.primitive_cone_add, name, vertices=verts, radius1=radius, radius2=radius_top, depth=depth, location=(0, 0, 0))
    obj.location = loc
    obj.rotation_euler = rot
    obj.scale = scale
    return _finish(obj, mat, parent, smooth, outline)


def box(name, loc, size, mat, parent=None, *, outline=True, rot=(0, 0, 0), bevel=0.0):
    obj = _from_op(bpy.ops.mesh.primitive_cube_add, name, size=1, location=(0, 0, 0))
    obj.location = loc
    obj.scale = size
    obj.rotation_euler = rot
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 1
    return _finish(obj, mat, parent, False, outline)


def mesh_from(name, verts, faces, mat, parent=None, *, smooth=False, outline=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    obj = bpy.data.objects.new(name, me)
    _link(obj)
    return _finish(obj, mat, parent, smooth, outline)


def disc(name, loc, radius, mat, parent=None, scale=(1, 1, 1)):
    obj = _from_op(bpy.ops.mesh.primitive_circle_add, name, vertices=32, radius=1, fill_type="NGON", location=(0, 0, 0))
    obj.location = loc
    obj.scale = (radius * scale[0], radius * scale[1], 1)
    obj.data.materials.append(mat)
    if parent is not None:
        obj.parent = parent
    return obj


def contact_shadow(parent, radius=0.3, squash=0.8, alpha=0.32, loc=(0, 0, 0.004)):
    mat = radial_material("contact-shadow", "navy", alpha)
    return disc("contact", loc, radius, mat, parent, scale=(1, squash, 1))


def ground_catcher(fade_from=0.25, fade_to=0.48, strength=0.34, z=0.0):
    obj = _from_op(bpy.ops.mesh.primitive_plane_add, "ground", size=fade_to * 2.2, location=(0, 0, z))
    obj.data.materials.append(shadow_catcher_material(strength, fade_from, fade_to))
    obj.visible_shadow = False
    return obj


def apply_outlines(width: float) -> None:
    """Inverted-hull outline on every mesh tagged at creation."""
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.get("ivy_outline"):
            continue
        # Outline is in local space; divide out object scale so it stays even.
        s = max(1e-4, sum(abs(v) for v in obj.matrix_world.to_scale()) / 3)
        mod = obj.modifiers.new("outline", "SOLIDIFY")
        mod.thickness = width / s
        mod.offset = 1.0
        mod.use_flip_normals = True
        mod.use_rim = False
        mod.material_offset = 1
        mod.use_even_offset = False


# --------------------------------------------------------------------------
# Camera
# --------------------------------------------------------------------------
def camera(width: int, height: int, ppu: float, pitch_deg: float, anchor_px: float):
    """Orthographic camera pitched `pitch_deg` below horizontal.

    `ppu`: render pixels per world unit (fixed per asset class -> consistent
    scale). The world origin lands `anchor_px` above the bottom edge, centered.
    """
    scene = bpy.context.scene
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    data = bpy.data.cameras.new("cam")
    data.type = "ORTHO"
    data.ortho_scale = max(width, height) / ppu
    data.clip_start = 0.1
    data.clip_end = 200
    cam = bpy.data.objects.new("cam", data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.rotation_euler = (math.radians(90 - pitch_deg), 0, 0)
    rot = cam.rotation_euler.to_matrix()
    forward = rot @ Vector((0, 0, -1))
    up = rot @ Vector((0, 1, 0))
    d = (height / 2 - anchor_px) / ppu
    target = Vector((0, 0, 0)) + up * d
    cam.location = target - forward * 50
    return cam


def render_to(path: str) -> None:
    scene = bpy.context.scene
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
