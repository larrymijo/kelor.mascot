import { Document, NodeIO } from '@gltf-transform/core'
import { BufferAttribute } from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import contract from '../../character.json'
import fit from '../../assets/model/fit.json'
import { boneSegments, merge, skinByDistance } from './assembly/skinning.mjs'
import { buildModel, cleanWeights, readBody, smoothWeights } from './build-model.mjs'
import { parseGlb } from './glb.mjs'
import { measureLandmarks } from './model/landmarks.mjs'
import { bodyParts } from './placeholder/shapes.mjs'
import { bodyBaseColor, bodyNormal, bodyOrm } from './placeholder/textures.mjs'
import { validateGlb } from './validate.mjs'

type Bone = (typeof contract.skeleton.bones)[number]
const bones = contract.skeleton.bones as Bone[]
const jointOf = (name: string) => bones.findIndex((b) => b.name === name)
const ZEROED = 50

/** What Blender exports: a skinned body whose joints come in a different order. */
async function blenderLikeBody() {
  const segments = boneSegments(bones)
  const geometry = merge(
    bodyParts(0.5).flatMap((part) =>
      part.geometries.map((g) => skinByDistance(g, part.bones, segments, jointOf)),
    ),
  )
  const blenderOrder = [...bones].reverse()
  const toBlender = new Map(blenderOrder.map((b, i) => [jointOf(b.name), i]))
  const joints = Uint16Array.from(geometry.attributes.skinIndex.array, (j) => toBlender.get(j)!)
  const weights = Float32Array.from(geometry.attributes.skinWeight.array)
  weights.fill(0, 0, ZEROED * 4)

  const doc = new Document()
  const buffer = doc.createBuffer()
  type Typed = Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer> | Uint32Array<ArrayBuffer>
  const accessor = (array: Typed, type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4') =>
    doc.createAccessor().setArray(array).setType(type).setBuffer(buffer)
  const nodes = blenderOrder.map((b) => doc.createNode(b.name))
  const skin = doc.createSkin('Armature')
  nodes.forEach((n) => skin.addJoint(n))
  const prim = doc
    .createPrimitive()
    .setAttribute(
      'POSITION',
      accessor(Float32Array.from(geometry.attributes.position.array), 'VEC3'),
    )
    .setAttribute('NORMAL', accessor(Float32Array.from(geometry.attributes.normal.array), 'VEC3'))
    .setAttribute('TEXCOORD_0', accessor(Float32Array.from(geometry.attributes.uv.array), 'VEC2'))
    .setAttribute('JOINTS_0', accessor(joints, 'VEC4'))
    .setAttribute('WEIGHTS_0', accessor(weights, 'VEC4'))
    .setIndices(accessor(Uint32Array.from(geometry.index!.array), 'SCALAR'))
  const body = doc
    .createNode('body')
    .setMesh(doc.createMesh('body').addPrimitive(prim))
    .setSkin(skin)
  const scene = doc.createScene()
  nodes.forEach((n) => scene.addChild(n))
  scene.addChild(body)
  return {
    bytes: await new NodeIO().writeBinary(doc),
    positions: Float32Array.from(geometry.attributes.position.array),
    contractJoints: Uint16Array.from(geometry.attributes.skinIndex.array),
  }
}

let built: Awaited<ReturnType<typeof buildModel>>
let tierBytes: Uint8Array
let contractJoints: Uint16Array

beforeAll(async () => {
  const body = await blenderLikeBody()
  const { bytes, positions } = body
  contractJoints = body.contractJoints
  const landmarks = measureLandmarks(positions, contract.meta.heightM)
  const segments = boneSegments(bones)
  const rig = {
    landmarks,
    bones: bones.map((b) => ({
      ...b,
      tail: segments.get(b.name)?.[1].toArray() ?? b.restHead,
      deform: b.role !== 'root' && b.role !== 'eye' && b.role !== 'eyelid',
    })),
  }
  const png = (data: Uint8Array) => ({ data, mimeType: 'image/png' })
  tierBytes = bytes
  built = await buildModel({
    contract,
    fit,
    tier: 'full',
    body: bytes,
    rig,
    textures: {
      baseColor: png(bodyBaseColor(contract.colors, 256)),
      orm: png(bodyOrm(64)),
      normal: png(bodyNormal(64)),
    },
  })
})

describe('build-model', () => {
  it('remaps Blender joint order to the contract order', async () => {
    const geometry = await readBody(tierBytes, contract)
    const read = geometry.attributes.skinIndex.array
    // Vertices past the zeroed ones keep their weights, so their joints must round-trip.
    const start = ZEROED * 4
    expect(Array.from(read.slice(start, start + 400))).toEqual(
      Array.from(contractJoints.slice(start, start + 400)),
    )
  })

  it('repairs vertices that automatic weights left empty', () => {
    // At least the zeroed ones; the armpit cut can empty a few inner arm vertices too.
    expect(built.report.repairedVertices).toBeGreaterThanOrEqual(ZEROED)
  })

  it('produces a contract GLB with no validator failures or warnings', () => {
    const report = validateGlb({ bytes: built.bytes, contract, tier: 'full' })
    expect(report.results.filter((r) => r.status !== 'pass')).toEqual([])
  })

  it('sinks the eyeballs into the head and mirrors them', () => {
    const { L, R } = built.report.eyes
    expect(L[0]).toBeCloseTo(-R[0], 6)
    expect(L[2]).toBeCloseTo(R[2], 6)
    expect(L[2]).toBeGreaterThan(0.1)
  })

  it('moves the eye and eyelid bones onto the eyeballs', () => {
    const { json } = parseGlb(built.bytes)
    const node = (name: string) => json.nodes.find((n: { name: string }) => n.name === name)
    const head = node('head').translation as number[]
    const eye = node('eye_L').translation as number[]
    const lid = node('eyelid_L').translation as number[]
    expect(lid).toEqual(eye)
    expect(eye[2]! + head[2]!).toBeGreaterThan(0)
  })

  it('marks the file as the real model with its source', () => {
    const { json } = parseGlb(built.bytes)
    expect(json.extras).toMatchObject({ kelorModel: true, source: fit.source })
  })
})

describe('cleanWeights', () => {
  it('takes arm influence off a torso that automatic weights handed to the arm', () => {
    const torso = bodyParts(0.5).find((part) => part.name === 'torso')!.geometries[0]!
    const count = torso.attributes.position.count
    const arm = jointOf('upperarm_L')
    torso.setAttribute(
      'skinIndex',
      new BufferAttribute(
        Uint16Array.from({ length: count * 4 }, (_, i) => (i % 4 ? 0 : arm)),
        4,
      ),
    )
    torso.setAttribute(
      'skinWeight',
      new BufferAttribute(
        Float32Array.from({ length: count * 4 }, (_, i) => (i % 4 ? 0 : 1)),
        4,
      ),
    )
    const { repaired, clamped } = cleanWeights(
      torso,
      bones,
      jointOf,
      fit.rig.influenceLimitsM,
      fit.rig.armpitMarginM,
    )
    expect(clamped).toBeGreaterThan(0)
    expect(repaired).toBe(clamped)

    const pos = torso.attributes.position
    const joints = torso.attributes.skinIndex.array
    const weights = torso.attributes.skinWeight.array
    const arms = new Set(bones.filter((b) => b.role === 'arm').map((b) => jointOf(b.name)))

    // Nothing inside the shoulders keeps arm weight (armpit cut).
    const shoulder = Math.abs(bones.find((b) => b.name === 'upperarm_L')!.restHead[0])
    for (let i = 0; i < count; i++) {
      if (Math.abs(pos.getX(i)) >= shoulder - fit.rig.armpitMarginM) continue
      for (let k = 0; k < 4; k++) {
        const armWeight = arms.has(joints[i * 4 + k]!) ? weights[i * 4 + k]! : 0
        expect(armWeight).toBe(0)
      }
    }

    // Belly-front vertices keep no arm weight; spine, neck or legs take over within their limits.
    for (let i = 0; i < count; i++) {
      if (Math.abs(pos.getX(i)) > 0.05 || pos.getZ(i) < 0.15) continue
      let total = 0
      for (let k = 0; k < 4; k++) {
        const w = weights[i * 4 + k]!
        expect(arms.has(joints[i * 4 + k]!) && w > 0).toBe(false)
        total += w
      }
      expect(total).toBeCloseTo(1, 5)
    }
  })
})

describe('smoothWeights', () => {
  it('blurs a hard weight border, keeps four influences, unit sums and closed seams', () => {
    const segments = boneSegments(bones)
    const torso = merge([
      skinByDistance(
        bodyParts(0.5).find((part) => part.name === 'torso')!.geometries[0]!,
        ['spine_01'],
        segments,
        jointOf,
      ),
    ])
    const pos = torso.attributes.position
    const joints = torso.attributes.skinIndex.array
    const weights = torso.attributes.skinWeight.array
    // A hard border: everything above y 0.5 belongs to the chest.
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0.5) joints[i * 4] = jointOf('chest')
    }
    const groups = smoothWeights(torso, bones.length, 4, 0.5)
    expect(groups).toBeLessThanOrEqual(pos.count)

    let blended = 0
    const byPosition = new Map<string, string>()
    for (let i = 0; i < pos.count; i++) {
      const w = [0, 1, 2, 3].map((k) => weights[i * 4 + k]!)
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
      if (w.filter((x) => x > 0.05).length > 1) blended += 1
      const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((v) => v.toFixed(5)).join(',')
      const value = [0, 1, 2, 3]
        .map((k) => `${joints[i * 4 + k]}:${weights[i * 4 + k]!.toFixed(5)}`)
        .join('|')
      if (byPosition.has(key)) expect(byPosition.get(key)).toBe(value)
      else byPosition.set(key, value)
    }
    // The border is no longer a single switch between neighbours.
    expect(blended).toBeGreaterThan(20)
  })
})
