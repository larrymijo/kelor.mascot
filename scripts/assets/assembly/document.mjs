/**
 * Contract GLB assembly with gltf-transform, shared by the placeholder and
 * the real model: armature from rest positions, skinned meshes, the five
 * contract materials, and the contract clips from a data spec.
 *
 * Creation order is part of the output: gltf-transform writes accessors,
 * textures and materials in the order they are created, and the placeholder
 * must stay byte-identical. Keep call order stable.
 */
import { Document, NodeIO } from '@gltf-transform/core'
import { KHRMaterialsUnlit } from '@gltf-transform/extensions'
import * as THREE from 'three'

/** sRGB hex to linear RGB for glTF colour factors. */
export const toLinear = (hex) =>
  [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })

/**
 * Start a document with the armature.
 * @param {{ contract: any, bones?: any[], extras?: object }} options
 *   bones: contract bones, optionally with fitted restHead values
 */
export function createContractDocument({ contract, bones = contract.skeleton.bones, extras }) {
  const jointIndex = new Map(bones.map((b, i) => [b.name, i]))
  const jointOf = (name) => {
    const index = jointIndex.get(name)
    if (index === undefined) throw new Error(`Unknown bone ${name}`)
    return index
  }
  const restOf = (name) => bones[jointOf(name)].restHead

  const doc = new Document()
  if (extras) doc.getRoot().setExtras(extras)
  const buffer = doc.createBuffer()
  const accessor = (array, type) =>
    doc.createAccessor().setArray(array).setType(type).setBuffer(buffer)

  const scene = doc.createScene('Scene')
  const armature = doc.createNode('Armature')
  scene.addChild(armature)

  const boneNodes = new Map()
  for (const bone of bones) {
    const parentRest = bone.parent ? restOf(bone.parent) : [0, 0, 0]
    const local = bone.restHead.map((v, i) => v - parentRest[i])
    boneNodes.set(bone.name, doc.createNode(bone.name).setTranslation(local))
  }
  for (const bone of bones) {
    const node = boneNodes.get(bone.name)
    if (bone.parent) boneNodes.get(bone.parent).addChild(node)
    else armature.addChild(node)
  }
  const inverseBind = new Float32Array(16 * bones.length)
  bones.forEach((bone, i) => {
    inverseBind.set(
      new THREE.Matrix4().makeTranslation(...bone.restHead.map((v) => -v)).elements,
      i * 16,
    )
  })
  const skin = doc
    .createSkin('Armature')
    .setSkeleton(boneNodes.get(contract.skeleton.rootBone))
    .setInverseBindMatrices(accessor(inverseBind, 'MAT4'))
  for (const bone of bones) skin.addJoint(boneNodes.get(bone.name))

  return { doc, contract, bones, accessor, armature, boneNodes, skin, jointOf, restOf }
}

/**
 * The five contract materials. Each texture is { data, mimeType }.
 * @param {ReturnType<typeof createContractDocument>} ctx
 * @param {{ bodyOrm: any, bodyBaseColor: any, bodyNormal?: any, faceAtlas: any, eyesBaseColor: any }} textures
 */
export function addContractMaterials(ctx, textures) {
  const { doc, contract } = ctx
  const { colors } = contract
  const texture = (name, { data, mimeType }) =>
    doc.createTexture(name).setImage(data).setMimeType(mimeType)

  const orm = texture('body_orm', textures.bodyOrm)
  const body = doc
    .createMaterial('body')
    .setBaseColorTexture(texture('body_basecolor', textures.bodyBaseColor))
    .setMetallicRoughnessTexture(orm)
    .setOcclusionTexture(orm)
    .setRoughnessFactor(1)
    .setMetallicFactor(1)
  if (textures.bodyNormal) body.setNormalTexture(texture('body_normal', textures.bodyNormal))

  const face = doc
    .createMaterial('face')
    .setBaseColorTexture(texture('face_atlas', textures.faceAtlas))
    .setAlphaMode('BLEND')
    .setRoughnessFactor(0.6)
    .setMetallicFactor(0)
  const eyes = doc
    .createMaterial('eyes')
    .setBaseColorTexture(texture('eyes_basecolor', textures.eyesBaseColor))
    .setRoughnessFactor(0.12)
    .setMetallicFactor(0)
  const unlit = doc.createExtension(KHRMaterialsUnlit)
  const highlight = doc
    .createMaterial('highlight')
    .setBaseColorFactor([...toLinear(colors.eyes.highlight), 1])
    .setExtension('KHR_materials_unlit', unlit.createUnlit())
  const plates = doc
    .createMaterial('plates')
    .setBaseColorFactor([...toLinear(colors.mascot['700']), 1])
    .setEmissiveFactor(toLinear(colors.mascot.glow))
    .setRoughnessFactor(0.4)
    .setMetallicFactor(0)

  return { body, face, eyes, highlight, plates }
}

/** Add a skinned, single-primitive mesh as a child of the armature node. */
export function addSkinnedMesh(ctx, name, geometry, material) {
  const { doc, accessor, armature, skin } = ctx
  const a = geometry.attributes
  const joints = Uint8Array.from(a.skinIndex.array)
  const index = geometry.index.array
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', accessor(Float32Array.from(a.position.array), 'VEC3'))
    .setAttribute('NORMAL', accessor(Float32Array.from(a.normal.array), 'VEC3'))
    .setAttribute('TEXCOORD_0', accessor(Float32Array.from(a.uv.array), 'VEC2'))
    .setAttribute('JOINTS_0', accessor(joints, 'VEC4'))
    .setAttribute('WEIGHTS_0', accessor(Float32Array.from(a.skinWeight.array), 'VEC4'))
    .setIndices(
      accessor(
        a.position.count > 65535 ? Uint32Array.from(index) : Uint16Array.from(index),
        'SCALAR',
      ),
    )
    .setMaterial(material)
  const mesh = doc.createMesh(name).addPrimitive(primitive)
  armature.addChild(doc.createNode(name).setMesh(mesh).setSkin(skin))
}

/**
 * Add the contract clips from a track spec (see placeholder-clips.mjs). Every
 * other deforming bone is held at rest so cross-fades never inherit a pose.
 */
export function addContractClips(ctx, clipSpec) {
  const { doc, contract, bones, accessor, boneNodes, jointOf, restOf } = ctx
  const deg = THREE.MathUtils.degToRad
  const procedural = new Set(contract.skeleton.procedural)
  const rootName = contract.skeleton.rootBone

  for (const clip of contract.clips.required) {
    const tracks = clipSpec[clip.name]
    if (!tracks) throw new Error(`No tracks for clip ${clip.name}`)
    const animation = doc.createAnimation(clip.name)
    const keyed = new Set()
    const addChannel = (boneName, path, times, values) => {
      const sampler = doc
        .createAnimationSampler()
        .setInput(accessor(Float32Array.from(times), 'SCALAR'))
        .setOutput(accessor(Float32Array.from(values), path === 'rotation' ? 'VEC4' : 'VEC3'))
        .setInterpolation('LINEAR')
      const channel = doc
        .createAnimationChannel()
        .setTargetNode(boneNodes.get(boneName))
        .setTargetPath(path)
        .setSampler(sampler)
      animation.addSampler(sampler).addChannel(channel)
      keyed.add(`${boneName}:${path}`)
    }

    for (const track of tracks) {
      jointOf(track.bone)
      if (track.bone === rootName || procedural.has(track.bone)) {
        throw new Error(`Clip ${clip.name} must not key ${track.bone}`)
      }
      const times = track.keys.map(([t]) => t * clip.durationS)
      const values =
        track.path === 'rotation'
          ? track.keys.flatMap(([, [x, y, z]]) =>
              new THREE.Quaternion()
                .setFromEuler(new THREE.Euler(deg(x), deg(y), deg(z), 'XYZ'))
                .toArray(),
            )
          : track.keys.flatMap(([, offset]) => {
              const bone = bones[jointOf(track.bone)]
              const parentRest = bone.parent ? restOf(bone.parent) : [0, 0, 0]
              return bone.restHead.map((v, i) => v - parentRest[i] + offset[i])
            })
      addChannel(track.bone, track.path, times, values)
    }

    for (const bone of bones) {
      if (bone.name === rootName || procedural.has(bone.name)) continue
      if (!keyed.has(`${bone.name}:rotation`)) {
        addChannel(bone.name, 'rotation', [0, clip.durationS], [0, 0, 0, 1, 0, 0, 0, 1])
      }
    }
    if (!keyed.has('hips:translation')) {
      const hips = bones[jointOf('hips')]
      const local = hips.restHead.map((v, i) => v - restOf(hips.parent)[i])
      addChannel('hips', 'translation', [0, clip.durationS], [...local, ...local])
    }
  }
}

export function writeGlb(doc) {
  return new NodeIO().registerExtensions([KHRMaterialsUnlit]).writeBinary(doc)
}
