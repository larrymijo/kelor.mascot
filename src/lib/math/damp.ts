/**
 * Small, allocation-free math helpers shared by the scene and, later, the
 * behaviour layer. All smoothing is frame-rate independent.
 */

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Hermite smoothstep between two edges, clamped to [0, 1]. */
export function smoothstep(edge0: number, edge1: number, x: number) {
  if (edge0 === edge1) return x < edge0 ? 0 : 1
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Fraction of the remaining distance to cover this frame: 1 - e^(-λ·dt).
 * Two frames of dt/2 cover exactly the same distance as one frame of dt.
 */
export function dampFactor(lambda: number, dt: number) {
  return 1 - Math.exp(-lambda * Math.max(0, dt))
}

/** Exponential approach of `current` towards `target` with rate λ (1/s). */
export function damp(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * dampFactor(lambda, dt)
}

export const degToRad = (degrees: number) => (degrees * Math.PI) / 180
