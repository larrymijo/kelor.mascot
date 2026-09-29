/**
 * The full-screen bite (docs/interaction-script.md), played on desktop on
 * the tap numbered character.json interaction.taps.biteAt. Keyed in seconds:
 *
 *   0.0–0.5  anticipation: he crouches, turns to you and growls, jaw ajar;
 *   0.5–1.45 the lunge: he grows to five times his size, the camera drops
 *            under his snout and widens, the jaw opens wide, motes swirl in;
 *   1.45–1.6 a tremble with the jaw at its widest, then the snap: the jaw
 *            slams shut, the camera shakes, light flashes on the teeth;
 *   1.5–2.25 the iris closes on his mouth to black; he is reset while dark;
 *   2.25–3.4 the iris opens on him back at his normal size, smug.
 *
 * Between two keys a channel eases with smoothstep, so every move settles.
 * The only jumps happen while the screen is black.
 */
import { lerp, smoothstep } from '@/lib/math/damp'
import { REST, POSE_KEYS, type Expression, type Pose, type Sample } from './pose'

export type Key = readonly [seconds: number, value: number]
export type Channel = readonly Key[]

export type BiteCue =
  { at: number; kind: 'snap' } | { at: number; kind: 'sound'; sound: 'growl' | 'whoosh' }

export interface BiteScript {
  durationS: number
  channels: Partial<Record<keyof Pose, Channel>>
  expressions: readonly { from: number; to: number; value: Expression }[]
  cues: readonly BiteCue[]
}

/** When the jaw slams shut. */
export const SNAP_S = 1.58
/** When he is put back at his normal size, hidden by the closed iris. */
const RESET_S = 2.0
const JUST_AFTER = RESET_S + 0.01

export const BITE: BiteScript = {
  durationS: 3.4,
  channels: {
    scale: [
      [0, 1],
      [0.5, 0.96],
      [1.45, 5],
      [RESET_S, 5],
      [JUST_AFTER, 1],
    ],
    bodyYawDeg: [
      [0, 22],
      [0.45, 0],
      [2.6, 0],
      [3.4, 22],
    ],
    distance: [
      [0, 1],
      [0.5, 1.06],
      [1.45, 0.2],
      [1.72, 0.08],
      [RESET_S, 0.08],
      [JUST_AFTER, 1],
    ],
    mouthFocus: [
      [0, 0],
      [0.5, 0.2],
      [1.1, 1],
      [RESET_S, 1],
      [JUST_AFTER, 0],
    ],
    elevationDeg: [
      [0, 7],
      [0.5, 9],
      [1.35, -8],
      [RESET_S, -8],
      [JUST_AFTER, 7],
    ],
    fovDeg: [
      [0, 30],
      [0.5, 29],
      [1.45, 34],
      [1.72, 36],
      [RESET_S, 36],
      [JUST_AFTER, 30],
    ],
    jaw: [
      [0, 0],
      [0.25, 0.18],
      [0.5, 0.25],
      [1.25, 1],
      [SNAP_S - 0.03, 1],
      [SNAP_S + 0.02, 0],
    ],
    iris: [
      [0, 0],
      [1.52, 0],
      [1.78, 1],
      [2.25, 1],
      [2.85, 0],
    ],
    letterbox: [
      [0, 0],
      [0.5, 0.05],
      [1.45, 0.11],
      [2.25, 0.11],
      [3.1, 0],
    ],
    vignette: [
      [0, 0.6],
      [1.45, 0.85],
      [2.25, 0.85],
      [3.1, 0.6],
    ],
    plateGlow: [
      [0, 1],
      [1.25, 2.4],
      [SNAP_S, 3.2],
      [RESET_S, 1.2],
      [3.4, 1],
    ],
    particleSwirl: [
      [0, 0],
      [0.5, 0],
      [1.5, 1],
      [RESET_S, 1],
      [JUST_AFTER, 0],
    ],
    text: [
      [0, 1],
      [0.35, 0],
      [2.9, 0],
      [3.4, 1],
    ],
    keyLight: [
      [0, 1],
      [0.5, 0.85],
      [1.45, 0.8],
      [SNAP_S, 1.8],
      [1.7, 1],
      [3.4, 1],
    ],
    rimLight: [
      [0, 1],
      [1.25, 1.9],
      [RESET_S, 1.9],
      [JUST_AFTER, 1],
      [3.4, 1],
    ],
    shake: [
      [0, 0],
      [0.5, 0.05],
      [1.25, 0.2],
      [SNAP_S - 0.03, 0.35],
      [SNAP_S, 1],
      [1.9, 0],
    ],
  },
  expressions: [
    { from: 0.15, to: 1.9, value: 'roar' },
    { from: 2.2, to: 3.4, value: 'happy' },
  ],
  cues: [
    { at: 0.12, kind: 'sound', sound: 'growl' },
    { at: 0.6, kind: 'sound', sound: 'whoosh' },
    { at: SNAP_S, kind: 'snap' },
  ],
}

/** Eased value of a channel at `t` seconds. */
export function sampleChannel(channel: Channel, t: number) {
  const first = channel[0]!
  if (t <= first[0] || channel.length === 1) return first[1]
  for (let i = 1; i < channel.length; i++) {
    const b = channel[i]!
    if (t < b[0]) {
      const a = channel[i - 1]!
      return lerp(a[1], b[1], smoothstep(a[0], b[0], t))
    }
  }
  return channel[channel.length - 1]![1]
}

/** Fill `out` with the bite at `t` seconds; channels it does not key stay at rest. */
export function sampleBite(t: number, out: Sample, script: BiteScript = BITE): Sample {
  for (const key of POSE_KEYS) {
    const channel = script.channels[key]
    out[key] = channel ? sampleChannel(channel, t) : REST[key]
  }
  out.expression = script.expressions.find((s) => t >= s.from && t < s.to)?.value ?? null
  out.gaze = 'camera'
  out.biteS = t
  return out
}

/** Cues crossed going from `from` to `to` seconds into the bite. */
export function crossedBiteCues(from: number, to: number, script: BiteScript = BITE) {
  return script.cues.filter((cue) => cue.at > from && cue.at <= to)
}
