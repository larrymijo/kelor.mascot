"""Headless Blender step: normalised source -> per-tier bodies.

For each tier it retopologises the source into quads, unwraps UVs, bakes
the base colour (from the source), ambient occlusion and, on full, a normal
map (from a clean voxel volume), builds the contract armature from
build/model/rig.json and binds the body with automatic weights.

Outputs, per tier, in <out>/<tier>/: body.glb (skinned mesh, no materials),
basecolor.jpg, orm.jpg (R: AO, G: roughness, B: 0) and normal.jpg (full).
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


def build_volume(source, voxel_size):
    """One closed, symmetric surface: voxel remesh, mirror +X onto -X, weld the seam.

    Returns the volume and whether it is exactly symmetric (Quadriflow's symmetry
    mode needs that). If the seam still leaves non-manifold edges, a second voxel
    pass closes them at the cost of exact symmetry.
    """
    volume = duplicate(source, "volume")
    volume.data.materials.clear()
    voxel_remesh(volume, voxel_size)
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
        clean(volume, voxel_size * 0.25)
        broken = non_manifold_edges(volume)
    log(f"volume: {len(volume.data.polygons)} faces at {voxel_size} m voxels, "
        f"{broken} non-manifold edges, symmetric={symmetric}")
    if broken:
        raise RuntimeError(f"The volume still has {broken} non-manifold edges")
    return volume, symmetric


def retopologise(volume, symmetric, quads, smooth_iterations, name):
    low = duplicate(volume, name)
    result = set()
    for use_symmetry in ([True, False] if symmetric else [False]):
        activate(low)
        result = bpy.ops.object.quadriflow_remesh(
            mode="FACES",
            target_faces=quads,
            use_mesh_symmetry=use_symmetry,
            use_preserve_sharp=False,
            use_preserve_boundary=False,
            smooth_normals=False,
            seed=0,
        )
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


def save_image(image, path, file_format, quality=90):
    image.filepath_raw = path
    image.file_format = file_format
    try:
        image.save(filepath=path, quality=quality)
    except TypeError:
        image.save()


def compose_orm(ao, size, roughness):
    pixels = np.empty(size * size * 4, dtype=np.float32)
    ao.pixels.foreach_get(pixels)
    out = np.zeros_like(pixels)
    out[0::4] = pixels[0::4]
    out[1::4] = roughness
    out[3::4] = 1.0
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
    volume, symmetric = build_volume(source, fit["retopo"]["voxelSizeM"])
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

        base = new_image(f"basecolor_{tier}", size, non_color=False)
        bake("DIFFUSE", low, base, high=source, samples=4, fit=fit)
        save_image(base, os.path.join(folder, "basecolor.jpg"), "JPEG", fit["bake"]["jpegQuality"])

        ao = new_image(f"ao_{tier}", size, non_color=True)
        bake("AO", low, ao, samples=fit["bake"]["samples"])
        orm = compose_orm(ao, size, fit["bake"]["roughness"])
        save_image(orm, os.path.join(folder, "orm.jpg"), "JPEG", 92)

        if tier == "full":
            normal = new_image(f"normal_{tier}", size, non_color=True)
            bake("NORMAL", low, normal, high=volume, samples=4, fit=fit)
            # JPEG keeps the uncompressed budget until KTX2 arrives in phase 4.
            save_image(normal, os.path.join(folder, "normal.jpg"), "JPEG", 95)

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
