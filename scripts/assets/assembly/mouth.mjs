/**
 * The T-rex jaw of the contract (character.json jaw), built procedurally
 * around any head: the lip line on the snout, the cut that lets the lips
 * part, the skin weights of the jaw, the mouth cavity with its tongue and
 * gums, the blade teeth and the tusks that show outside the closed mouth.
 * Shared by the real model and the placeholder.
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

/** Linear RGB, mixed. */
const mix = (a, b, t) => [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t)

/**
 * Skin every vertex by its x (skinAt gives [joints, weights]) and colour it:
 * one linear RGB for all, or colourAt(i) per vertex.
 */
function paint(geometry, skinAt, colour) {
  const count = geometry.attributes.position.count
  const pos = geometry.attributes.position
  const skinIndex = new Uint16Array(count * 4)
  const skinWeight = new Float32Array(count * 4)
  const colours = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const [j, w] = skinAt(pos.getX(i))
    skinIndex.set(j, i * 4)
    skinWeight.set(w, i * 4)
    colours.set(typeof colour === 'function' ? colour(i) : colour, i * 3)
  }
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4))
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4))
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
  return geometry
}

/**
 * A tube swept along `path`, its radius radiusAt(s) with s from 0 at the start
 * to 1 at the end, and an elliptical section: `first` sets the direction of
 * the section's first axis at the start, `squash` scales the second. Frames
 * are parallel-transported, so the section never twists. Where the radius
 * reaches zero the tube closes in a point, so tips come out sharp.
 * @returns {{ geometry: THREE.BufferGeometry, along: number[] }} with s per vertex
 */
function sweep(path, radiusAt, radial, first, squash = 1) {
  const n = path.length
  const tangent = (i) =>
    path[Math.min(n - 1, i + 1)]
      .clone()
      .sub(path[Math.max(0, i - 1)])
      .normalize()
  let t = tangent(0)
  const axis = first.clone().addScaledVector(t, -first.dot(t)).normalize()
  const positions = []
  const uvs = []
  const along = []
  const rings = []
  for (let i = 0; i < n; i++) {
    const next = tangent(i)
    const turn = new THREE.Vector3().crossVectors(t, next)
    const angle = Math.asin(Math.min(1, turn.length()))
    if (angle > 1e-7) axis.applyAxisAngle(turn.normalize(), angle)
    t = next
    const second = new THREE.Vector3().crossVectors(t, axis).normalize()
    const s = i / (n - 1)
    const r = radiusAt(s)
    const ring = []
    if (r <= 1e-6) {
      ring.push(positions.length / 3)
      positions.push(...path[i].toArray())
      uvs.push(0.5, s)
      along.push(s)
    } else {
      for (let k = 0; k < radial; k++) {
        const a = (k / radial) * Math.PI * 2
        const p = path[i]
          .clone()
          .addScaledVector(axis, Math.cos(a) * r)
          .addScaledVector(second, Math.sin(a) * r * squash)
        ring.push(positions.length / 3)
        positions.push(p.x, p.y, p.z)
        uvs.push(k / radial, s)
        along.push(s)
      }
    }
    rings.push(ring)
  }
  const index = []
  for (let i = 0; i + 1 < n; i++) {
    const a = rings[i]
    const b = rings[i + 1]
    if (a.length > 1 && b.length > 1) {
      for (let k = 0; k < radial; k++) {
        const k1 = (k + 1) % radial
        index.push(a[k], a[k1], b[k], b[k], a[k1], b[k1])
      }
    } else if (a.length > 1) {
      for (let k = 0; k < radial; k++) index.push(a[k], a[(k + 1) % radial], b[0])
    } else if (b.length > 1) {
      for (let k = 0; k < radial; k++) index.push(a[0], b[k], b[(k + 1) % radial])
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  // Unused by the untextured mouth materials; there so the parts merge with the cavity.
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return { geometry, along }
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
 * One blade tooth, like a T-rex's: wide along the jaw and thin in and out
 * (`thickness`), tapering to a sharp tip that curves back into the mouth.
 * Ivory at the gum, white at the tip.
 */
function bladeTooth(at, axis, spec, length, shades, detail) {
  const steps = Math.max(4, Math.round(7 * detail))
  const back = new THREE.Vector3(0, 0, -1)
  const path = Array.from({ length: steps + 1 }, (_, i) => {
    const h = i / steps
    return at
      .clone()
      .addScaledVector(axis, h * length)
      .addScaledVector(back, 0.2 * length * h * h)
  })
  const { geometry, along } = sweep(
    path,
    (h) => spec.radius * (1 - h) ** 0.85,
    Math.max(5, Math.round(10 * detail)),
    new THREE.Vector3(1, 0, 0),
    spec.thickness,
  )
  const colourAt = (i) => mix(shades.root, shades.tip, along[i] ** 1.4)
  return { geometry, colourAt }
}

/**
 * The inner teeth: rows of blade teeth along the lip line just inside the
 * lips, set in the gums and raked back so they hide in the closed mouth,
 * bigger at the front. The upper row moves with the upper lip, the lower
 * with the jaw. `colours` holds the teeth and tusk colours, linear RGB.
 */
export function teeth(line, mouth, skin, colours, detail = 1) {
  const t = mouth.teeth
  const shades = {
    root: mix(colours.teeth, colours.tusk, 0.7),
    tip: mix(colours.teeth, [1, 1, 1], 0.5),
  }
  const rake = (deg, down) => {
    const r = THREE.MathUtils.degToRad(deg)
    return new THREE.Vector3(0, down ? -Math.cos(r) : Math.cos(r), -Math.sin(r))
  }
  const pieces = []
  const place = (x, upper, length) => {
    const lip = lipAt(line, x)
    const base = lip.point
      .clone()
      .addScaledVector(lip.normal, -t.row.insetM)
      .add(new THREE.Vector3(0, upper ? t.rootM : -t.rootM, 0))
    const tooth = bladeTooth(base, rake(t.row.rakeDeg, upper), t.row, length, shades, detail)
    pieces.push(paint(tooth.geometry, upper ? skin.upper : skin.lower, tooth.colourAt))
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < t.upperPerSide; k++) {
      const u = (k + 0.5) / t.upperPerSide
      place(side * mouth.halfWidth * (0.05 + 0.7 * u), true, t.row.length * (1.15 - 0.55 * u))
    }
    for (let k = 0; k < t.lowerPerSide; k++) {
      const u = (k + 1) / (t.lowerPerSide + 0.5)
      place(side * mouth.halfWidth * (0.05 + 0.7 * u), false, t.row.length * (1 - 0.5 * u))
    }
  }
  return pieces
}

/**
 * The tusks' centre lines, cast on the intact snout before the lips are cut.
 * The upper pair hangs from the upper lip down over the closed lower lip and
 * chin; the lower pair rises from the lower lip over the upper lip. Each is
 * half sunk into its own lip at the root, then rides just off the skin and
 * curls away from it towards the tip, so the tusks show with the mouth shut
 * and hang free when it opens.
 */
export function tuskPaths(cast, mouth, detail = 1) {
  const t = mouth.teeth.tusks
  const samples = Math.max(10, Math.round(22 * detail))
  const paths = []
  for (const side of [-1, 1]) {
    for (const upper of [true, false]) {
      const spec = upper ? t.upper : t.lower
      const x0 = side * mouth.halfWidth * spec.at
      const direction = upper ? -1 : 1
      const points = []
      let last = null
      for (let i = 0; i <= samples; i++) {
        const s = i / samples
        const x = x0 * (1 + 0.14 * s)
        const y = lipYAt(x0, mouth) + direction * (spec.length * s - spec.radius * 0.5)
        const hit = cast([x, y, 5], [0, 0, -1]) ?? last
        if (!hit) throw new Error(`No skin under the tusk at x ${x.toFixed(3)}`)
        last = hit
        const r = spec.radius * (1 - s) ** 0.7
        const lift = spec.clearanceM + r * smooth(0, 0.3, s) + spec.curl * spec.length * s * s
        points.push(hit.point.clone().addScaledVector(hit.normal, lift))
      }
      paths.push({ upper, x: x0, points, spec })
    }
  }
  return paths
}

/**
 * The tusks along their paths: round, tapering to a sharp point, with growth
 * rings over their first two thirds; ivory at the root, white at the tip, the
 * grooves a shade darker. Upper tusks follow the upper lip, lower ones the jaw.
 */
export function tusks(paths, mouth, skin, colours, detail = 1) {
  const rings = mouth.teeth.tusks.rings
  const fade = (s) => 1 - smooth(0.5, 0.75, s)
  const ridge = (s) => Math.max(0, Math.cos(Math.PI * 2 * rings * s)) ** 2 * fade(s)
  const white = mix(colours.teeth, [1, 1, 1], 0.55)
  return paths.map(({ upper, points, spec }) => {
    const { geometry, along } = sweep(
      points,
      (s) => spec.radius * (1 - s) ** 0.7 * (1 + 0.07 * ridge(s)),
      Math.max(9, Math.round(18 * detail)),
      new THREE.Vector3(1, 0, 0),
    )
    const colourAt = (i) => {
      const s = along[i]
      const base = mix(colours.tusk, white, smooth(0.15, 1, s))
      return mix(base, colours.tusk, 0.35 * (1 - ridge(s)) * fade(s))
    }
    return paint(geometry, upper ? skin.upper : skin.lower, colourAt)
  })
}

/**
 * The gums the teeth grow from: a soft ridge along each lip, just inside it,
 * tapering towards the corners. They belong to the mouth, hidden when it is shut.
 */
export function gums(line, mouth, skin, colour, detail = 1) {
  const g = mouth.teeth.gums
  const steps = Math.max(14, Math.round(36 * detail))
  const reach = 0.8 * mouth.halfWidth
  return [true, false].map((upper) => {
    const path = Array.from({ length: steps + 1 }, (_, i) => {
      const x = -reach + (2 * reach * i) / steps
      const lip = lipAt(line, x)
      return lip.point
        .clone()
        .addScaledVector(lip.normal, -g.insetM)
        .add(new THREE.Vector3(0, upper ? mouth.teeth.rootM : -mouth.teeth.rootM, 0))
    })
    const { geometry } = sweep(
      path,
      (s) => g.radiusM * (0.3 + 0.7 * Math.sin(Math.PI * s) ** 0.5),
      Math.max(6, Math.round(9 * detail)),
      new THREE.Vector3(0, 1, 0),
      g.depth,
    )
    return paint(geometry, upper ? skin.upper : skin.lower, colour)
  })
}
