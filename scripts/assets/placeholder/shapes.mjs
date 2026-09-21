/**
 * Procedural geometry for the placeholder mascot, built with three.js in
 * Node. Every shape is closed and rounded (character bible). Each part says
 * which bones may deform it; build-placeholder.mjs turns that into weights.
 *
 * Sizes follow character.json: 1.2 m tall, origin between the feet, facing +Z.
 */
import * as THREE from 'three'

/** Front-projected area of the face shell, shared with the atlas painter. */
export const FACE_PATCH = { xMin: -0.175, xMax: 0.175, yMin: 0.78, yMax: 0.97 }

/** Snout volume; the face shell sits on its front. */
const SNOUT = { center: [0, 0.88, 0.22], radii: [0.17, 0.11, 0.12] }

/** Eye construction, relative to the eye bone (the eyeball centre). */
export const EYE = { radius: 0.085, lidRadius: 0.092, lidCapDeg: 115, irisRatio: 0.42, pupilRatio: 0.3 }

const seg = (n, detail, min = 6) => Math.max(min, Math.round(n * detail))

function ellipsoid(center, radii, w, h) {
  const g = new THREE.SphereGeometry(1, w, h)
  g.scale(...radii)
  g.translate(...center)
  return g
}

/**
 * A tube along a smooth curve whose radius changes along its length, with a
 * sphere closing each end. Used for tail, shins and arms.
 */
export function taperedTube(points, radii, radialSegments, tubularSegments) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
  const frames = curve.computeFrenetFrames(tubularSegments, false)
  const radiusAt = (t) => {
    const x = t * (radii.length - 1)
    const i = Math.min(radii.length - 2, Math.floor(x))
    return radii[i] + (radii[i + 1] - radii[i]) * (x - i)
  }

  const positions = []
  const normals = []
  const uvs = []
  const indices = []
  const dir = new THREE.Vector3()
  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments
    const centre = curve.getPointAt(t)
    const r = radiusAt(t)
    for (let j = 0; j <= radialSegments; j++) {
      const a = (j / radialSegments) * Math.PI * 2
      dir
        .copy(frames.normals[i])
        .multiplyScalar(Math.cos(a))
        .addScaledVector(frames.binormals[i], Math.sin(a))
        .normalize()
      positions.push(centre.x + dir.x * r, centre.y + dir.y * r, centre.z + dir.z * r)
      normals.push(dir.x, dir.y, dir.z)
      uvs.push(j / radialSegments, t)
    }
  }
  const row = radialSegments + 1
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * row + j
      const b = (i + 1) * row + j
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const tube = new THREE.BufferGeometry()
  tube.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  tube.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  tube.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  tube.setIndex(indices)

  const start = curve.getPointAt(0)
  const end = curve.getPointAt(1)
  const capSegments = Math.max(8, Math.round(radialSegments * 0.75))
  return [
    tube,
    ellipsoid(start.toArray(), [radii[0], radii[0], radii[0]], radialSegments, capSegments),
    ellipsoid(end.toArray(), Array(3).fill(radii.at(-1)), radialSegments, capSegments),
  ]
}

/**
 * Body parts. `bones` lists the bones allowed to influence the part;
 * `belly` marks parts that get the lighter belly tone.
 * @param {number} detail 1 for the full tier, about 0.5 for lite
 */
export function bodyParts(detail) {
  const s = (n) => seg(n, detail)
  const parts = [
    { name: 'head', bones: ['head', 'neck_02'], belly: false, geometries: [ellipsoid([0, 0.93, 0.06], [0.28, 0.25, 0.25], s(40), s(28))] },
    { name: 'snout', bones: ['head'], belly: true, geometries: [ellipsoid(SNOUT.center, SNOUT.radii, s(32), s(20))] },
    { name: 'neck', bones: ['chest', 'neck_01', 'neck_02', 'head'], belly: false, geometries: [ellipsoid([0, 0.7, 0.02], [0.13, 0.1, 0.12], s(24), s(14))] },
    { name: 'torso', bones: ['hips', 'spine_01', 'spine_02', 'chest'], belly: true, geometries: [ellipsoid([0, 0.46, 0], [0.24, 0.26, 0.22], s(40), s(28))] },
    {
      name: 'tail',
      bones: ['hips', 'tail_01', 'tail_02', 'tail_03', 'tail_04'],
      belly: false,
      geometries: taperedTube(
        [[0, 0.4, -0.1], [0, 0.36, -0.2], [0, 0.3, -0.3], [0, 0.24, -0.41], [0, 0.19, -0.5], [0, 0.155, -0.58]],
        [0.14, 0.115, 0.09, 0.065, 0.045, 0.025],
        s(20),
        s(28),
      ),
    },
  ]
  for (const [side, x] of [['L', 1], ['R', -1]]) {
    parts.push(
      { name: `thigh_${side}`, bones: ['hips', `thigh_${side}`, `shin_${side}`], belly: false, geometries: [ellipsoid([0.12 * x, 0.25, 0.02], [0.11, 0.13, 0.12], s(24), s(16))] },
      {
        name: `shin_${side}`,
        bones: [`thigh_${side}`, `shin_${side}`, `foot_${side}`],
        belly: false,
        geometries: taperedTube([[0.115 * x, 0.2, 0.03], [0.115 * x, 0.13, 0.035], [0.115 * x, 0.07, 0.04]], [0.085, 0.08, 0.075], s(16), s(6)),
      },
      { name: `foot_${side}`, bones: [`shin_${side}`, `foot_${side}`], belly: false, geometries: [ellipsoid([0.115 * x, 0.045, 0.07], [0.085, 0.045, 0.12], s(24), s(14))] },
      {
        name: `arm_${side}`,
        bones: ['chest', `upperarm_${side}`, `forearm_${side}`, `hand_${side}`],
        belly: false,
        geometries: taperedTube([[0.16 * x, 0.585, 0.06], [0.195 * x, 0.52, 0.12], [0.215 * x, 0.47, 0.16]], [0.052, 0.046, 0.04], s(14), s(10)),
      },
      { name: `hand_${side}`, bones: [`forearm_${side}`, `hand_${side}`], belly: false, geometries: [ellipsoid([0.222 * x, 0.455, 0.172], [0.05, 0.045, 0.05], s(16), s(12))] },
    )
  }
  return parts
}

/** Front patch of the snout, slightly inflated, carrying the expression atlas. */
export function faceShell(detail) {
  const inflate = 1.015
  const g = new THREE.SphereGeometry(
    1,
    seg(28, detail),
    seg(18, detail),
    Math.PI / 2 - THREE.MathUtils.degToRad(72),
    THREE.MathUtils.degToRad(144),
    THREE.MathUtils.degToRad(48),
    THREE.MathUtils.degToRad(92),
  )
  g.scale(...SNOUT.radii.map((r) => r * inflate))
  g.translate(...SNOUT.center)
  return g
}

/** Planar front projection into atlas cell [0, 0] (glTF UV, origin top-left). */
export function projectFaceUvs(geometry, cellSize = 0.5) {
  const p = geometry.attributes.position
  const uv = geometry.attributes.uv
  const { xMin, xMax, yMin, yMax } = FACE_PATCH
  for (let i = 0; i < p.count; i++) {
    const u = (p.getX(i) - xMin) / (xMax - xMin)
    const v = (yMax - p.getY(i)) / (yMax - yMin)
    uv.setXY(i, Math.min(1, Math.max(0, u)) * cellSize, Math.min(1, Math.max(0, v)) * cellSize)
  }
}

/** One eyeball centred on its bone, with a front projection for the iris. */
export function eyeball(center, detail) {
  const g = new THREE.SphereGeometry(EYE.radius, seg(32, detail), seg(24, detail))
  const p = g.attributes.position
  const uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) {
    uv.setXY(i, 0.5 + p.getX(i) / (2 * EYE.radius), 0.5 - p.getY(i) / (2 * EYE.radius))
  }
  g.translate(...center)
  return g
}

/**
 * Upper eyelid: a spherical cap tilted back so the bind pose is open. A
 * positive rotation of gaze.blink.closedAngleDeg about local +X closes it.
 */
export function eyelid(center, openTiltDeg, detail) {
  const g = new THREE.SphereGeometry(
    EYE.lidRadius,
    seg(28, detail),
    seg(16, detail),
    0,
    Math.PI * 2,
    0,
    THREE.MathUtils.degToRad(EYE.lidCapDeg),
  )
  g.rotateX(-THREE.MathUtils.degToRad(openTiltDeg))
  g.translate(...center)
  return g
}

/** Catchlights: a main and a small secondary disc on the viewer's upper left. */
export function highlights(center, detail) {
  const onSurface = (dx, dy) => Math.sqrt(EYE.radius ** 2 - dx ** 2 - dy ** 2) + 0.004
  const disc = (dx, dy, r) => {
    const g = new THREE.CircleGeometry(r, seg(16, detail, 8))
    g.translate(center[0] + dx, center[1] + dy, center[2] + onSurface(dx, dy))
    return g
  }
  return [disc(-0.028, 0.03, 0.019), disc(0.02, -0.024, 0.008)]
}

/** Hexagonal dorsal plates: position, size, tilt about X and the bone they follow. */
export const PLATES = [
  { at: [0, 0.8, -0.155], size: 0.06, tiltDeg: -55, bone: 'neck_02' },
  { at: [0, 0.665, -0.16], size: 0.075, tiltDeg: -45, bone: 'chest' },
  { at: [0, 0.545, -0.225], size: 0.082, tiltDeg: -70, bone: 'spine_02' },
  { at: [0, 0.42, -0.255], size: 0.075, tiltDeg: -80, bone: 'spine_01' },
  { at: [0, 0.4, -0.3], size: 0.06, tiltDeg: -15, bone: 'tail_02' },
  { at: [0, 0.315, -0.41], size: 0.046, tiltDeg: -12, bone: 'tail_03' },
  { at: [0, 0.245, -0.5], size: 0.034, tiltDeg: -10, bone: 'tail_04' },
]

export function plate({ at, size, tiltDeg }) {
  const g = new THREE.CylinderGeometry(size, size, 0.022, 6, 1, false)
  g.rotateZ(Math.PI / 2)
  g.rotateX(THREE.MathUtils.degToRad(tiltDeg))
  g.translate(...at)
  return g
}
