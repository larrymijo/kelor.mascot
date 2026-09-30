/**
 * Assemble the contract GLB of the real mascot from the Blender outputs.
 *
 * Blender provides the retopologised, UV-mapped, weighted body and its baked
 * textures. This step adds everything the contract builds procedurally,
 * with the same tested code as the placeholder: eyeballs, lids and
 * catchlights at eye positions found by raycasting the head, hexagonal
 * plates cast onto the back and tail, a face shell cut from the real snout
 * for the expression atlas, the T-rex jaw (lips cut open, jaw weights, mouth
 * cavity, teeth), the seven materials and the contract clips.
 */
import { NodeIO } from '@gltf-transform/core'
import * as THREE from 'three'
import {
  addContractClips,
  addContractMaterials,
  addSkinnedMesh,
  createContractDocument,
  toLinear,
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
import {
  cutLips,
  gums,
  lipLine,
  lipSkin,
  mouthCavity,
  surfaceCaster,
  teeth,
  tuskPaths,
  tusks,
  weightJaw,
} from './assembly/mouth.mjs'
import { eyesBaseColor, faceAtlas } from './assembly/textures.mjs'
import { heightMap } from './model/landmarks.mjs'
import { PLACEHOLDER_CLIPS } from './placeholder-clips.mjs'

/** @typedef {{ data: Uint8Array, mimeType: string }} TextureImage */

/** Feature detail and procedural texture sizes per tier. */
const TIER_SETTINGS = {
  full: { detail: 0.9, eyes: 512, face: 1024 },
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
 * Weld a mesh's vertices by position (exporters split them at UV seams) and
 * list each welded group's neighbours along the triangles' edges.
 * @returns {{ groupOf: Int32Array, groups: number, lists: number[][], first: Int32Array }}
 */
function weld(geometry) {
  const position = geometry.attributes.position
  const count = position.count
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
  const first = new Int32Array(groups).fill(-1)
  for (let i = 0; i < count; i++) if (first[groupOf[i]] < 0) first[groupOf[i]] = i

  const neighbours = Array.from({ length: groups }, () => new Set())
  const index = geometry.index.array
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [groupOf[index[t]], groupOf[index[t + 1]], groupOf[index[t + 2]]]
    neighbours[a].add(b).add(c)
    neighbours[b].add(a).add(c)
    neighbours[c].add(a).add(b)
  }
  const lists = neighbours.map((set, g) => [...set].filter((n) => n !== g))
  return { groupOf, groups, lists, first }
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
  const joints = geometry.attributes.skinIndex.array
  const weights = geometry.attributes.skinWeight.array
  const count = geometry.attributes.position.count
  const { groupOf, groups, lists } = weld(geometry)

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

const ARMS = [
  { side: 1, suffix: 'L' },
  { side: -1, suffix: 'R' },
]
const ARM_BONES = ['upperarm', 'forearm', 'hand']
const round = (v) => Math.round(v * 1e4) / 1e4
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * @typedef {{ armpitY: number, wallX: number, arm: Uint8Array, repaired: number }} ArmSplit
 * wallX is the side of the body under the arm; arm marks, per vertex, the
 * arm's own skin below the armpit.
 */

/**
 * Keep each arm's weights on the arm. The short arms hang close to the
 * belly, and automatic weights, then the smoothing, hand the side of the
 * belly to the arm bones: the belly stretches out whenever an arm rises.
 * Distance cannot tell them apart (the side of the belly is as near the upper
 * arm as the arm's own underside), but the mesh can: below the armpit the arm
 * is a tube of its own.
 *
 * For each arm this finds the armpit: the highest height below which the skin
 * reachable from the hand, without climbing above it, never reaches the body's
 * middle. Below it only that tube keeps arm weight. Above it the side of the
 * body keeps its line up to the shoulder joint: arm weight fades in over
 * 2 falloffM outside it, then the line moves in to the shoulder's cut
 * (armpitMarginM inside the shoulder) over 2 falloffM, so the top of the
 * shoulder rises with the arm. The two rules blend over falloffM under the
 * armpit, so it folds softly. The weight taken goes back to the vertex's
 * other bones, or to the nearest spine bone when it had none.
 * @param {{ stepM: number, falloffM: number }} settings fit.json rig.armSeparation
 * @returns {Record<'L' | 'R', ArmSplit | null>} null when an arm never parts from the body
 */
export function separateArms(geometry, bones, jointOf, settings, armpitMarginM) {
  const { stepM, falloffM } = settings
  const position = geometry.attributes.position
  const joints = geometry.attributes.skinIndex.array
  const weights = geometry.attributes.skinWeight.array
  const count = position.count
  const { groupOf, groups, lists, first } = weld(geometry)
  const x = (g) => position.getX(first[g])
  const y = (g) => position.getY(first[g])
  const segments = boneSegments(bones)
  const spine = bones.filter((b) => b.role === 'spine')
  const p = new THREE.Vector3()
  /** @type {Record<string, ArmSplit | null>} */
  const splits = {}

  for (const { side, suffix } of ARMS) {
    const armJoints = new Set(ARM_BONES.map((b) => jointOf(`${b}_${suffix}`)))
    const shoulder = bones.find((b) => b.name === `upperarm_${suffix}`).restHead
    const middle = Math.abs(shoulder[0]) / 2
    // The tip of the hand: the skin nearest the end of the hand bone.
    const end = segments.get(`hand_${suffix}`)[1]
    let tip = 0
    let nearest = Infinity
    for (let g = 0; g < groups; g++) {
      const d = p.fromBufferAttribute(position, first[g]).distanceToSquared(end)
      if (d < nearest) {
        nearest = d
        tip = g
      }
    }

    let armpitY = null
    let tube = null
    for (let height = shoulder[1]; height > y(tip); height -= stepM) {
      const reached = new Uint8Array(groups)
      const stack = [tip]
      reached[tip] = 1
      let body = false
      while (stack.length && !body) {
        const g = stack.pop()
        if (side * x(g) < middle) body = true
        for (const n of lists[g]) {
          if (reached[n] || y(n) >= height) continue
          reached[n] = 1
          stack.push(n)
        }
      }
      if (!body) {
        armpitY = height
        tube = reached
        break
      }
    }
    if (armpitY === null) {
      splits[suffix] = null
      continue
    }

    // The side of the body just below the armpit, where the arm parts from it.
    const shoulderCut = Math.abs(shoulder[0]) - armpitMarginM
    let wallX = -Infinity
    for (let g = 0; g < groups; g++) {
      const along = side * x(g)
      if (along <= 0 || tube[g] || y(g) >= armpitY || y(g) < armpitY - 2 * falloffM) continue
      wallX = Math.max(wallX, along)
    }
    if (!Number.isFinite(wallX)) wallX = shoulderCut
    const top = shoulder[1] + 2 * falloffM

    const mask = new Float32Array(groups)
    for (let g = 0; g < groups; g++) {
      const along = side * x(g)
      if (along <= 0) continue
      const height = y(g)
      const rise = Math.min(1, Math.max(0, (height - shoulder[1]) / (top - shoulder[1])))
      const cut = wallX + (shoulderCut - wallX) * rise
      const outside = smoothstep(cut, cut + 2 * falloffM, along)
      const blend = smoothstep(armpitY - falloffM, armpitY, height)
      mask[g] = tube[g] * (1 - blend) + outside * blend
    }

    const arm = new Uint8Array(count)
    let repaired = 0
    for (let i = 0; i < count; i++) {
      const g = groupOf[i]
      arm[i] = tube[g]
      let taken = false
      let total = 0
      for (let k = 0; k < 4; k++) {
        const w = weights[i * 4 + k]
        if (w <= 0) continue
        if (armJoints.has(joints[i * 4 + k]) && mask[g] < 1) {
          weights[i * 4 + k] = w * mask[g]
          taken = true
        }
        total += weights[i * 4 + k]
      }
      if (!taken) continue
      if (total > 1e-6) {
        for (let k = 0; k < 4; k++) weights[i * 4 + k] /= total
        continue
      }
      p.fromBufferAttribute(position, i)
      const [bone] = spine
        .map((b) => ({ b, d: distanceToSegment(p, ...segments.get(b.name)) }))
        .sort((a, b) => a.d - b.d)
      joints.set([jointOf(bone.b.name), 0, 0, 0], i * 4)
      weights.set([1, 0, 0, 0], i * 4)
      repaired += 1
    }
    splits[suffix] = { armpitY, wallX, arm, repaired }
  }
  geometry.attributes.skinWeight.needsUpdate = true
  geometry.attributes.skinIndex.needsUpdate = true
  return splits
}

/**
 * How far the side of the body moves when each arm rises by angleDeg about its
 * shoulder (the steepest carried pose): the most any skin below the armpit's
 * fold that is not the arm's own tube travels. Only the arm chain turns, as one
 * rigid piece, so a vertex moves by its arm weight times its turned distance.
 * @returns {number} metres; 0 when no arm parted from the body
 */
export function bodyMoveUnderArms(geometry, bones, jointOf, splits, angleDeg, foldM) {
  const position = geometry.attributes.position
  const joints = geometry.attributes.skinIndex.array
  const weights = geometry.attributes.skinWeight.array
  const p = new THREE.Vector3()
  const turned = new THREE.Vector3()
  let most = 0
  for (const { side, suffix } of ARMS) {
    const split = splits[suffix]
    if (!split) continue
    const armJoints = new Set(ARM_BONES.map((b) => jointOf(`${b}_${suffix}`)))
    const pivot = new THREE.Vector3(...bones.find((b) => b.name === `upperarm_${suffix}`).restHead)
    const turn = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      side * THREE.MathUtils.degToRad(angleDeg),
    )
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i)
      if (side * p.x <= 0 || p.y >= split.armpitY - foldM || split.arm[i]) continue
      let share = 0
      for (let k = 0; k < 4; k++) if (armJoints.has(joints[i * 4 + k])) share += weights[i * 4 + k]
      if (share <= 0) continue
      turned.copy(p).sub(pivot).applyQuaternion(turn).add(pivot)
      most = Math.max(most, share * turned.distanceTo(p))
    }
  }
  return most
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

/**
 * The mouth of the T-rex jaw on this snout: the lip line at the face's mouth
 * height, and the hinge far back behind the snout tip, like a T-rex's.
 */
export function placeMouth(fit, landmarks) {
  const y = fit.face.mouthY ?? landmarks.mouthY
  return {
    ...fit.mouth,
    y,
    hinge: [0, y + 0.01, landmarks.snoutTip[2] - fit.mouth.hingeBackM],
  }
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
  const joints = body.attributes.skinIndex
  const weights = body.attributes.skinWeight
  const index = body.index.array
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const faceNormal = new THREE.Vector3()
  const positions = []
  const normals = []
  const skinIndex = []
  const skinWeight = []
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
      // The shell moves exactly like the skin under it, jaw included.
      for (let k = 0; k < 4; k++) {
        skinIndex.push(joints ? joints.getComponent(vi, k) : 0)
        skinWeight.push(weights ? weights.getComponent(vi, k) : k === 0 ? 1 : 0)
      }
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
  shell.setAttribute('skinIndex', new THREE.BufferAttribute(Uint16Array.from(skinIndex), 4))
  shell.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4))
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
  const mouth = placeMouth(fit, rig.landmarks)
  const bones = rig.bones.map((bone) => {
    const side = bone.name.slice(-1)
    if (bone.role === 'jaw') return { ...bone, restHead: mouth.hinge }
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
  // After the smoothing, which spreads arm weight back onto the belly.
  const separation = fit.rig.armSeparation
  const arms = separateArms(geometry, bones, jointOf, separation, fit.rig.armpitMarginM)
  const { armRaiseDeg, armFlapRatio } = contract.interaction.carry
  const bodyMoveM = bodyMoveUnderArms(
    geometry,
    bones,
    jointOf,
    arms,
    armRaiseDeg * (1 + armFlapRatio),
    separation.falloffM,
  )
  if (bodyMoveM > separation.maxBodyMoveM) {
    throw new Error(
      `Raising the arms moves the side of the body ${(bodyMoveM * 100).toFixed(1)} cm ` +
        `(at most ${separation.maxBodyMoveM * 100} cm)`,
    )
  }

  // The jaw: cast the lip line on the intact snout, then cut the lips open
  // and hand the lower lip and chin to the jaw bone.
  // The tusks ride on the closed lips, so their paths are cast before the cut too.
  const snout = surfaceCaster(geometry)
  const lips = lipLine(snout, mouth)
  const tuskLines = tuskPaths(snout, mouth, settings.detail)
  const { seam } = cutLips(geometry, mouth)
  weightJaw(geometry, new Set(seam.map((pair) => pair.below)), mouth, jointOf('jaw'))
  const mouthSkin = lipSkin(geometry, seam)

  const { shell, patch, mouthY } = faceShellFromBody(geometry, fit, rig.landmarks)
  projectFaceUvs(shell, patch, 1 / contract.expressions.grid[0])

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
  const mouthColours = {
    inside: toLinear(contract.colors.mouth.inside),
    tongue: toLinear(contract.colors.mouth.tongue),
  }
  const toothColours = {
    teeth: toLinear(contract.colors.mouth.teeth),
    tusk: toLinear(contract.colors.mouth.tusk),
  }
  const teethMesh = merge(teeth(lips, mouth, mouthSkin, toothColours, detail))
  const tuskMesh = merge(tusks(tuskLines, mouth, mouthSkin, toothColours, detail))
  const mouthMesh = merge([
    ...mouthCavity(lips, mouth, mouthSkin, mouthColours, detail),
    ...gums(lips, mouth, mouthSkin, toLinear(contract.colors.mouth.gums), detail),
  ])

  const { colors } = contract
  const layout = {
    patch,
    offsetY: mouthY - ATLAS_DESIGN.mouthY,
    scale: fit.face.halfWidth / ATLAS_DESIGN.halfWidth,
    lip: { y: mouth.y, halfWidth: mouth.halfWidth, smile: mouth.smile },
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
  addSkinnedMesh(ctx, 'teeth', teethMesh, materials.teeth)
  addSkinnedMesh(ctx, 'tusks', tuskMesh, materials.teeth)
  addSkinnedMesh(ctx, 'mouth', mouthMesh, materials.mouth)
  addContractClips(ctx, PLACEHOLDER_CLIPS)

  return {
    bytes: await writeGlb(ctx.doc),
    report: {
      repairedVertices: weights.repaired,
      clampedWeights: weights.clamped,
      arms: Object.fromEntries(
        Object.entries(arms).map(([side, split]) => [
          side,
          split && {
            armpitY: round(split.armpitY),
            wallX: round(split.wallX),
            repaired: split.repaired,
          },
        ]),
      ),
      bodyMoveM: round(bodyMoveM),
      eyes,
      mouthY,
    },
  }
}
