#!/usr/bin/env node
/**
 * Build the placeholder mascot GLBs from character.json.
 *
 *   node scripts/assets/build-placeholder.mjs            write both tiers to character.json files.*
 *   node scripts/assets/build-placeholder.mjs --check    exit 1 if the files on disk are out of date
 *
 * The placeholder honours the whole contract (bone names, hierarchy and rest
 * positions, mesh and material names, textures, expression atlas, clips), so
 * the runtime loads it exactly like the real model that replaces it in phase 3.
 * Output is deterministic. Runs in about a second on plain Node, no Blender.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Document, NodeIO } from '@gltf-transform/core'
import { KHRMaterialsUnlit } from '@gltf-transform/extensions'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { PLACEHOLDER_CLIPS } from './placeholder-clips.mjs'
import {
  bodyParts,
  eyeball,
  eyelid,
  faceShell,
  highlights,
  plate,
  PLATES,
  projectFaceUvs,
} from './placeholder/shapes.mjs'
import {
  bodyBaseColor,
  bodyNormal,
  bodyOrm,
  eyesBaseColor,
  faceAtlas,
} from './placeholder/textures.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const TIERS = /** @type {const} */ (['lite', 'full'])

/** Geometry density and texture edge (px) per tier; null drops the texture. */
const TIER_SETTINGS = {
  full: { detail: 0.75, body: 256, orm: 64, normal: 64, eyes: 256, face: 512 },
  lite: { detail: 0.5, body: 128, orm: 32, normal: null, eyes: 128, face: 512 },
}

/** Where a bone's influence segment ends when it has no single child. */
const CHAIN_NEXT = { hips: 'spine_01', chest: 'neck_01' }
const LEAF_EXTENT = {
  head: [0, 0.34, 0.05],
  foot_L: [0, -0.02, 0.12],
  foot_R: [0, -0.02, 0.12],
  hand_L: [0.012, -0.02, 0.03],
  hand_R: [-0.012, -0.02, 0.03],
  tail_04: [0, -0.035, -0.08],
}

const toLinear = (hex) =>
  [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })

const isProcedural = (bone) => bone.role === 'eye' || bone.role === 'eyelid'

/** Influence segment (head to tail) of every deforming bone. */
function boneSegments(bones) {
  const byName = new Map(bones.map((b) => [b.name, b]))
  const segments = new Map()
  for (const bone of bones) {
    if (bone.role === 'root' || isProcedural(bone)) continue
    const children = bones.filter((b) => b.parent === bone.name && !isProcedural(b))
    const next = CHAIN_NEXT[bone.name] ?? (children.length === 1 ? children[0].name : null)
    const a = new THREE.Vector3(...bone.restHead)
    const b = next
      ? new THREE.Vector3(...byName.get(next).restHead)
      : a.clone().add(new THREE.Vector3(...(LEAF_EXTENT[bone.name] ?? [0, 0.05, 0])))
    segments.set(bone.name, [a, b])
  }
  return segments
}

const _ab = new THREE.Vector3()
const _ap = new THREE.Vector3()
function distanceToSegment(p, a, b) {
  _ab.subVectors(b, a)
  _ap.subVectors(p, a)
  const t = Math.min(1, Math.max(0, _ap.dot(_ab) / _ab.lengthSq()))
  return _ap.addScaledVector(_ab, -t).length()
}

/** Smooth weights: inverse distance to the allowed bones, top 4, normalised. */
function skinByDistance(geometry, boneNames, segments, jointOf) {
  const position = geometry.attributes.position
  const joints = new Uint16Array(position.count * 4)
  const weights = new Float32Array(position.count * 4)
  const p = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i)
    const ranked = boneNames
      .map((name) => {
        const [a, b] = segments.get(name)
        return { joint: jointOf(name), w: 1 / (distanceToSegment(p, a, b) + 0.01) ** 4 }
      })
      .sort((x, y) => y.w - x.w || x.joint - y.joint)
      .slice(0, 4)
    const total = ranked.reduce((sum, r) => sum + r.w, 0)
    ranked.forEach((r, k) => {
      joints[i * 4 + k] = r.joint
      weights[i * 4 + k] = r.w / total
    })
  }
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(joints, 4))
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4))
  return geometry
}

/** Every vertex fully bound to one bone. */
function skinRigid(geometry, joint) {
  const count = geometry.attributes.position.count
  const joints = new Uint16Array(count * 4)
  const weights = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    joints[i * 4] = joint
    weights[i * 4] = 1
  }
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(joints, 4))
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4))
  return geometry
}

/** Pick the body tone per vertex (see textures.bodyBaseColor) from its normal. */
function shadeBody(geometry, belly) {
  const normal = geometry.attributes.normal
  const uv = geometry.attributes.uv
  for (let i = 0; i < normal.count; i++) {
    const nz = normal.getZ(i)
    const ny = normal.getY(i)
    const front = belly ? Math.min(1, Math.max(0, (nz * 0.9 - ny * 0.35 - 0.15) / 0.75)) : 0
    const dorsal = Math.min(1, Math.max(0, -nz * 0.5 + ny * 0.5 - 0.1)) * 0.8
    uv.setXY(i, 0.5, Math.min(0.98, Math.max(0.02, 0.5 + 0.5 * front - 0.35 * dorsal)))
  }
  return geometry
}

/** Keep only the attributes the GLB needs, so geometries merge cleanly. */
function prepare(geometry) {
  const g = geometry.index ? geometry : geometry.toNonIndexed()
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(name))
      g.deleteAttribute(name)
  }
  g.clearGroups()
  return g
}

function merge(geometries) {
  const merged = mergeGeometries(geometries.map(prepare), false)
  if (!merged) throw new Error('Could not merge placeholder geometries')
  return merged
}

/**
 * Build one tier of the placeholder.
 * @param {{ contract: any, tier: 'lite' | 'full' }} options
 * @returns {Promise<Uint8Array>}
 */
export async function buildPlaceholder({ contract, tier }) {
  const settings = TIER_SETTINGS[tier]
  const { bones } = contract.skeleton
  const jointIndex = new Map(bones.map((b, i) => [b.name, i]))
  const jointOf = (name) => {
    const index = jointIndex.get(name)
    if (index === undefined) throw new Error(`Unknown bone ${name}`)
    return index
  }
  const restOf = (name) => bones[jointOf(name)].restHead
  const segments = boneSegments(bones)
  const detail = settings.detail

  // Geometry ------------------------------------------------------------------
  const body = merge(
    bodyParts(detail).flatMap((part) =>
      part.geometries.map((g) =>
        skinByDistance(shadeBody(g, part.belly), part.bones, segments, jointOf),
      ),
    ),
  )
  const face = faceShell(detail)
  projectFaceUvs(face, 1 / contract.expressions.grid[0])
  skinRigid(face, jointOf('head'))

  const eyes = merge(
    ['eye_L', 'eye_R'].map((b) => skinRigid(eyeball(restOf(b), detail), jointOf(b))),
  )
  const lidTilt = contract.gaze.blink.closedAngleDeg
  const eyelids = merge(
    ['eyelid_L', 'eyelid_R'].map((b) => skinRigid(eyelid(restOf(b), lidTilt, detail), jointOf(b))),
  )
  const catchlights = merge(
    ['eye_L', 'eye_R']
      .flatMap((b) => highlights(restOf(b), detail))
      .map((g) => skinRigid(g, jointOf('head'))),
  )
  const plates = merge(PLATES.map((p) => skinRigid(plate(p), jointOf(p.bone))))

  // Document ------------------------------------------------------------------
  const doc = new Document()
  doc.getRoot().setExtras({ kelorPlaceholder: true, contractVersion: contract.contractVersion })
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

  // Textures and materials ------------------------------------------------------
  const texture = (name, png) => doc.createTexture(name).setImage(png).setMimeType('image/png')
  const { colors } = contract
  const orm = texture('body_orm', bodyOrm(settings.orm))
  const bodyMaterial = doc
    .createMaterial('body')
    .setBaseColorTexture(texture('body_basecolor', bodyBaseColor(colors, settings.body)))
    .setMetallicRoughnessTexture(orm)
    .setOcclusionTexture(orm)
    .setRoughnessFactor(1)
    .setMetallicFactor(1)
  if (settings.normal)
    bodyMaterial.setNormalTexture(texture('body_normal', bodyNormal(settings.normal)))

  const faceMaterial = doc
    .createMaterial('face')
    .setBaseColorTexture(
      texture('face_atlas', faceAtlas(colors, contract.expressions, settings.face)),
    )
    .setAlphaMode('BLEND')
    .setRoughnessFactor(0.6)
    .setMetallicFactor(0)
  const eyesMaterial = doc
    .createMaterial('eyes')
    .setBaseColorTexture(texture('eyes_basecolor', eyesBaseColor(colors, settings.eyes)))
    .setRoughnessFactor(0.12)
    .setMetallicFactor(0)
  const unlit = doc.createExtension(KHRMaterialsUnlit)
  const highlightMaterial = doc
    .createMaterial('highlight')
    .setBaseColorFactor([...toLinear(colors.eyes.highlight), 1])
    .setExtension('KHR_materials_unlit', unlit.createUnlit())
  const platesMaterial = doc
    .createMaterial('plates')
    .setBaseColorFactor([...toLinear(colors.mascot['700']), 1])
    .setEmissiveFactor(toLinear(colors.mascot.glow))
    .setRoughnessFactor(0.4)
    .setMetallicFactor(0)

  // Meshes ----------------------------------------------------------------------
  const addMesh = (name, geometry, material) => {
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
  addMesh('body', body, bodyMaterial)
  addMesh('face', face, faceMaterial)
  addMesh('eyes', eyes, eyesMaterial)
  addMesh('eyelids', eyelids, bodyMaterial)
  addMesh('eye_highlights', catchlights, highlightMaterial)
  addMesh('plates', plates, platesMaterial)

  // Animations ------------------------------------------------------------------
  const deg = THREE.MathUtils.degToRad
  const procedural = new Set(contract.skeleton.procedural)
  const rootName = contract.skeleton.rootBone
  for (const clip of contract.clips.required) {
    const tracks = PLACEHOLDER_CLIPS[clip.name]
    if (!tracks) throw new Error(`No placeholder tracks for clip ${clip.name}`)
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

    // Hold every other deforming bone at rest so cross-fades never inherit a pose.
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

  const io = new NodeIO().registerExtensions([KHRMaterialsUnlit])
  return io.writeBinary(doc)
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export async function main(argv, io = {}) {
  const log = io.log ?? ((s) => console.log(s))
  const check = argv.includes('--check')
  const contract = JSON.parse(readFileSync(resolve(REPO_ROOT, 'character.json'), 'utf8'))
  let stale = 0
  for (const tier of TIERS) {
    const path = resolve(REPO_ROOT, contract.files[tier])
    const bytes = await buildPlaceholder({ contract, tier })
    const kb = Math.round(bytes.byteLength / 1024)
    if (check) {
      const same = existsSync(path) && Buffer.compare(readFileSync(path), Buffer.from(bytes)) === 0
      log(`${same ? 'OK   ' : 'STALE'} ${contract.files[tier]} (${kb} kB)`)
      if (!same) stale += 1
    } else {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, bytes)
      log(`wrote ${contract.files[tier]} (${kb} kB)`)
    }
  }
  if (stale)
    log(
      'Placeholder models are out of date: run "corepack pnpm build:placeholder" and commit them.',
    )
  return stale ? 1 : 0
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  process.exitCode = await main(process.argv.slice(2))
}
