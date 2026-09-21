/**
 * Assemble the contract GLB of the real mascot from the Blender outputs.
 *
 * Blender provides the retopologised, UV-mapped, weighted body and its baked
 * textures. This step adds everything the contract builds procedurally,
 * with the same tested code as the placeholder: eyeballs, lids and
 * catchlights at eye positions found by raycasting the head, hexagonal
 * plates cast onto the back and tail, a face shell cut from the real snout
 * for the expression atlas, the five materials and the contract clips.
 */
import { NodeIO } from '@gltf-transform/core'
import * as THREE from 'three'
import {
  addContractClips,
  addContractMaterials,
  addSkinnedMesh,
  createContractDocument,
  writeGlb,
} from './assembly/document.mjs'
import { EYE, eyeball, eyelid, highlights, plate, projectFaceUvs } from './assembly/features.mjs'
import {
  boneSegments,
  isProcedural,
  merge,
  skinByDistance,
  skinRigid,
} from './assembly/skinning.mjs'
import { eyesBaseColor, faceAtlas } from './assembly/textures.mjs'
import { heightMap } from './model/landmarks.mjs'
import { PLACEHOLDER_CLIPS } from './placeholder-clips.mjs'

/** @typedef {{ data: Uint8Array, mimeType: string }} TextureImage */

/** Feature detail and procedural texture sizes per tier. */
const TIER_SETTINGS = {
  full: { detail: 0.75, eyes: 256, face: 1024 },
  lite: { detail: 0.5, eyes: 128, face: 512 },
}

/** The atlas mouth shapes were drawn around this mouth height and snout half width. */
const ATLAS_DESIGN = { mouthY: 0.85, halfWidth: 0.175 }

/**
 * Read the Blender body: one skinned mesh whose joints are remapped from
 * Blender's joint order to the contract's.
 */
export async function readBody(bytes, contract) {
  const doc = await new NodeIO().readBinary(bytes)
  const node = doc
    .getRoot()
    .listNodes()
    .find((n) => n.getMesh() && n.getSkin())
  if (!node) throw new Error('The Blender body has no skinned mesh')
  const primitives = node.getMesh().listPrimitives()
  if (primitives.length !== 1) throw new Error(`Expected one primitive, found ${primitives.length}`)
  const prim = primitives[0]
  const contractIndex = new Map(contract.skeleton.bones.map((b, i) => [b.name, i]))
  const jointMap = node
    .getSkin()
    .listJoints()
    .map((joint) => contractIndex.get(joint.getName()) ?? -1)

  const get = (name) => {
    const accessor = prim.getAttribute(name)
    if (!accessor) throw new Error(`The Blender body has no ${name}`)
    return accessor
  }
  const position = get('POSITION')
  const count = position.getCount()
  const joints = new Uint16Array(count * 4)
  const weights = new Float32Array(count * 4)
  const jointAccessor = get('JOINTS_0')
  const weightAccessor = get('WEIGHTS_0')
  const j = []
  const w = []
  for (let i = 0; i < count; i++) {
    jointAccessor.getElement(i, j)
    weightAccessor.getElement(i, w)
    for (let k = 0; k < 4; k++) {
      const mapped = jointMap[j[k]] ?? -1
      joints[i * 4 + k] = mapped < 0 ? 0 : mapped
      weights[i * 4 + k] = mapped < 0 ? 0 : w[k]
    }
  }

  const geometry = new THREE.BufferGeometry()
  const float = (name, size) =>
    new THREE.BufferAttribute(Float32Array.from(get(name).getArray()), size)
  geometry.setAttribute('position', float('POSITION', 3))
  geometry.setAttribute('normal', float('NORMAL', 3))
  geometry.setAttribute('uv', float('TEXCOORD_0', 2))
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(joints, 4))
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4))
  geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(prim.getIndices().getArray()), 1))
  return geometry
}

/**
 * Give vertices that automatic weights left (almost) empty distance-based
 * weights, and renormalise the rest. Returns how many were repaired.
 */
export function repairWeights(geometry, bones, jointOf) {
  const deform = bones.filter((b) => b.role !== 'root' && !isProcedural(b)).map((b) => b.name)
  const segments = boneSegments(bones)
  const weights = geometry.attributes.skinWeight
  const joints = geometry.attributes.skinIndex
  const empty = []
  for (let i = 0; i < weights.count; i++) {
    const total = weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i)
    if (total < 0.5) empty.push(i)
    else {
      weights.setXYZW(
        i,
        weights.getX(i) / total,
        weights.getY(i) / total,
        weights.getZ(i) / total,
        weights.getW(i) / total,
      )
    }
  }
  if (empty.length) {
    const scratch = new THREE.BufferGeometry()
    const positions = new Float32Array(empty.length * 3)
    empty.forEach((i, k) =>
      positions.set(geometry.attributes.position.array.slice(i * 3, i * 3 + 3), k * 3),
    )
    scratch.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    skinByDistance(scratch, deform, segments, jointOf)
    empty.forEach((i, k) => {
      for (let c = 0; c < 4; c++) {
        joints.array[i * 4 + c] = scratch.attributes.skinIndex.array[k * 4 + c]
        weights.array[i * 4 + c] = scratch.attributes.skinWeight.array[k * 4 + c]
      }
    })
  }
  return empty.length
}

function raycaster(geometry) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  const ray = new THREE.Raycaster()
  return (origin, direction) => {
    ray.set(new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize())
    return ray.intersectObject(mesh, false)[0]?.point ?? null
  }
}

/**
 * Eyeball centres on front rays, sunk so protrude × radius stays outside the skin.
 * @returns {{ L: number[], R: number[] }}
 */
export function placeEyes(cast, contract, fit, landmarks) {
  const nominalEyeY = contract.skeleton.bones.find((b) => b.name === 'eye_L').restHead[1]
  const y = fit.eyes.y ?? heightMap(landmarks)(nominalEyeY)
  const centres = /** @type {{ L: number[], R: number[] }} */ ({ L: [], R: [] })
  for (const [side, sign] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const hit = cast([sign * fit.eyes.x, y, 5], [0, 0, -1])
    if (!hit) throw new Error(`No head surface in front of eye_${side} at y ${y.toFixed(3)}`)
    centres[side] = [sign * fit.eyes.x, y, hit.z - EYE.radius * (1 - fit.eyes.protrude)]
  }
  return centres
}

/** Plates cast from their bones outwards onto the skin. */
export function placePlates(cast, fit, bones) {
  const segments = boneSegments(bones)
  return fit.plates.items.map((item) => {
    const segment = segments.get(item.bone)
    if (!segment) throw new Error(`Plate bone ${item.bone} has no segment`)
    const from = segment[0].clone().lerp(segment[1], item.t)
    const dir = new THREE.Vector3(0, item.dir[0], item.dir[1]).normalize()
    const origin = from.clone().addScaledVector(dir, 1.5)
    const hit = cast(origin.toArray(), dir.clone().negate().toArray())
    if (!hit) throw new Error(`No skin found above the ${item.bone} plate`)
    const at = hit.clone().addScaledVector(dir, item.size * (1 - 2 * fit.plates.embed))
    const tiltDeg = (-Math.atan2(-dir.z, dir.y) * 180) / Math.PI
    return { at: at.toArray(), size: item.size, tiltDeg, bone: item.bone }
  })
}

/** Front-facing skin around the mouth, pushed out a little, for the expression atlas. */
export function faceShellFromBody(body, fit, landmarks) {
  const mouthY = fit.face.mouthY ?? landmarks.mouthY
  const patch = {
    xMin: -fit.face.halfWidth,
    xMax: fit.face.halfWidth,
    yMin: mouthY - fit.face.down,
    yMax: mouthY + fit.face.up,
  }
  const pos = body.attributes.position
  const nrm = body.attributes.normal
  const index = body.index.array
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const faceNormal = new THREE.Vector3()
  const positions = []
  const normals = []
  for (let t = 0; t < index.length; t += 3) {
    a.fromBufferAttribute(pos, index[t])
    b.fromBufferAttribute(pos, index[t + 1])
    c.fromBufferAttribute(pos, index[t + 2])
    const cx = (a.x + b.x + c.x) / 3
    const cy = (a.y + b.y + c.y) / 3
    if (cx < patch.xMin || cx > patch.xMax || cy < patch.yMin || cy > patch.yMax) continue
    faceNormal.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize()
    if (faceNormal.z < 0.3) continue
    for (const vi of [index[t], index[t + 1], index[t + 2]]) {
      const n = new THREE.Vector3().fromBufferAttribute(nrm, vi)
      const p = new THREE.Vector3()
        .fromBufferAttribute(pos, vi)
        .addScaledVector(n, fit.face.offsetM)
      positions.push(p.x, p.y, p.z)
      normals.push(n.x, n.y, n.z)
    }
  }
  if (positions.length === 0) throw new Error('The face patch found no front-facing skin')
  const shell = new THREE.BufferGeometry()
  shell.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  shell.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  shell.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2),
  )
  shell.setIndex([...Array(positions.length / 3).keys()])
  return { shell, patch, mouthY }
}

/**
 * Build one tier of the contract GLB.
 * @param {{ contract: any, fit: any, tier: 'full' | 'lite', body: Uint8Array,
 *   textures: { baseColor: TextureImage, orm: TextureImage, normal?: TextureImage },
 *   rig: { bones: any[], landmarks: any } }} input
 */
export async function buildModel({ contract, fit, tier, body, textures, rig }) {
  const settings = TIER_SETTINGS[tier]
  const geometry = await readBody(body, contract)
  const cast = raycaster(geometry)
  const eyes = placeEyes(cast, contract, fit, rig.landmarks)
  const bones = rig.bones.map((bone) => {
    const side = bone.name.slice(-1)
    return bone.role === 'eye' || bone.role === 'eyelid' ? { ...bone, restHead: eyes[side] } : bone
  })

  const ctx = createContractDocument({
    contract,
    bones,
    extras: { kelorModel: true, source: fit.source, contractVersion: contract.contractVersion },
  })
  const { jointOf, restOf } = ctx
  const repaired = repairWeights(geometry, bones, jointOf)

  const { shell, patch, mouthY } = faceShellFromBody(geometry, fit, rig.landmarks)
  projectFaceUvs(shell, patch, 1 / contract.expressions.grid[0])
  skinRigid(shell, jointOf('head'))

  const detail = settings.detail
  const eyeMesh = merge(
    ['eye_L', 'eye_R'].map((b) => skinRigid(eyeball(restOf(b), detail), jointOf(b))),
  )
  const lidTilt = contract.gaze.blink.closedAngleDeg
  const lids = merge(
    ['eyelid_L', 'eyelid_R'].map((b) => skinRigid(eyelid(restOf(b), lidTilt, detail), jointOf(b))),
  )
  const catchlights = merge(
    ['eye_L', 'eye_R']
      .flatMap((b) => highlights(restOf(b), detail))
      .map((g) => skinRigid(g, jointOf('head'))),
  )
  const plates = merge(
    placePlates(cast, fit, bones).map((p) => skinRigid(plate(p), jointOf(p.bone))),
  )

  const { colors } = contract
  const layout = {
    patch,
    offsetY: mouthY - ATLAS_DESIGN.mouthY,
    scale: fit.face.halfWidth / ATLAS_DESIGN.halfWidth,
  }
  const materials = addContractMaterials(ctx, {
    bodyOrm: textures.orm,
    bodyBaseColor: textures.baseColor,
    bodyNormal: textures.normal,
    faceAtlas: {
      data: faceAtlas(colors, contract.expressions, settings.face, layout),
      mimeType: 'image/png',
    },
    eyesBaseColor: { data: eyesBaseColor(colors, settings.eyes), mimeType: 'image/png' },
  })
  addSkinnedMesh(ctx, 'body', geometry, materials.body)
  addSkinnedMesh(ctx, 'face', shell, materials.face)
  addSkinnedMesh(ctx, 'eyes', eyeMesh, materials.eyes)
  addSkinnedMesh(ctx, 'eyelids', lids, materials.body)
  addSkinnedMesh(ctx, 'eye_highlights', catchlights, materials.highlight)
  addSkinnedMesh(ctx, 'plates', plates, materials.plates)
  addContractClips(ctx, PLACEHOLDER_CLIPS)

  return { bytes: await writeGlb(ctx.doc), report: { repairedVertices: repaired, eyes, mouthY } }
}
