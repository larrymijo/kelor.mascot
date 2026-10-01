/**
 * How close each arm's forearm and hand come to the head through every clip,
 * measured on the skinned body of a built model. Kelo's head is 40% of his
 * height and his arms are short, so a raise past vertical sweeps the hand
 * through his cheek (the old wave did, at 115 degrees).
 *
 * The clips are posed from their data (placeholder-clips.mjs), the way the
 * assembly keys them, on the model's own skeleton and weights: a change to a
 * clip is checked against the committed body before any model run.
 */
import { dequantize } from '@gltf-transform/functions'
import * as THREE from 'three'
import { compressionIO } from './compress.mjs'

const deg = THREE.MathUtils.degToRad

/** Vertices whose strongest weight (over half) is on one of these joints. */
function ownedBy(joints, weights, jointSet) {
  const owned = []
  for (let i = 0; i < joints.getCount(); i++) {
    const j = joints.getElement(i, [])
    const w = weights.getElement(i, [])
    let best = 0
    for (let k = 1; k < 4; k++) if (w[k] > w[best]) best = k
    if (w[best] > 0.5 && jointSet.has(j[best])) owned.push(i)
  }
  return owned
}

/** A track's value at normalised time t: quaternions slerped, offsets lerped, as the runtime does. */
function sampleTrack(track, t) {
  const keys = track.keys
  let k = 0
  while (k < keys.length - 1 && keys[k + 1][0] <= t) k++
  const k1 = Math.min(k + 1, keys.length - 1)
  const span = keys[k1][0] - keys[k][0]
  const f = span > 0 ? Math.min(1, Math.max(0, (t - keys[k][0]) / span)) : 0
  const [a, b] = [keys[k][1], keys[k1][1]]
  if (track.path === 'rotation') {
    const qa = new THREE.Quaternion().setFromEuler(new THREE.Euler(deg(a[0]), deg(a[1]), deg(a[2])))
    const qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(deg(b[0]), deg(b[1]), deg(b[2])))
    return qa.slerp(qb, f).toArray()
  }
  return a.map((v, i) => v + (b[i] - v) * f)
}

/**
 * @param {Uint8Array} bytes a built model (GLB)
 * @param {Record<string, { bone: string, path: string, keys: [number, number[]][] }[]>} clips
 * @param {number} samples poses per clip
 * @returns {Promise<Record<string, { L: number, R: number }>>} metres, the closest per clip and side
 */
export async function armHeadClearance(bytes, clips, samples = 24) {
  const io = await compressionIO()
  const doc = await io.readBinary(bytes)
  await doc.transform(dequantize())
  const root = doc.getRoot()
  const body = root.listNodes().find((n) => n.getName() === 'body' && n.getMesh())
  if (!body) throw new Error('No body mesh in the model')
  const primitive = body.getMesh().listPrimitives()[0]
  const skin = body.getSkin()
  const joints = skin.listJoints()
  const jointIndex = new Map(joints.map((joint, i) => [joint.getName(), i]))
  const inverseBind = joints.map((_, i) =>
    new THREE.Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i, [])),
  )
  const position = primitive.getAttribute('POSITION')
  const skinJoints = primitive.getAttribute('JOINTS_0')
  const skinWeights = primitive.getAttribute('WEIGHTS_0')
  const set = (...names) =>
    new Set(names.map((n) => jointIndex.get(n)).filter((i) => i !== undefined))
  const head = ownedBy(skinJoints, skinWeights, set('head', 'neck_02'))
  const arms = {
    L: ownedBy(skinJoints, skinWeights, set('forearm_L', 'hand_L')),
    R: ownedBy(skinJoints, skinWeights, set('forearm_R', 'hand_R')),
  }
  const rest = new Map(
    joints.map((joint) => [joint, { t: joint.getTranslation(), r: joint.getRotation() }]),
  )

  const p = new THREE.Vector3()
  const sum = new THREE.Vector3()
  const skinned = (matrices, i) => {
    const j = skinJoints.getElement(i, [])
    const w = skinWeights.getElement(i, [])
    sum.set(0, 0, 0)
    for (let k = 0; k < 4; k++) {
      if (w[k])
        sum.add(
          p.fromArray(position.getElement(i, [])).applyMatrix4(matrices[j[k]]).multiplyScalar(w[k]),
        )
    }
    return sum.clone()
  }

  const result = {}
  for (const [name, tracks] of Object.entries(clips)) {
    const closest = { L: Infinity, R: Infinity }
    for (let s = 0; s <= samples; s++) {
      const t = s / samples
      for (const [joint, { t: translation, r }] of rest) {
        joint.setTranslation(translation)
        joint.setRotation(r)
      }
      for (const track of tracks) {
        const joint = joints[jointIndex.get(track.bone)]
        if (!joint) continue
        const value = sampleTrack(track, t)
        if (track.path === 'rotation') joint.setRotation(value)
        else joint.setTranslation(rest.get(joint).t.map((v, i) => v + value[i]))
      }
      const matrices = joints.map((joint, i) =>
        new THREE.Matrix4().fromArray(joint.getWorldMatrix()).multiply(inverseBind[i]),
      )
      const headPoints = head.map((i) => skinned(matrices, i))
      for (const side of /** @type {const} */ (['L', 'R'])) {
        for (const i of arms[side]) {
          const a = skinned(matrices, i)
          for (const h of headPoints)
            closest[side] = Math.min(closest[side], a.distanceToSquared(h))
        }
      }
    }
    result[name] = { L: Math.sqrt(closest.L), R: Math.sqrt(closest.R) }
  }
  return result
}
