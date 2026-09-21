/**
 * Contract features built procedurally for any body: eyeballs, upper
 * eyelids, catchlights and hexagonal dorsal plates, plus the planar UV
 * projection of the face shell into the expression atlas. Shared by the
 * placeholder and the real model.
 */
import * as THREE from 'three'

/** Eye construction, relative to the eye bone (the eyeball centre). */
export const EYE = {
  radius: 0.085,
  lidRadius: 0.092,
  lidCapDeg: 115,
  irisRatio: 0.42,
  pupilRatio: 0.3,
}

/** Segment count scaled by tier detail, never below `min`. */
export const seg = (n, detail, min = 6) => Math.max(min, Math.round(n * detail))

/**
 * Planar front projection into atlas cell [0, 0] (glTF UV, origin top-left).
 * @param {{ xMin: number, xMax: number, yMin: number, yMax: number }} patch front-projected bounds
 */
export function projectFaceUvs(geometry, patch, cellSize = 0.5) {
  const p = geometry.attributes.position
  const uv = geometry.attributes.uv
  const { xMin, xMax, yMin, yMax } = patch
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

/**
 * One hexagonal dorsal plate standing on the back.
 * @param {{ at: number[], size: number, tiltDeg: number }} plate position, radius and tilt about X
 */
export function plate({ at, size, tiltDeg }) {
  const g = new THREE.CylinderGeometry(size, size, 0.022, 6, 1, false)
  g.rotateZ(Math.PI / 2)
  g.rotateX(THREE.MathUtils.degToRad(tiltDeg))
  g.translate(...at)
  return g
}
