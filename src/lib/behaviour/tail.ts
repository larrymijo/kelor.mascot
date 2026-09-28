/**
 * Tail inertia: one damped spring per tail link, pushed by how fast the hips
 * turn and rise. Pure and allocation-free. Springs are integrated in fixed
 * small substeps, so a phone at 30 fps and a laptop at 144 fps see the same
 * motion, and the integration stays stable at any frame time.
 */
export interface TailSettings {
  /** Natural frequency of the first link, rad/s. */
  frequency: number
  /** Damping ratio: below 1 the tail overshoots a little and settles. */
  dampingRatio: number
  /** Yaw offset per rad/s of hips yaw, in seconds of lag. */
  yawGain: number
  /** Pitch offset per m/s of hips vertical speed. */
  pitchGain: number
  /** Each link further down lags this much more (gain multiplier). */
  falloff: number
  maxAngleDeg: number
}

export interface Spring {
  angle: number
  velocity: number
}

export interface TailLink {
  yaw: Spring
  pitch: Spring
}

const MAX_SUBSTEP_S = 1 / 240

export function createTail(links: number): TailLink[] {
  return Array.from({ length: links }, () => ({
    yaw: { angle: 0, velocity: 0 },
    pitch: { angle: 0, velocity: 0 },
  }))
}

/** Semi-implicit Euler in substeps of at most 1/240 s. */
export function stepSpring(
  spring: Spring,
  target: number,
  frequency: number,
  dampingRatio: number,
  dt: number,
) {
  if (dt <= 0) return spring
  const steps = Math.max(1, Math.ceil(dt / MAX_SUBSTEP_S))
  const h = dt / steps
  const k = frequency * frequency
  const c = 2 * dampingRatio * frequency
  for (let i = 0; i < steps; i++) {
    spring.velocity += (k * (target - spring.angle) - c * spring.velocity) * h
    spring.angle += spring.velocity * h
  }
  return spring
}

/**
 * Advance every link. The tail trails the hips: turning left swings it right,
 * rising drops it. Links further down react more and slightly slower.
 */
export function stepTail(
  tail: TailLink[],
  hipsYawRate: number,
  hipsRiseSpeed: number,
  settings: TailSettings,
  dt: number,
) {
  const max = (settings.maxAngleDeg * Math.PI) / 180
  const clamp = (v: number) => Math.max(-max, Math.min(max, v))
  tail.forEach((link, i) => {
    const gain = settings.falloff ** i
    const frequency = settings.frequency / (1 + 0.15 * i)
    stepSpring(
      link.yaw,
      clamp(-hipsYawRate * settings.yawGain * gain),
      frequency,
      settings.dampingRatio,
      dt,
    )
    stepSpring(
      link.pitch,
      clamp(-hipsRiseSpeed * settings.pitchGain * gain),
      frequency,
      settings.dampingRatio,
      dt,
    )
    link.yaw.angle = clamp(link.yaw.angle)
    link.pitch.angle = clamp(link.pitch.angle)
  })
  return tail
}
