/**
 * The T-rex jaw of the contract (character.json jaw), built procedurally
 * around any head: the lip line on the snout, the cut that lets the lips
 * part, the skin weights of the jaw, the mouth cavity with its tongue, and
 * the teeth. Shared by the real model and the placeholder.
 *
 * `mouth` (from fit.json) holds the lip line's height `y`, its `halfWidth`
 * to the corners and its `smile` (how much the corners rise), the `hinge`
 * of the jaw, the cavity and the teeth settings.
 */
import * as THREE from 'three'

const smooth = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Height of the lip line at x. */
export const lipYAt = (x, mouth) => mouth.y + mouth.smile * (x / mouth.halfWidth) ** 2

/** Raycast onto a geometry, returning the point and the surface normal facing the ray. */
export function surfaceCaster(geometry) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  const ray = new THREE.Raycaster()
  return (origin, direction) => {
    ray.set(new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize())
    const hit = ray.intersectObject(mesh, false)[0]
    if (!hit) return null
    const normal = hit.face.normal.clone()
    if (normal.dot(ray.ray.direction) > 0) normal.negate()
    return { point: hit.point, normal }
  }
}

/**
 * The lip line, sampled from one corner to the other by casting from the
 * front onto the snout. Throws if the snout is missing at any sample.
 * @returns {{ x: number, point: THREE.Vector3, normal: THREE.Vector3 }[]}
 */
export function lipLine(cast, mouth, samples = 33) {
  const line = []
  for (let i = 0; i < samples; i++) {
    const x = -mouth.halfWidth + (2 * mouth.halfWidth * i) / (samples - 1)
    const hit = cast([x, lipYAt(x, mouth), 5], [0, 0, -1])
    if (!hit) throw new Error(`No snout under the lip line at x ${x.toFixed(3)}`)
    line.push({ x, point: hit.point, normal: hit.normal })
  }
  return line
}

/** The lip line's point at x, interpolated between samples. */
function lipAt(line, x) {
  const t = Math.min(
    line.length - 1,
    Math.max(0, ((x - line[0].x) / (line.at(-1).x - line[0].x)) * (line.length - 1)),
  )
  const i = Math.min(line.length - 2, Math.floor(t))
  const f = t - i
  return {
    point: line[i].point.clone().lerp(line[i + 1].point, f),
    normal: line[i].normal
      .clone()
      .lerp(line[i + 1].normal, f)
      .normalize(),
  }
}

/**
 * Cut the skin exactly along the lip line so the lips can part. Every
 * triangle the curve crosses is split where it crosses: the new vertices sit
 * on the curve, one copy for each lip between the corners and a single shared
 * one beyond them, so the lips open between the corners and the skin
 * stretches past them. The curve being smooth, the lips meet in a clean line
 * at any mesh density. Works on an indexed geometry in place.
 * @returns {{ seam: { above: number, below: number }[] }} each pair of
 *   vertices the cut opened, one per lip
 */
export function cutLips(geometry, mouth) {
  const names = Object.keys(geometry.attributes)
  const sizes = names.map((n) => geometry.attributes[n].itemSize)
  const data = names.map((n) => Array.from(geometry.attributes[n].array))
  const position = data[names.indexOf('position')]
  const index = geometry.index.array
  const x = (i) => position[i * 3]
  const y = (i) => position[i * 3 + 1]
  // Signed height above the lip line; a vertex exactly on it counts as above.
  const side = (i) => {
    const d = y(i) - lipYAt(x(i), mouth)
    return Math.abs(d) < 1e-7 ? 1e-7 : d
  }
  const inMouth = (px, pz) => Math.abs(px) < mouth.halfWidth && pz > mouth.hinge[2]

  const addVertex = (from, to, t) => {
    const next = position.length / 3
    names.forEach((name, a) => {
      const size = sizes[a]
      const values = data[a]
      for (let c = 0; c < size; c++) {
        const va = values[from * size + c]
        const vb = values[to * size + c]
        // Skinning attributes cannot be blended: take the nearer vertex's.
        values.push(
          name === 'skinIndex' || name === 'skinWeight' ? (t < 0.5 ? va : vb) : va + (vb - va) * t,
        )
      }
    })
    const normal = data[names.indexOf('normal')]
    if (normal) {
      const n = new THREE.Vector3().fromArray(normal, next * 3).normalize()
      normal.splice(next * 3, 3, n.x, n.y, n.z)
    }
    return next
  }

  // One crossing per edge, shared by both triangles on it: { above, below }.
  const crossings = new Map()
  const cross = (from, to) => {
    const key = from < to ? `${from}:${to}` : `${to}:${from}`
    let pair = crossings.get(key)
    if (!pair) {
      const sa = side(from)
      const t = sa / (sa - side(to))
      const above = addVertex(from, to, t)
      const px = position[above * 3]
      const pz = position[above * 3 + 2]
      pair = { above, below: inMouth(px, pz) ? addVertex(from, to, t) : above }
      crossings.set(key, pair)
    }
    return pair
  }

  const out = []
  for (let t = 0; t < index.length; t += 3) {
    const tri = [index[t], index[t + 1], index[t + 2]]
    const up = tri.map((i) => side(i) > 0)
    if (up[0] === up[1] && up[1] === up[2]) {
      out.push(...tri)
      continue
    }
    // Rotate so the lone vertex (the one on its own side) comes first, keeping the winding.
    const lone = up[0] !== up[1] && up[0] !== up[2] ? 0 : up[1] !== up[0] && up[1] !== up[2] ? 1 : 2
    const [l, o1, o2] = [tri[lone], tri[(lone + 1) % 3], tri[(lone + 2) % 3]]
    const p1 = cross(l, o1)
    const p2 = cross(l, o2)
    const loneAbove = up[lone]
    const loneSide = loneAbove ? 'above' : 'below'
    const pairSide = loneAbove ? 'below' : 'above'
    out.push(l, p1[loneSide], p2[loneSide])
    out.push(p1[pairSide], o1, o2, p1[pairSide], o2, p2[pairSide])
  }

  names.forEach((name, a) => {
    const attr = geometry.attributes[name]
    geometry.setAttribute(
      name,
      new THREE.BufferAttribute(new attr.array.constructor(data[a]), sizes[a], attr.normalized),
    )
  })
  geometry.setIndex(out)

  const seam = [...crossings.values()].filter((pair) => pair.above !== pair.below)
  return { seam }
}

/**
 * Skinning for the parts inside the mouth, from the lips: an upper part moves
 * exactly like the upper lip at the same x, a lower part like the lower lip,
 * jaw included. Rigid head and jaw bones would drift from lips that blend the
 * head and neck. Read after weightJaw.
 * @returns {{ upper: (x: number) => number[][], lower: (x: number) => number[][] }}
 *   each gives [joints, weights] of four influences
 */
export function lipSkin(geometry, seam) {
  const pos = geometry.attributes.position
  const joints = geometry.attributes.skinIndex
  const weights = geometry.attributes.skinWeight
  const read = (i) => [
    [0, 1, 2, 3].map((k) => joints.getComponent(i, k)),
    [0, 1, 2, 3].map((k) => weights.getComponent(i, k)),
  ]
  const samples = seam
    .map((pair) => ({ x: pos.getX(pair.above), above: read(pair.above), below: read(pair.below) }))
    .sort((a, b) => a.x - b.x)
  if (samples.length === 0) throw new Error('The lips were not cut: no seam to skin the mouth from')
  const nearest = (x) =>
    samples.reduce((best, s) => (Math.abs(s.x - x) < Math.abs(best.x - x) ? s : best))
  return { upper: (x) => nearest(x).above, lower: (x) => nearest(x).below }
}

/** Head for the upper parts, jaw for the lower: for a head whose lips are not cut. */
export function rigidSkin(headJoint, jawJoint) {
  const rigid = (joint) => () => [
    [joint, 0, 0, 0],
    [1, 0, 0, 0],
  ]
  return { upper: rigid(headJoint), lower: rigid(jawJoint) }
}

/**
 * Skin weights of the jaw: the lower lip and chin follow it, fading towards
 * the mouth corners, behind the hinge and down the throat. Weights depend on
 * position alone, so vertices that share a position (UV seams) never tear
 * apart; the lower copies on the cut itself (`lip`) follow the jaw fully.
 * The existing weights make room; at most four influences stay.
 */
export function weightJaw(geometry, lip, mouth, jawJoint) {
  const pos = geometry.attributes.position
  const joints = geometry.attributes.skinIndex
  const weights = geometry.attributes.skinWeight
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const below = lipYAt(x, mouth) - y
    if (!lip.has(i) && below <= 0.0005) continue
    // The corners stay shut, like a real mouth's, instead of stretching open.
    const across = 1 - smooth(mouth.halfWidth * 0.7, mouth.halfWidth * 1.02, Math.abs(x))
    const front = smooth(mouth.hinge[2] - 0.03, mouth.hinge[2] + 0.07, z)
    const throat = 1 - smooth(mouth.cutDepthM, mouth.cutDepthM * 2.2, below)
    const jaw = lip.has(i) ? across * front : across * front * throat
    if (jaw <= 0.001) continue

    const slots = [0, 1, 2, 3].map((k) => ({
      joint: joints.getComponent(i, k),
      weight: weights.getComponent(i, k) * (1 - jaw),
    }))
    const existing = slots.find((s) => s.joint === jawJoint && s.weight > 0)
    if (existing) existing.weight += jaw
    else slots.sort((a, b) => a.weight - b.weight)[0] = { joint: jawJoint, weight: jaw }
    const total = slots.reduce((sum, s) => sum + s.weight, 0) || 1
    slots.forEach((s, k) => {
      joints.setComponent(i, k, s.joint)
      weights.setComponent(i, k, s.weight / total)
    })
  }
  joints.needsUpdate = true
  weights.needsUpdate = true
}

/** Skin every vertex by its x (skinAt gives [joints, weights]) and give it one colour. */
function paint(geometry, skinAt, rgb) {
  const count = geometry.attributes.position.count
  const pos = geometry.attributes.position
  const skinIndex = new Uint16Array(count * 4)
  const skinWeight = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    const [j, w] = skinAt(pos.getX(i))
    skinIndex.set(j, i * 4)
    skinWeight.set(w, i * 4)
  }
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4))
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4))
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(
      new Float32Array(count * 3).map((_, k) => rgb[k % 3]),
      3,
    ),
  )
  return geometry
}

/**
 * The mouth cavity behind the lips: the inside of an ellipsoid, open at the
 * front where the lips part, its upper half on the head and its lower half on
 * the jaw, and a tongue lying in the lower half. Coloured by vertex colours
 * (linear RGB), so it needs no texture.
 */
export function mouthCavity(line, mouth, skin, colours, detail = 1) {
  // Reach past the front of the lips, so no gap opens between the cavity and
  // the middle of the lips; seen from outside those faces point away and cull.
  const front = Math.max(...line.map((s) => s.point.z)) + 0.02
  const back = mouth.hinge[2] + 0.01
  const depth = (front - back) / 2
  const centre = new THREE.Vector3(0, mouth.y, back + depth)
  const radii = new THREE.Vector3(mouth.halfWidth * 0.86, mouth.cavityHeightM, depth)
  const halves = []
  for (const upper of [true, false]) {
    const sphere = new THREE.SphereGeometry(
      1,
      Math.max(16, Math.round(22 * detail)),
      Math.max(6, Math.round(10 * detail)),
      0,
      Math.PI * 2,
      upper ? 0 : Math.PI / 2,
      Math.PI / 2,
    )
    // Seen from inside: flip the faces and their normals.
    const index = sphere.index.array
    for (let t = 0; t < index.length; t += 3)
      [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]]
    const n = sphere.attributes.normal
    for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i))
    sphere.scale(radii.x, radii.y, radii.z)
    sphere.translate(centre.x, centre.y, centre.z)
    halves.push(paint(sphere, upper ? skin.upper : skin.lower, colours.inside))
  }
  const tongue = new THREE.SphereGeometry(
    1,
    Math.max(12, Math.round(18 * detail)),
    Math.max(6, Math.round(9 * detail)),
  )
  tongue.scale(radii.x * 0.62, mouth.cavityHeightM * 0.3, depth * 0.78)
  tongue.translate(0, mouth.y - mouth.cavityHeightM * 0.45, centre.z + depth * 0.12)
  halves.push(paint(tongue, skin.lower, colours.tongue))
  return halves
}

/**
 * One tooth: a cone from its base at `at`, pointing along `direction`,
 * slightly curved backwards like a T-rex's recurved teeth.
 */
function tooth(at, direction, length, radius, detail) {
  const cone = new THREE.ConeGeometry(radius, length, Math.max(5, Math.round(7 * detail)), 2)
  // Cone tip on +Y: move the base to the origin and remember each ring's height.
  cone.translate(0, length / 2, 0)
  const p = cone.attributes.position
  const heights = Array.from({ length: p.count }, (_, i) => p.getY(i) / length)
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  )
  cone.applyQuaternion(q)
  // Bend towards the back of the mouth (world -Z), more towards the tip.
  heights.forEach((h, i) => p.setZ(i, p.getZ(i) - 0.18 * length * h * h))
  cone.computeVertexNormals()
  cone.translate(at.x, at.y, at.z)
  return cone
}

/**
 * The teeth: sharp rows along the lip line just inside the lips, raked back
 * so that they hide inside the closed mouth, and a pair of long tusks near
 * the front. The upper teeth move with the upper lip, the lower teeth with
 * the lower lip and the jaw.
 */
export function teeth(line, mouth, skin, colour, detail = 1) {
  const t = mouth.teeth
  const pieces = []
  const rake = (deg, down) => {
    const r = THREE.MathUtils.degToRad(deg)
    return new THREE.Vector3(0, down ? -Math.cos(r) : Math.cos(r), -Math.sin(r))
  }
  const place = (x, upper, { length, radius, insetM, rakeDeg }) => {
    const lip = lipAt(line, x)
    const base = lip.point
      .clone()
      .addScaledVector(lip.normal, -insetM)
      .add(new THREE.Vector3(0, upper ? t.rootM : -t.rootM, 0))
    return paint(
      tooth(base, rake(rakeDeg, upper), length, radius, detail),
      upper ? skin.upper : skin.lower,
      colour,
    )
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < t.upperPerSide; k++) {
      const u = (k + 0.5) / t.upperPerSide
      const x = side * mouth.halfWidth * (0.06 + 0.66 * u)
      pieces.push(place(x, true, { ...t.row, length: t.row.length * (1.1 - 0.5 * u) }))
    }
    for (let k = 0; k < t.lowerPerSide; k++) {
      const u = (k + 1) / (t.lowerPerSide + 0.5)
      const x = side * mouth.halfWidth * (0.06 + 0.66 * u)
      pieces.push(place(x, false, { ...t.row, length: t.row.length * (0.95 - 0.45 * u) }))
    }
    pieces.push(place(side * mouth.halfWidth * t.tusk.at, true, t.tusk))
  }
  return pieces
}
