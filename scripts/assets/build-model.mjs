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
  distanceToSegment,
  isProcedural,
  merge,
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
 * Clean automatic weights, which misbehave when short arms rest against the
 * body: a bone loses any influence on vertices farther than its role's limit
 * from its segment (fit.json rig.influenceLimitsM), and an arm bone also on
 * vertices nearer the body's centre line than its shoulder minus
 * armpitMarginM (the contract has no clavicles, so the upper arm starts
 * inside the chest). The rest is renormalised; vertices left (almost) empty
 * get inverse-distance weights from the bones allowed to reach them.
 * @returns {{ repaired: number, clamped: number }}
 */
export function cleanWeights(geometry, bones, jointOf, limits = {}, armpitMarginM = Infinity) {
  const segments = boneSegments(bones)
  const deform = bones.filter((b) => b.role !== 'root' && !isProcedural(b))
  const shoulderX = (bone) =>
    Math.abs(bones.find((b) => b.name === `upperarm_${bone.name.slice(-1)}`).restHead[0])
  const reaches = (bone, p, distance) =>
    distance <= (limits[bone.role] ?? Infinity) &&
    (bone.role !== 'arm' || Math.abs(p.x) >= shoulderX(bone) - armpitMarginM)
  const weights = geometry.attributes.skinWeight.array
  const joints = geometry.attributes.skinIndex.array
  const position = geometry.attributes.position
  const p = new THREE.Vector3()
  let repaired = 0
  let clamped = 0

  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i)
    let total = 0
    for (let k = 0; k < 4; k++) {
      const w = weights[i * 4 + k]
      if (w <= 0) continue
      const bone = bones[joints[i * 4 + k]]
      const segment = segments.get(bone.name)
      if (segment && !reaches(bone, p, distanceToSegment(p, segment[0], segment[1]))) {
        weights[i * 4 + k] = 0
        clamped += 1
      } else total += w
    }
    if (total >= 0.5) {
      for (let k = 0; k < 4; k++) weights[i * 4 + k] /= total
      continue
    }

    // Rebuild from the bones allowed to reach this vertex (or the nearest one).
    repaired += 1
    const ranked = deform
      .map((bone) => {
        const [a, b] = segments.get(bone.name)
        const d = distanceToSegment(p, a, b)
        return { joint: jointOf(bone.name), d, allowed: reaches(bone, p, d) }
      })
      .sort((x, y) => x.d - y.d || x.joint - y.joint)
    const pool = ranked.filter((r) => r.allowed)
    const top = (pool.length ? pool : ranked.slice(0, 1)).slice(0, 4)
    const raw = top.map((r) => 1 / (r.d + 0.01) ** 4)
    const sum = raw.reduce((a, b) => a + b, 0)
    for (let k = 0; k < 4; k++) {
      joints[i * 4 + k] = top[k]?.joint ?? 0
      weights[i * 4 + k] = top[k] ? raw[k] / sum : 0
    }
  }
  geometry.attributes.skinWeight.needsUpdate = true
  geometry.attributes.skinIndex.needsUpdate = true
  return { repaired, clamped }
}

/**
 * Laplacian smoothing of skin weights, so influence fades over several edge
 * rings instead of switching between neighbours (which creases the skin when
 * a limb rotates). Vertices are welded by position first: exporters split
 * them at UV seams, and a seam must not open. Keeps the four strongest
 * influences per vertex, renormalised.
 * @returns {number} how many welded vertices were smoothed
 */
export function smoothWeights(geometry, boneCount, iterations = 3, factor = 0.5) {
  if (iterations <= 0 || factor <= 0) return 0
  const position = geometry.attributes.position
  const joints = geometry.attributes.skinIndex.array
  const weights = geometry.attributes.skinWeight.array
  const count = position.count

  // Weld: one group per distinct position.
  const groupOf = new Int32Array(count)
  const keys = new Map()
  for (let i = 0; i < count; i++) {
    const key = [position.getX(i), position.getY(i), position.getZ(i)]
      .map((v) => Math.round(v * 1e5))
      .join(',')
    let group = keys.get(key)
    if (group === undefined) {
      group = keys.size
      keys.set(key, group)
    }
    groupOf[i] = group
  }
  const groups = keys.size

  // Neighbours between groups, from the triangles.
  const neighbours = Array.from({ length: groups }, () => new Set())
  const index = geometry.index.array
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [groupOf[index[t]], groupOf[index[t + 1]], groupOf[index[t + 2]]]
    neighbours[a].add(b).add(c)
    neighbours[b].add(a).add(c)
    neighbours[c].add(a).add(b)
  }
  const lists = neighbours.map((set, g) => [...set].filter((n) => n !== g))

  // Dense per-bone weights per group (first vertex of each group is representative).
  let dense = new Float32Array(groups * boneCount)
  const seen = new Uint8Array(groups)
  for (let i = 0; i < count; i++) {
    const g = groupOf[i]
    if (seen[g]) continue
    seen[g] = 1
    for (let k = 0; k < 4; k++) dense[g * boneCount + joints[i * 4 + k]] += weights[i * 4 + k]
  }
  for (let pass = 0; pass < iterations; pass++) {
    const next = new Float32Array(dense.length)
    for (let g = 0; g < groups; g++) {
      const list = lists[g]
      for (let b = 0; b < boneCount; b++) {
        let sum = 0
        for (const n of list) sum += dense[n * boneCount + b]
        const mean = list.length ? sum / list.length : dense[g * boneCount + b]
        next[g * boneCount + b] = dense[g * boneCount + b] * (1 - factor) + mean * factor
      }
    }
    dense = next
  }

  // Top four per group, written back to every vertex of the group.
  const top = new Array(groups)
  for (let g = 0; g < groups; g++) {
    const ranked = []
    for (let b = 0; b < boneCount; b++) {
      const w = dense[g * boneCount + b]
      if (w > 1e-4) ranked.push([b, w])
    }
    ranked.sort((x, y) => y[1] - x[1] || x[0] - y[0])
    const kept = ranked.slice(0, 4)
    const total = kept.reduce((n, [, w]) => n + w, 0)
    top[g] = kept.map(([b, w]) => [b, w / total])
  }
  for (let i = 0; i < count; i++) {
    const kept = top[groupOf[i]]
    for (let k = 0; k < 4; k++) {
      joints[i * 4 + k] = kept[k]?.[0] ?? 0
      weights[i * 4 + k] = kept[k]?.[1] ?? 0
    }
  }
  geometry.attributes.skinIndex.needsUpdate = true
  geometry.attributes.skinWeight.needsUpdate = true
  return groups
}

/** UV of the body vertex nearest to a point: lets lids reuse the local skin colour. */
function nearestUv(body, point) {
  const pos = body.attributes.position
  const uv = body.attributes.uv
  const p = new THREE.Vector3(...point)
  const q = new THREE.Vector3()
  let best = 0
  let bestDistance = Infinity
  for (let i = 0; i < pos.count; i++) {
    const d = q.fromBufferAttribute(pos, i).distanceToSquared(p)
    if (d < bestDistance) {
      bestDistance = d
      best = i
    }
  }
  return [uv.getX(best), uv.getY(best)]
}

function paintUv(geometry, [u, v]) {
  const uv = geometry.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v)
  return geometry
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
  const weights = cleanWeights(
    geometry,
    bones,
    jointOf,
    fit.rig.influenceLimitsM,
    fit.rig.armpitMarginM,
  )
  smoothWeights(
    geometry,
    bones.length,
    fit.rig.weightSmoothing.iterations,
    fit.rig.weightSmoothing.factor,
  )

  const { shell, patch, mouthY } = faceShellFromBody(geometry, fit, rig.landmarks)
  projectFaceUvs(shell, patch, 1 / contract.expressions.grid[0])
  skinRigid(shell, jointOf('head'))

  const detail = settings.detail
  const eyeMesh = merge(
    ['eye_L', 'eye_R'].map((b) => skinRigid(eyeball(restOf(b), detail), jointOf(b))),
  )
  const lidTilt = contract.gaze.blink.closedAngleDeg
  const lids = merge(
    ['eyelid_L', 'eyelid_R'].map((b) => {
      // Lids take the colour of the skin just above the eye, not arbitrary atlas texels.
      const [x, y, z] = restOf(b)
      const skin = nearestUv(geometry, [x, y + EYE.lidRadius, z])
      return skinRigid(paintUv(eyelid(restOf(b), lidTilt, detail), skin), jointOf(b))
    }),
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

  return {
    bytes: await writeGlb(ctx.doc),
    report: { repairedVertices: weights.repaired, clampedWeights: weights.clamped, eyes, mouthY },
  }
}
