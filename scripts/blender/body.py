"""Headless Blender step: normalised source -> per-tier bodies.

It turns the source into one clean voxel volume and polishes the scan's
lumps out of it (Taubin smoothing, which keeps the volume). For each tier it
retopologises that volume into quads, unwraps UVs, bakes the base colour
(from the source) and ambient occlusion. On full it also bakes the skin's
detail: the polished forms, and crisp scales on top of them like the
concept's (fit.json scales), a 3D cell pattern in object space so there are
no seams, finer on the face, hands and feet, with wide plates on the belly
(found from the baked colours). The grooves between scales darken the
occlusion and roughen the ORM map. Then it builds the contract armature from
build/model/rig.json and binds the body with automatic weights.

Outputs, per tier, in <out>/<tier>/: body.glb (skinned mesh, no materials),
basecolor, orm (R: AO, G: roughness, B: 0) and normal (full), as WebP or
JPEG depending on fit.compress.textures for the tier.
A JSON report goes to <out>/body-report.json.

Run (Blender 5.2 LTS):
  blender -b --factory-startup --python-exit-code 1 -P scripts/blender/body.py -- --root . --out build/model
"""

import argparse
import json
import math
import os
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Vector

T0 = time.time()


def log(message):
    print(f"[body {time.time() - T0:7.1f}s] {message}", flush=True)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--out", default="build/model")
    return parser.parse_args(argv)


def gltf_to_blender(v):
    """glTF (+Y up, +Z forward) to Blender (+Z up, -Y forward) coordinates."""
    x, y, z = v
    return Vector((x, -z, y))


def activate(obj, *others):
    bpy.ops.object.select_all(action="DESELECT")
    for other in others:
        other.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def duplicate(obj, name):
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = name
    copy.data.name = name
    bpy.context.collection.objects.link(copy)
    return copy


def apply_modifier(obj, modifier):
    activate(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def only_render(*visible):
    """Hide every other object from rendering and baking rays."""
    keep = set(visible)
    for obj in bpy.context.scene.objects:
        obj.hide_render = obj not in keep


def import_source(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No mesh in {path}")
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    activate(meshes[0], *meshes[1:])
    if len(meshes) > 1:
        bpy.ops.object.join()
    source = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    source.name = "source"
    log(f"source: {len(source.data.polygons)} faces, {len(source.data.materials)} material(s)")
    return source


def non_manifold_edges(obj):
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    count = sum(1 for edge in mesh.edges if not edge.is_manifold)
    mesh.free()
    return count


def clean(obj, merge_distance):
    """Weld the mirror seam, drop loose bits and make normals point outwards."""
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.remove_doubles(mesh, verts=mesh.verts, dist=merge_distance)
    loose = [v for v in mesh.verts if not v.link_faces]
    bmesh.ops.delete(mesh, geom=loose, context="VERTS")
    bmesh.ops.recalc_face_normals(mesh, faces=mesh.faces)
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.update()


def voxel_remesh(obj, voxel_size):
    remesh = obj.modifiers.new("voxel", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = voxel_size
    apply_modifier(obj, remesh)


def build_volume(source, voxel_size, polish_settings):
    """One closed, symmetric, polished surface: voxel remesh, polish, mirror +X
    onto -X, weld the seam. Polishing before the mirror keeps the symmetry exact.

    Returns the volume and whether it is exactly symmetric (Quadriflow's symmetry
    mode needs that). If the seam still leaves non-manifold edges, a second voxel
    pass closes them at the cost of exact symmetry, and is polished again.
    """
    volume = duplicate(source, "volume")
    volume.data.materials.clear()
    voxel_remesh(volume, voxel_size)
    polish(volume, polish_settings)
    mirror = volume.modifiers.new("symmetry", "MIRROR")
    mirror.use_axis = (True, False, False)
    mirror.use_bisect_axis = (True, False, False)
    mirror.use_clip = True
    mirror.use_mirror_merge = True
    mirror.merge_threshold = voxel_size * 0.5
    apply_modifier(volume, mirror)
    clean(volume, voxel_size * 0.25)
    broken = non_manifold_edges(volume)
    symmetric = broken == 0
    if not symmetric:
        log(f"mirror seam left {broken} non-manifold edges; re-voxelising")
        voxel_remesh(volume, voxel_size)
        polish(volume, polish_settings)
        clean(volume, voxel_size * 0.25)
        broken = non_manifold_edges(volume)
    log(f"volume: {len(volume.data.polygons)} faces at {voxel_size} m voxels, "
        f"{broken} non-manifold edges, symmetric={symmetric}")
    if broken:
        raise RuntimeError(f"The volume still has {broken} non-manifold edges")
    return volume, symmetric


def polish(obj, settings):
    """Taubin smoothing: a shrinking pass then an inflating one, repeated.

    Bumps a few voxels wide (the scan's lumps) fade while the forms and the
    volume stay, unlike plain smoothing, which melts the whole body a little
    on every pass. Symmetric on a symmetric mesh.
    """
    iterations = settings["iterations"]
    if iterations <= 0:
        return
    mesh = obj.data
    count = len(mesh.vertices)
    buffer = np.empty(count * 3, dtype=np.float32)
    mesh.vertices.foreach_get("co", buffer)
    co = buffer.reshape(-1, 3).astype(np.float64)
    edges = np.empty(len(mesh.edges) * 2, dtype=np.int32)
    mesh.edges.foreach_get("vertices", edges)
    a, b = edges.astype(np.int64).reshape(-1, 2).T
    degree = np.maximum(np.bincount(np.concatenate([a, b]), minlength=count), 1)[:, None]

    def step(factor):
        total = np.empty_like(co)
        for k in range(3):
            total[:, k] = np.bincount(a, weights=co[b, k], minlength=count) + np.bincount(
                b, weights=co[a, k], minlength=count
            )
        return co + factor * (total / degree - co)

    before = co.copy()
    for _ in range(iterations):
        co = step(settings["lambda"])
        co = step(settings["mu"])
    mesh.vertices.foreach_set("co", co.astype(np.float32).ravel())
    mesh.update()
    moved = np.linalg.norm(co - before, axis=1)
    log(f"polished {count} vertices over {iterations} passes: "
        f"mean {moved.mean() * 1000:.2f} mm, max {moved.max() * 1000:.2f} mm")


def retopologise(volume, symmetric, quads, smooth_iterations, name):
    low = duplicate(volume, name)
    result = set()
    for use_symmetry in ([True, False] if symmetric else [False]):
        activate(low)
        try:
            result = bpy.ops.object.quadriflow_remesh(
                mode="FACES",
                target_faces=quads,
                use_mesh_symmetry=use_symmetry,
                use_preserve_sharp=False,
                use_preserve_boundary=False,
                smooth_normals=False,
                seed=0,
            )
        except RuntimeError as error:
            result = {str(error).strip()}
        if "FINISHED" in result:
            break
        log(f"Quadriflow {name} with symmetry={use_symmetry} returned {result}")
    if "FINISHED" not in result:
        raise RuntimeError(f"Quadriflow did not finish for {name}: {result}")
    if smooth_iterations:
        smooth = low.modifiers.new("smooth", "SMOOTH")
        smooth.factor = 0.5
        smooth.iterations = smooth_iterations
        apply_modifier(low, smooth)
    wrap = low.modifiers.new("wrap", "SHRINKWRAP")
    wrap.target = volume
    wrap.wrap_method = "NEAREST_SURFACEPOINT"
    apply_modifier(low, wrap)
    activate(low)
    bpy.ops.object.shade_smooth()
    triangles = sum(len(p.vertices) - 2 for p in low.data.polygons)
    log(f"{name}: {len(low.data.polygons)} faces, {triangles} triangles (target {quads} quads)")
    return low, triangles


def unwrap(obj):
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.uv.pack_islands(margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")


def new_image(name, size, non_color):
    image = bpy.data.images.new(name, size, size, alpha=False)
    if non_color:
        image.colorspace_settings.name = "Non-Color"
    return image


def set_bake_target(obj, image):
    """A throwaway material whose active image node receives the bake."""
    material = bpy.data.materials.new(f"{obj.name}_bake")
    material.use_nodes = True
    node = material.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    material.node_tree.nodes.active = node
    node.select = True
    obj.data.materials.clear()
    obj.data.materials.append(material)


def bake(kind, low, image, high=None, samples=4, fit=None):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.bake.margin = 8
    set_bake_target(low, image)
    kwargs = {"type": kind, "margin": 8, "use_selected_to_active": high is not None}
    if kind == "DIFFUSE":
        kwargs["pass_filter"] = {"COLOR"}
    if kind == "NORMAL":
        kwargs["normal_space"] = "TANGENT"
    if high is not None:
        kwargs["cage_extrusion"] = fit["bake"]["cageExtrusionM"]
        kwargs["max_ray_distance"] = fit["bake"]["maxRayDistanceM"]
        only_render(low, high)
        activate(low, high)
    else:
        only_render(low)
        activate(low)
    started = time.time()
    bpy.ops.object.bake(**kwargs)
    log(f"baked {kind} {image.size[0]}px on {low.name} in {time.time() - started:.1f}s")


def bake_material(kind, low, material, image):
    """Bake the low mesh through its own material (no selected-to-active):
    NORMAL keeps the material's normal and bump nodes, EMIT its emission."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 4
    scene.cycles.use_denoising = False
    tree = material.node_tree
    target = tree.nodes.new("ShaderNodeTexImage")
    target.image = image
    tree.nodes.active = target
    low.data.materials.clear()
    low.data.materials.append(material)
    only_render(low)
    activate(low)
    kwargs = {"type": kind, "margin": 8, "use_selected_to_active": False}
    if kind == "NORMAL":
        kwargs["normal_space"] = "TANGENT"
    started = time.time()
    bpy.ops.object.bake(**kwargs)
    tree.nodes.remove(target)
    log(f"baked {kind} {image.size[0]}px through {material.name} in {time.time() - started:.1f}s")


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def segment_distances(points, a, b):
    ab = b - a
    t = np.clip(((points - a) @ ab) / max(float(ab @ ab), 1e-12), 0.0, 1.0)
    return np.linalg.norm(points - (a + t[:, None] * ab), axis=1)


def paint_scale_sizes(low, rig, scales):
    """How big the scales are at each vertex, as the "scale_size" attribute:
    fine within limbReachM of the forearms, hands, shins and feet and within
    faceReachM of the snout tip, coarse elsewhere, blended over blendM."""
    mesh = low.data
    co = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
    mesh.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3).astype(np.float64)
    fine = np.zeros(len(co))
    reach, blend = scales["limbReachM"], scales["blendM"]
    for bone in rig["bones"]:
        if bone["role"] not in ("arm", "leg") or bone["name"].startswith("thigh"):
            continue
        head = np.array(gltf_to_blender(bone["restHead"]))
        tail = np.array(gltf_to_blender(bone["tail"]))
        near = 1 - smoothstep(reach, reach + blend, segment_distances(co, head, tail))
        fine = np.maximum(fine, near)
    snout = np.array(gltf_to_blender(rig["landmarks"]["snoutTip"]))
    face = scales["faceReachM"]
    near = 1 - smoothstep(face, face + blend, np.linalg.norm(co - snout, axis=1))
    fine = np.maximum(fine, near)
    size = scales["coarseM"] + (scales["fineM"] - scales["coarseM"]) * fine
    attribute = mesh.attributes.new("scale_size", "FLOAT", "POINT")
    attribute.data.foreach_set("value", size.astype(np.float32))
    log(f"scale sizes: {np.mean(fine > 0.5) * 100:.0f}% of the skin fine")


def read_pixels(image):
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(height, width, 4)


def belly_tone(base, spread):
    """Where the belly's lighter tone is, 0 to 1, read from the baked base
    colour: Otsu's threshold between the body's and the belly's tones,
    softened over spread and blurred a little so the plates fade in."""
    pixels = read_pixels(base)
    height, width = pixels.shape[:2]
    tone = 0.2126 * pixels[..., 0] + 0.7152 * pixels[..., 1] + 0.0722 * pixels[..., 2]
    baked = tone[tone > 0.02]
    counts, edges = np.histogram(baked, bins=128, range=(0.0, 1.0))
    centres = (edges[:-1] + edges[1:]) / 2
    weight = np.cumsum(counts)
    mean = np.cumsum(counts * centres)
    total, total_mean = weight[-1], mean[-1]
    with np.errstate(divide="ignore", invalid="ignore"):
        between = (total_mean * weight - mean * total) ** 2 / (weight * (total - weight))
    threshold = float(centres[np.nanargmax(between[:-1])])
    mask = smoothstep(threshold - spread, threshold + spread, tone)
    for _ in range(2):
        padded = np.pad(mask, 1, mode="edge")
        mask = sum(padded[dy : dy + height, dx : dx + width] for dy in range(3) for dx in range(3)) / 9
    log(f"belly: tone threshold {threshold:.3f}, {np.mean(mask[tone > 0.02] > 0.5) * 100:.0f}% of the map")
    return mask, tone > 0.02


def mask_image(mask, name):
    height, width = mask.shape
    image = new_image(name, width, non_color=True)
    out = np.ones((height, width, 4), dtype=np.float32)
    out[..., 0] = out[..., 1] = out[..., 2] = mask
    image.pixels.foreach_set(out.ravel())
    image.update()
    return image


def flatten_colours(base, belly, baked, strength):
    """The source's colours carry shading baked in by the image-to-3D service:
    blotches on the cheeks and shoulders. Pull the body towards its median
    purple and the belly towards its median lavender by strength, keeping the
    edge between them (the belly mask) and a share of the detail."""
    pixels = read_pixels(base)
    body_tone = np.median(pixels[baked & (belly < 0.1)][:, :3], axis=0)
    belly_tone_ = np.median(pixels[baked & (belly > 0.9)][:, :3], axis=0)
    target = body_tone * (1 - belly[..., None]) + belly_tone_ * belly[..., None]
    pixels[..., :3] = np.where(
        baked[..., None], pixels[..., :3] * (1 - strength) + target * strength, pixels[..., :3]
    )
    base.pixels.foreach_set(pixels.ravel())
    base.update()
    log(f"flattened colours by {strength}: body {np.round(body_tone, 3)}, belly {np.round(belly_tone_, 3)}")


def scale_material(forms, belly, landmarks, scales):
    """The skin's detail, as a material on the low mesh: the polished forms
    (a tangent normal map) with the scales bumped on top. Its surface is the
    normal to bake; `emission` switches it to the scales' height instead."""
    material = bpy.data.materials.new("scales")
    material.use_nodes = True
    tree = material.node_tree
    nodes, links = tree.nodes, tree.links
    nodes.clear()

    def feed(socket, value):
        if isinstance(value, bpy.types.NodeSocket):
            links.new(value, socket)
        else:
            socket.default_value = value

    def op(operation, a, b=None):
        node = nodes.new("ShaderNodeMath")
        node.operation = operation
        feed(node.inputs[0], a)
        if b is not None:
            feed(node.inputs[1], b)
        return node.outputs[0]

    def ramp(value, low, high):
        """0 below low, 1 above high, smoothstep between."""
        node = nodes.new("ShaderNodeMapRange")
        node.interpolation_type = "SMOOTHSTEP"
        feed(node.inputs["Value"], value)
        node.inputs["From Min"].default_value = low
        node.inputs["From Max"].default_value = high
        return node.outputs["Result"]

    coords = nodes.new("ShaderNodeTexCoord").outputs["Object"]
    size = nodes.new("ShaderNodeAttribute")
    size.attribute_name = "scale_size"
    density = op("DIVIDE", 1.0, size.outputs["Fac"])

    # Scales: domed cells, parted by narrow grooves.
    distances = {}
    for feature in ("F1", "DISTANCE_TO_EDGE"):
        cells = nodes.new("ShaderNodeTexVoronoi")
        cells.voronoi_dimensions = "3D"
        cells.feature = feature
        links.new(coords, cells.inputs["Vector"])
        links.new(density, cells.inputs["Scale"])
        cells.inputs["Randomness"].default_value = scales["randomness"]
        if "Detail" in cells.inputs:
            cells.inputs["Detail"].default_value = 0.0
        distances[feature] = cells.outputs["Distance"]
    walls = ramp(distances["DISTANCE_TO_EDGE"], 0.0, scales["grooveWidth"])
    dome = op("SUBTRACT", 1.0, op("MULTIPLY", distances["F1"], scales["dome"]))
    skin = op("MULTIPLY", walls, dome)

    # Belly plates: rows of wide plates, laid over the front like bricks.
    plates_spec = scales["belly"]
    xyz = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords, xyz.inputs[0])
    # Rows curve up towards the sides with the round belly, and wobble a little.
    wobble = nodes.new("ShaderNodeTexNoise")
    links.new(coords, wobble.inputs["Vector"])
    wobble.inputs["Scale"].default_value = plates_spec["warpScale"]
    shift = op("MULTIPLY", op("SUBTRACT", wobble.outputs["Fac"], 0.5), plates_spec["warpM"])
    across = op("ADD", xyz.outputs["X"], shift)
    curve = op("MULTIPLY", op("MULTIPLY", xyz.outputs["X"], xyz.outputs["X"]), plates_spec["curve"])
    rows = op("ADD", op("ADD", xyz.outputs["Z"], curve), shift)
    front = nodes.new("ShaderNodeCombineXYZ")
    links.new(across, front.inputs["X"])
    links.new(rows, front.inputs["Y"])
    brick = nodes.new("ShaderNodeTexBrick")
    brick.offset = 0.5
    brick.offset_frequency = 2
    links.new(front.outputs[0], brick.inputs["Vector"])
    brick.inputs["Scale"].default_value = 1.0
    brick.inputs["Mortar Size"].default_value = plates_spec["grooveM"]
    brick.inputs["Mortar Smooth"].default_value = 0.8
    brick.inputs["Brick Width"].default_value = plates_spec["widthM"]
    brick.inputs["Row Height"].default_value = plates_spec["rowM"]
    plates = op("SUBTRACT", 1.0, brick.outputs["Fac"])

    # Where the belly is: its tone, between the legs and the neck, near the middle.
    tone = nodes.new("ShaderNodeTexImage")
    tone.image = belly
    fade = plates_spec["fadeM"]
    up = xyz.outputs["Z"]
    within = op("MULTIPLY", tone.outputs["Color"], ramp(up, landmarks["crotchY"], landmarks["crotchY"] + fade))
    within = op("MULTIPLY", within, op("SUBTRACT", 1.0, ramp(up, landmarks["neckY"] - fade, landmarks["neckY"])))
    side = op("ABSOLUTE", xyz.outputs["X"])
    half = plates_spec["halfWidthM"]
    within = op("MULTIPLY", within, op("SUBTRACT", 1.0, ramp(side, half - fade, half)))
    height = op("ADD", skin, op("MULTIPLY", within, op("SUBTRACT", plates, skin)))

    forms_node = nodes.new("ShaderNodeTexImage")
    forms_node.image = forms
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.space = "TANGENT"
    links.new(forms_node.outputs["Color"], normal_map.inputs["Color"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = scales["strength"]
    bump.inputs["Distance"].default_value = scales["depthM"]
    links.new(height, bump.inputs["Height"])
    links.new(normal_map.outputs["Normal"], bump.inputs["Normal"])
    surface = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bump.outputs["Normal"], surface.inputs["Normal"])
    glow = nodes.new("ShaderNodeEmission")
    links.new(height, glow.inputs["Color"])
    output = nodes.new("ShaderNodeOutputMaterial")
    links.new(surface.outputs[0], output.inputs["Surface"])

    def emission(on):
        links.new((glow if on else surface).outputs[0], output.inputs["Surface"])

    return material, emission


def map_format(fit, tier):
    """Container for this tier's baked maps: WebP ships as is, JPEG is the
    input the KTX2 conversion reads later."""
    return "WEBP" if fit["compress"]["textures"][tier] == "webp" else "JPEG"


def save_image(image, path, file_format, quality=90):
    image.filepath_raw = path
    image.file_format = file_format
    try:
        image.save(filepath=path, quality=quality)
    except TypeError:
        image.save()


def compose_orm(ao, size, roughness, height=None, cavity=None):
    """R: occlusion, G: roughness. With the scales' height, the grooves
    between them get darker (cavity ao) and rougher (cavity roughness)."""
    pixels = np.empty(size * size * 4, dtype=np.float32)
    ao.pixels.foreach_get(pixels)
    out = np.zeros_like(pixels)
    out[0::4] = pixels[0::4]
    out[1::4] = roughness
    out[3::4] = 1.0
    if height is not None:
        heights = np.empty(size * size * 4, dtype=np.float32)
        height.pixels.foreach_get(heights)
        groove = 1 - smoothstep(0.0, 0.5, heights[0::4])
        out[0::4] *= 1 - cavity["ao"] * groove
        out[1::4] = np.clip(roughness + cavity["roughness"] * groove, 0.0, 1.0)
    orm = new_image("orm", size, non_color=True)
    orm.pixels.foreach_set(out)
    orm.update()
    return orm


def build_armature(rig):
    data = bpy.data.armatures.new("Armature")
    armature = bpy.data.objects.new("Armature", data)
    bpy.context.collection.objects.link(armature)
    activate(armature)
    bpy.ops.object.mode_set(mode="EDIT")
    edit = {}
    for bone in rig["bones"]:
        e = data.edit_bones.new(bone["name"])
        e.head = gltf_to_blender(bone["restHead"])
        e.tail = gltf_to_blender(bone["tail"])
        if (e.tail - e.head).length < 1e-4:
            e.tail = e.head + Vector((0, 0, 0.02))
        e.use_deform = bool(bone["deform"])
        edit[bone["name"]] = e
    for bone in rig["bones"]:
        if bone["parent"]:
            edit[bone["name"]].parent = edit[bone["parent"]]
            edit[bone["name"]].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return armature


def bind(low, armature, deform_names):
    only_render(low, armature)
    activate(armature, low)
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    activate(low)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
    unweighted = 0
    for vertex in low.data.vertices:
        if sum(g.weight for g in vertex.groups) < 1e-3:
            unweighted += 1
    empty = [n for n in deform_names if n in low.vertex_groups and not any(
        g.group == low.vertex_groups[n].index for v in low.data.vertices for g in v.groups
    )]
    log(f"weights: {unweighted} unweighted vertices, {len(empty)} empty bone groups")
    return {"unweightedVertices": unweighted, "emptyGroups": empty}


def export_body(low, armature, path):
    low.name = "body"
    low.data.name = "body"
    low.data.materials.clear()
    bpy.ops.object.select_all(action="DESELECT")
    low.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_materials="NONE",
        export_animations=False,
        export_skins=True,
        export_yup=True,
        export_apply=True,
    )


def main():
    args = parse_args()
    root = os.path.abspath(args.root)
    out = os.path.join(root, args.out)
    fit = json.load(open(os.path.join(root, "assets/model/fit.json"), encoding="utf-8"))
    rig = json.load(open(os.path.join(out, "rig.json"), encoding="utf-8"))
    deform_names = [b["name"] for b in rig["bones"] if b["deform"]]

    source = import_source(os.path.join(out, "normalized.glb"))
    volume, symmetric = build_volume(source, fit["retopo"]["voxelSizeM"], fit["retopo"]["polish"])
    report = {"blender": bpy.app.version_string, "tiers": {}}

    for tier in ("full", "lite"):
        started = time.time()
        folder = os.path.join(out, tier)
        os.makedirs(folder, exist_ok=True)
        size = fit["bake"]["size"][tier]
        low, triangles = retopologise(
            volume,
            symmetric,
            fit["retopo"]["targetQuads"][tier],
            fit["retopo"]["smoothIterations"],
            f"body_{tier}",
        )
        unwrap(low)

        fmt = map_format(fit, tier)
        ext = "webp" if fmt == "WEBP" else "jpg"

        base = new_image(f"basecolor_{tier}", fit["bake"]["baseColorSize"][tier], non_color=False)
        bake("DIFFUSE", low, base, high=source, samples=4, fit=fit)
        belly, baked = belly_tone(base, fit["scales"]["belly"]["toneSpread"])
        flatten_colours(base, belly, baked, fit["bake"]["flatten"])
        save_image(base, os.path.join(folder, f"basecolor.{ext}"), fmt, fit["bake"]["jpegQuality"])

        ao = new_image(f"ao_{tier}", size, non_color=True)
        bake("AO", low, ao, samples=fit["bake"]["samples"])
        height = None

        if tier == "full":
            # The polished forms, then the scales bumped on top of them.
            normal_size = fit["bake"]["normalSize"]
            forms = new_image(f"forms_{tier}", normal_size, non_color=True)
            bake("NORMAL", low, forms, high=volume, samples=4, fit=fit)
            scales = fit["scales"]
            paint_scale_sizes(low, rig, scales)
            material, emission = scale_material(forms, mask_image(belly, "belly"), rig["landmarks"], scales)
            normal = new_image(f"normal_{tier}", normal_size, non_color=True)
            bake_material("NORMAL", low, material, normal)
            # Lossless: JPEG noise in a normal map costs the KTX2 encoder dearly.
            save_image(normal, os.path.join(folder, "normal.png"), "PNG")
            height = new_image(f"height_{tier}", size, non_color=True)
            emission(True)
            bake_material("EMIT", low, material, height)

        orm = compose_orm(ao, size, fit["bake"]["roughness"], height, fit.get("scales", {}).get("cavity"))
        save_image(orm, os.path.join(folder, f"orm.{ext}"), fmt, 92)

        armature = build_armature(rig)
        weights = bind(low, armature, deform_names)
        export_body(low, armature, os.path.join(folder, "body.glb"))
        bpy.data.objects.remove(armature, do_unlink=True)
        bpy.data.objects.remove(low, do_unlink=True)
        report["tiers"][tier] = {
            "triangles": triangles,
            "textureSize": size,
            "seconds": round(time.time() - started, 1),
            **weights,
        }
        log(f"{tier} done in {time.time() - started:.1f}s")

    with open(os.path.join(out, "body-report.json"), "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    log("body step finished")


if __name__ == "__main__":
    main()
