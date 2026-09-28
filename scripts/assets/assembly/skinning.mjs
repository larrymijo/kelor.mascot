/**
 * Skinning and geometry helpers shared by the placeholder generator and the
 * real-model assembly: bone influence segments, distance-based weights,
 * rigid binding, and merging parts into one mesh.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** Where a bone's influence segment ends when it has no single child. */
export const CHAIN_NEXT = { hips: 'spine_01', chest: 'neck_01' }
export const LEAF_EXTENT = {
  head: [0, 0.34, 0.05],
  foot_L: [0, -0.02, 0.12],
  foot_R: [0, -0.02, 0.12],
  hand_L: [0.012, -0.02, 0.03],
  hand_R: [-0.012, -0.02, 0.03],
  tail_04: [0, -0.035, -0.08],
}

export const isProcedural = (bone) => bone.role === 'eye' || bone.role === 'eyelid'

/**
 * Influence segment (head to tail) of every deforming bone.
 * @param {{ name: string, parent: string | null, role: string, restHead: number[] }[]} bones
 */
export function boneSegments(bones, leafExtent = LEAF_EXTENT) {
  const byName = new Map(bones.map((b) => [b.name, b]))
  const segments = new Map()
  for (const bone of bones) {
    if (bone.role === 'root' || isProcedural(bone)) continue
    const children = bones.filter((b) => b.parent === bone.name && !isProcedural(b))
    const next = CHAIN_NEXT[bone.name] ?? (children.length === 1 ? children[0].name : null)
    const a = new THREE.Vector3(...bone.restHead)
    const b = next
      ? new THREE.Vector3(...byName.get(next).restHead)
      : a.clone().add(new THREE.Vector3(...(leafExtent[bone.name] ?? [0, 0.05, 0])))
    segments.set(bone.name, [a, b])
  }
  return segments
}

const _ab = new THREE.Vector3()
const _ap = new THREE.Vector3()
export function distanceToSegment(p, a, b) {
  _ab.subVectors(b, a)
  _ap.subVectors(p, a)
  const t = Math.min(1, Math.max(0, _ap.dot(_ab) / _ab.lengthSq()))
  return _ap.addScaledVector(_ab, -t).length()
}

/** Smooth weights: inverse distance to the allowed bones, top 4, normalised. */
export function skinByDistance(geometry, boneNames, segments, jointOf) {
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
export function skinRigid(geometry, joint) {
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

/** Keep only the attributes the GLB needs, so geometries merge cleanly. */
export function prepare(geometry) {
  const g = geometry.index ? geometry : geometry.toNonIndexed()
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(name)) {
      g.deleteAttribute(name)
    }
  }
  g.clearGroups()
  return g
}

export function merge(geometries) {
  const merged = mergeGeometries(geometries.map(prepare), false)
  if (!merged) throw new Error('Could not merge geometries')
  return merged
}
