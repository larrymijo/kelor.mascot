/**
 * What the stage shows each frame, as plain numbers every part of the scene
 * reads (docs/interaction-script.md): the camera's orbit, Kelo's scale and
 * turn, the screen-space layers, the lights and the effects. At rest it is
 * the hero shot; the bite (bite.ts) animates it over time.
 *
 * Camera: an orbit around a target. Azimuth 0 is in front of Kelo (+Z),
 * positive towards his left (+X); distance is a multiple of the hero framing
 * that frameSubject computes for the screen, so the same numbers work on any
 * aspect ratio.
 */

export type Expression = 'neutral' | 'happy' | 'surprised' | 'roar'

export interface Pose {
  azimuthDeg: number
  elevationDeg: number
  /** Multiple of the hero framing distance. */
  distance: number
  /** Orbit target height, metres at scale 1. */
  targetY: number
  /** 0 aims at targetY; 1 aims at the mouth of the scaled Kelo. */
  mouthFocus: number
  fovDeg: number
  /** Uniform scale of Kelo. */
  scale: number
  /** Body turn about +Y; 22° is his resting three-quarter pose. */
  bodyYawDeg: number
  /** 0 open, 1 closed to black around the mouth. */
  iris: number
  /** Height of each letterbox bar, share of the viewport. */
  letterbox: number
  vignette: number
  /** Multiplier on the plates' resting glow. */
  plateGlow: number
  /** 0 drifting, 1 swirling into the mouth. */
  particleSwirl: number
  /** How far the jaw opens, 0 to 1 of character.json jaw.maxOpenDeg. */
  jaw: number
  /** Opacity of the words and controls around him. */
  text: number
  /** Multiplier on the warm key light. */
  keyLight: number
  /** Multiplier on the purple rim light. */
  rimLight: number
  /** Camera shake, 0 to 1. */
  shake: number
}

/** The hero shot, where he lives between bites. */
export const REST: Readonly<Pose> = {
  azimuthDeg: 0,
  elevationDeg: 7,
  distance: 1,
  targetY: 0.55,
  mouthFocus: 0,
  fovDeg: 30,
  scale: 1,
  bodyYawDeg: 22,
  iris: 0,
  letterbox: 0,
  vignette: 0.6,
  plateGlow: 1,
  particleSwirl: 0,
  jaw: 0,
  text: 1,
  keyLight: 1,
  rimLight: 1,
  shake: 0,
}

export const POSE_KEYS = Object.keys(REST) as (keyof Pose)[]

/**
 * Where Kelo's mouth sits, at scale 1, measured by the phase 3 landmarks:
 * the bite's camera closes on this point as he grows.
 */
export const MOUTH = { y: 0.8, z: 0.36 } as const

export type Sample = Pose & {
  /** Expression the bite imposes, or null to let the director choose. */
  expression: Expression | null
  /** The bite keeps his eyes on the viewer. */
  gaze: 'camera' | null
  /** Seconds into the bite, or null at rest. */
  biteS: number | null
}

export function createSample(): Sample {
  return { ...REST, expression: null, gaze: null, biteS: null }
}

/** Back to the hero shot. Mutates and returns `out`. */
export function restSample(out: Sample): Sample {
  for (const key of POSE_KEYS) out[key] = REST[key]
  out.expression = null
  out.gaze = null
  out.biteS = null
  return out
}
