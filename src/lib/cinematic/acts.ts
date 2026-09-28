/**
 * The scroll script (docs/scroll-script.md) as data. Every channel is a list
 * of keys, [progress, value], sampled by timeline.ts with an eased blend
 * between neighbouring keys, so each shot settles before the next begins.
 * Change the doc first, then these numbers.
 *
 * Camera: an orbit around a target. Azimuth 0 is in front of Kelo (+Z),
 * positive towards his left (+X); distance is a multiple of the hero
 * framing that frameSubject computes for the screen, so the same numbers
 * work on any aspect ratio.
 */

export type ActId = 'hero' | 'gulp' | 'meet' | 'detail' | 'finale'
export type Key = readonly [progress: number, value: number]
export type Channel = readonly Key[]
export type Expression = 'neutral' | 'happy' | 'surprised' | 'roar'
export type Gaze = 'camera' | 'pointer' | 'cta' | 'off'

export const ACTS: readonly { id: ActId; from: number; to: number }[] = [
  { id: 'hero', from: 0, to: 0.04 },
  { id: 'gulp', from: 0.04, to: 0.32 },
  { id: 'meet', from: 0.32, to: 0.55 },
  { id: 'detail', from: 0.55, to: 0.8 },
  { id: 'finale', from: 0.8, to: 1 },
]

/**
 * Where Kelo's mouth sits, at scale 1, measured by the phase 3 landmarks:
 * the gulp's camera closes on this point as he grows.
 */
export const MOUTH = { y: 0.8, z: 0.36 } as const

export interface ChannelSet {
  azimuthDeg: Channel
  elevationDeg: Channel
  /** Multiple of the hero framing distance. */
  distance: Channel
  /** Orbit target height, metres at scale 1. */
  targetY: Channel
  /** 0 aims at targetY; 1 aims at the mouth of the scaled Kelo. */
  mouthFocus: Channel
  /** Lens shift, share of the screen width; pushes Kelo aside for the words. */
  shiftX: Channel
  fovDeg: Channel
  /** Uniform scale of Kelo. */
  scale: Channel
  /** Body turn about +Y; 22° is his resting three-quarter pose. */
  bodyYawDeg: Channel
  /** 0 open, 1 closed to black around the mouth. */
  iris: Channel
  /** Height of each letterbox bar, share of the viewport. */
  letterbox: Channel
  vignette: Channel
  aberration: Channel
  /** Multiplier on the plates' resting glow. */
  plateGlow: Channel
  /** Depth of field strength, 0 to 1. */
  dof: Channel
  /** 0 focuses on the eyes, 1 on the plates. */
  dofTarget: Channel
  /** 0 drifting, 1 swirling into the mouth. */
  particleSwirl: Channel
  /** 0 scattered, 1 the KELOR mark locked together. */
  logo: Channel
  /** Opacity of the "Conoce a Kelo" words. */
  meetText: Channel
  /** Opacity of the tiny contact line. */
  contactText: Channel
  /** A dip to black used for cuts. */
  fade: Channel
  /** Multiplier on the warm key light. */
  keyLight: Channel
  /** Multiplier on the purple rim light. */
  rimLight: Channel
}

export interface Span<T> {
  from: number
  to: number
  value: T
}

/** One-shot moments, fired when scrolling forwards across them. */
export type Cue = { at: number; kind: 'blink' } | { at: number; kind: 'clip'; clip: 'wave' }

export interface Script {
  channels: ChannelSet
  expressions: readonly Span<Expression>[]
  gaze: readonly Span<Gaze>[]
  cues: readonly Cue[]
}

const HOLD = (value: number): Channel => [[0, value]]

const SHARED = {
  expressions: [{ from: 0.1, to: 0.24, value: 'roar' }] as const,
  gaze: [
    { from: 0.04, to: 0.32, value: 'camera' },
    { from: 0.32, to: 0.55, value: 'camera' },
    { from: 0.55, to: 0.67, value: 'camera' },
    { from: 0.67, to: 0.8, value: 'off' },
  ] as const,
  cues: [
    { at: 0.3, kind: 'blink' },
    { at: 0.62, kind: 'blink' },
    { at: 0.88, kind: 'clip', clip: 'wave' },
  ] as const,
}

/** The full cinematic, for fine pointers and motion. */
export const DESKTOP: Script = {
  ...SHARED,
  channels: {
    // Hold in front through the gulp, orbit once while meeting him, then the close-ups
    // (eyes at 370 = 10 degrees, plates at 510 = 150) and back to a front-left finale.
    azimuthDeg: [
      [0, 0],
      [0.33, 0],
      [0.53, 360],
      [0.59, 370],
      [0.65, 370],
      [0.71, 510],
      [0.79, 510],
      [0.85, 380],
      [1, 380],
    ],
    elevationDeg: [
      [0, 7],
      [0.04, 7],
      [0.15, 4],
      [0.28, 4],
      [0.33, 10],
      [0.53, 10],
      [0.59, 4],
      [0.65, 4],
      [0.71, 18],
      [0.79, 18],
      [0.85, -6],
      [1, -6],
    ],
    distance: [
      [0, 1],
      [0.04, 1],
      [0.16, 0.2],
      [0.2, 0.08],
      [0.24, 0.08],
      [0.31, 1],
      [0.33, 1.05],
      [0.53, 1.05],
      [0.59, 0.3],
      [0.65, 0.3],
      [0.71, 0.45],
      [0.79, 0.45],
      [0.85, 1.05],
      [1, 1.05],
    ],
    targetY: [
      [0, 0.55],
      [0.33, 0.55],
      [0.53, 0.55],
      [0.59, 0.98],
      [0.65, 0.98],
      [0.71, 0.62],
      [0.79, 0.62],
      [0.85, 0.6],
      [1, 0.6],
    ],
    mouthFocus: [
      [0, 0],
      [0.04, 0],
      [0.09, 1],
      [0.24, 1],
      [0.31, 0],
    ],
    shiftX: [
      [0, 0],
      [0.32, 0],
      [0.37, 0.16],
      [0.5, 0.16],
      [0.55, 0],
    ],
    fovDeg: [
      [0, 30],
      [0.53, 30],
      [0.59, 26],
      [0.79, 26],
      [0.85, 30],
    ],
    scale: [
      [0, 1],
      [0.04, 1],
      [0.16, 5],
      [0.24, 5],
      [0.31, 1],
    ],
    bodyYawDeg: [
      [0, 22],
      [0.04, 22],
      [0.12, 0],
      [0.26, 0],
      [0.32, 22],
    ],
    iris: [
      [0, 0],
      [0.16, 0],
      [0.2, 1],
      [0.24, 1],
      [0.28, 0],
    ],
    letterbox: [
      [0, 0],
      [0.04, 0.07],
      [0.16, 0.11],
      [0.28, 0.07],
      [0.8, 0.07],
      [0.9, 0],
    ],
    vignette: [
      [0, 0.6],
      [0.04, 0.6],
      [0.16, 0.8],
      [0.28, 0.6],
      [0.8, 0.6],
      [0.9, 0.5],
    ],
    aberration: [
      [0, 0],
      [0.04, 0],
      [0.16, 1],
      [0.2, 0.4],
      [0.28, 0],
    ],
    plateGlow: [
      [0, 1],
      [0.04, 1],
      [0.16, 2],
      [0.28, 1.4],
      [0.55, 1.4],
      [0.65, 1.4],
      [0.71, 2],
      [0.79, 2],
      [0.85, 1.2],
      [1, 1.2],
    ],
    dof: [
      [0, 0],
      [0.54, 0],
      [0.59, 1],
      [0.79, 1],
      [0.84, 0],
    ],
    dofTarget: [
      [0, 0],
      [0.65, 0],
      [0.71, 1],
      [1, 1],
    ],
    particleSwirl: [
      [0, 0],
      [0.04, 0],
      [0.16, 1],
      [0.24, 1],
      [0.3, 0],
    ],
    logo: [
      [0, 0],
      [0.82, 0],
      [0.9, 1],
    ],
    meetText: [
      [0, 0],
      [0.35, 0],
      [0.39, 1],
      [0.48, 1],
      [0.52, 0],
    ],
    contactText: [
      [0, 0],
      [0.85, 0],
      [0.89, 1],
    ],
    fade: HOLD(0),
    keyLight: [
      [0, 0.8],
      [0.04, 1],
      [0.16, 0.7],
      [0.28, 1],
      [0.53, 1],
      [0.59, 1.1],
      [0.79, 1.1],
      [0.85, 1.15],
      [1, 1.15],
    ],
    rimLight: [
      [0, 1],
      [0.04, 1],
      [0.16, 1.7],
      [0.28, 1.3],
      [0.53, 1.3],
      [0.59, 1],
      [0.79, 1.2],
      [0.85, 1.5],
      [1, 1.5],
    ],
  },
}

/**
 * Reduced motion: Kelo never scales or orbits, nothing swirls or shakes.
 * The acts become still shots, and each cut hides behind a short dip to
 * black instead of a camera move.
 */
const STILL_CUTS = [0.04, 0.32, 0.55, 0.67, 0.8] as const
const dip = (): Channel => [
  [0, 0],
  ...STILL_CUTS.flatMap((at): Key[] => [
    [at - 0.012, 0],
    [at, 1],
    [at + 0.012, 0],
  ]),
]
/** A still per act, switched at the cuts; timeline.ts samples these without easing. */
const stills = (values: readonly number[]): Channel => [
  [0, values[0]!],
  ...STILL_CUTS.map((at, i): Key => [at, values[i + 1]!]),
]

export const REDUCED_MOTION: Script = {
  ...SHARED,
  expressions: [],
  cues: SHARED.cues.filter((cue) => cue.kind === 'blink'),
  channels: {
    azimuthDeg: stills([0, 0, 35, 10, 150, 20]),
    elevationDeg: stills([7, 7, 10, 4, 18, -6]),
    distance: stills([1, 1, 1.05, 0.3, 0.45, 1.05]),
    targetY: stills([0.55, 0.55, 0.55, 0.98, 0.62, 0.6]),
    mouthFocus: HOLD(0),
    shiftX: stills([0, 0, 0.16, 0, 0, 0]),
    fovDeg: stills([30, 30, 30, 26, 26, 30]),
    scale: HOLD(1),
    bodyYawDeg: HOLD(22),
    iris: HOLD(0),
    letterbox: HOLD(0),
    vignette: HOLD(0.6),
    aberration: HOLD(0),
    plateGlow: stills([1, 1, 1.4, 1.4, 2, 1.2]),
    dof: stills([0, 0, 0, 1, 1, 0]),
    dofTarget: stills([0, 0, 0, 0, 1, 1]),
    particleSwirl: HOLD(0),
    logo: stills([0, 0, 0, 0, 0, 1]),
    meetText: stills([0, 0, 1, 0, 0, 0]),
    contactText: stills([0, 0, 0, 0, 0, 1]),
    fade: dip(),
    keyLight: stills([0.8, 1, 1, 1.1, 1.1, 1.15]),
    rimLight: stills([1, 1, 1.3, 1, 1.2, 1.5]),
  },
}

/** Channels sampled as steps rather than eased, in the reduced-motion script. */
export const STEPPED: ReadonlySet<keyof ChannelSet> = new Set([
  'azimuthDeg',
  'elevationDeg',
  'distance',
  'targetY',
  'shiftX',
  'fovDeg',
  'plateGlow',
  'dof',
  'dofTarget',
  'logo',
  'meetText',
  'contactText',
  'keyLight',
  'rimLight',
])

/** Phones and portrait screens: no lens shift, and bars that peak at 4% instead of 11%. */
export function mobileScript(script: Script): Script {
  const scaled = (channel: Channel, factor: number): Channel =>
    channel.map(([at, value]): Key => [at, value * factor])
  return {
    ...script,
    channels: {
      ...script.channels,
      shiftX: HOLD(0),
      letterbox: scaled(script.channels.letterbox, 4 / 11),
    },
  }
}
