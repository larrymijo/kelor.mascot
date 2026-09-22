"""Headless Blender step: review renders of the final contract GLB.

Renders, with Cycles on CPU, the rest pose from four sides, the topology,
the bone layout, a face close-up and every clip at mid-pose. The images go
to the review folder that CI commits back to the branch.

Run (Blender 5.2 LTS):
  blender -b --factory-startup --python-exit-code 1 -P scripts/blender/review.py -- \
      --root . --model public/models/mascot.full.glb --out assets/review/phase-3
"""

import argparse
import json
import math
import os
import sys
import time

import bpy
from mathutils import Vector

T0 = time.time()


def log(message):
    print(f"[review {time.time() - T0:7.1f}s] {message}", flush=True)


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--model", default="public/models/mascot.full.glb")
    parser.add_argument("--out", default="assets/review/phase-3")
    return parser.parse_args(argv)


def setup_scene(resolution, samples):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.resolution_x = resolution
    scene.render.resolution_y = resolution
    scene.render.image_settings.file_format = "PNG"
    world = bpy.data.worlds.new("studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.012, 0.012, 0.014, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    scene.world = world

    def area(name, location, energy, color, size):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.color = color
        data.size = size
        light = bpy.data.objects.new(name, data)
        light.location = location
        scene.collection.objects.link(light)
        direction = Vector((0, 0, 0.6)) - light.location
        light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    area("key", (1.6, -2.2, 2.4), 450, (1.0, 0.96, 0.92), 1.5)
    area("rim", (-1.8, 2.0, 1.8), 300, (0.72, 0.58, 1.0), 1.2)
    area("fill", (-2.2, -1.4, 1.0), 90, (0.88, 0.9, 1.0), 2.0)

    camera_data = bpy.data.cameras.new("camera")
    camera_data.lens = 70
    camera = bpy.data.objects.new("camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return scene, camera


def aim(camera, target, distance, azimuth_deg, elevation_deg):
    az = math.radians(azimuth_deg)
    el = math.radians(elevation_deg)
    # Blender: the character faces -Y, so the front camera sits at -Y.
    offset = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    camera.location = target + offset * distance
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def render(scene, path):
    scene.render.filepath = path
    started = time.time()
    bpy.ops.render.render(write_still=True)
    log(f"rendered {os.path.basename(path)} in {time.time() - started:.1f}s")


def emissive(name, color, strength=4.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs[0].default_value = (*color, 1)
    emission.inputs[1].default_value = strength
    output = nodes.new("ShaderNodeOutputMaterial")
    material.node_tree.links.new(emission.outputs[0], output.inputs[0])
    return material


def see_through(name, color, alpha):
    """Emission mixed with transparency, so objects inside stay visible."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs[0].default_value = (*color, 1)
    emission.inputs[1].default_value = 0.6
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = alpha
    output = nodes.new("ShaderNodeOutputMaterial")
    links = material.node_tree.links
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs[0])
    return material


def assign_action(armature, action):
    armature.animation_data_create()
    armature.animation_data.action = action
    slots = getattr(action, "slots", None)
    if slots and hasattr(armature.animation_data, "action_slot"):
        armature.animation_data.action_slot = slots[0]


def main():
    args = parse_args()
    root = os.path.abspath(args.root)
    out = os.path.join(root, args.out)
    os.makedirs(out, exist_ok=True)
    fit = json.load(open(os.path.join(root, "assets/model/fit.json"), encoding="utf-8"))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(root, args.model))
    armature = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    body = next(o for o in meshes if o.name.startswith("body"))
    actions = sorted(bpy.data.actions, key=lambda a: a.name)
    if armature.animation_data:
        armature.animation_data.action = None
    for pose_bone in armature.pose.bones:
        pose_bone.location = (0, 0, 0)
        pose_bone.rotation_quaternion = (1, 0, 0, 0)

    scene, camera = setup_scene(fit["review"]["resolution"], fit["review"]["samples"])
    bpy.context.view_layer.update()
    corners = [body.matrix_world @ Vector(c) for c in body.bound_box]
    low = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    high = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    target = (low + high) / 2
    radius = (high - low).length / 2
    distance = radius / math.sin(math.radians(14)) * 1.05

    for name, azimuth, elevation in (
        ("front", 0, 6),
        ("three-quarter", 35, 10),
        ("side", 90, 4),
        ("back", 180, 10),
    ):
        aim(camera, target, distance, azimuth, elevation)
        render(scene, os.path.join(out, f"rest-{name}.png"))

    head = armature.matrix_world @ armature.data.bones["head"].head_local
    face_target = head + Vector((0, 0, 0.22))
    aim(camera, face_target, distance * 0.42, 0, 4)
    render(scene, os.path.join(out, "face-closeup.png"))

    # Topology: an emissive wireframe copy over the body.
    wire = body.copy()
    wire.data = body.data.copy()
    scene.collection.objects.link(wire)
    modifier = wire.modifiers.new("wire", "WIREFRAME")
    modifier.thickness = 0.0012
    modifier.use_replace = True
    wire.data.materials.clear()
    wire.data.materials.append(emissive("wire", (0.85, 0.8, 1.0), 2.0))
    for name, azimuth in (("front", 0), ("side", 90)):
        aim(camera, target, distance, azimuth, 6)
        render(scene, os.path.join(out, f"topology-{name}.png"))
    bpy.data.objects.remove(wire, do_unlink=True)

    # Bones: glowing spheres at every bone head, meshes hidden.
    for mesh in meshes:
        mesh.hide_render = True
    marker = emissive("bone", (1.0, 0.8, 0.2), 6.0)
    spheres = []
    for bone in armature.data.bones:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.018, location=armature.matrix_world @ bone.head_local)
        sphere = bpy.context.active_object
        sphere.data.materials.append(marker)
        spheres.append(sphere)
    ghost = body.copy()
    ghost.data = body.data.copy()
    ghost.hide_render = False
    scene.collection.objects.link(ghost)
    ghost.data.materials.clear()
    ghost.data.materials.append(see_through("ghost", (0.45, 0.35, 0.8), 0.18))
    ghost.visible_shadow = False
    for name, azimuth in (("front", 0), ("side", 90)):
        aim(camera, target, distance, azimuth, 4)
        render(scene, os.path.join(out, f"bones-{name}.png"))
    for obj in spheres + [ghost]:
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in meshes:
        mesh.hide_render = False

    # Clips at mid-pose.
    for action in actions:
        assign_action(armature, action)
        start, end = action.frame_range
        scene.frame_set(int(round((start + end) / 2)))
        aim(camera, target, distance, 30, 8)
        clip = action.name.split("|")[-1].split(".")[0]
        render(scene, os.path.join(out, f"clip-{clip}.png"))

    log(f"review renders in {out}")


if __name__ == "__main__":
    main()
