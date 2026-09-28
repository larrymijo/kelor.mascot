/**
 * Sample the scroll script at a progress value. Pure and allocation-free when
 * given an output object, so the 3D side calls it every frame.
 *
 * Between two keys a channel eases with smoothstep, so each shot settles
 * before the next one starts and nothing jumps. The reduced-motion script
 * samples its still-shot channels as steps instead: those changes are cuts,
 * hidden behind its dip to black.
 */
import { clamp, lerp, smoothstep } from '@/lib/math/damp'
import {
  ACTS,
  DESKTOP,
  mobileScript,
  REDUCED_MOTION,
  STEPPED,
  type ActId,
  type Channel,
  type ChannelSet,
  type Cue,
  type Expression,
  type Gaze,
  type Script,
} from './acts'

export type Variant = 'desktop' | 'mobile' | 'reduced'

export type Sample = { [K in keyof ChannelSet]: number } & {
  act: ActId
  /** Expression the script imposes here, or null to let the director choose. */
  expression: Expression | null
  /** Attention the script imposes here, or null to let the director choose. */
  gaze: Gaze | null
}

const MOBILE = mobileScript(DESKTOP)

export function scriptFor(variant: Variant): Script {
  if (variant === 'reduced') return REDUCED_MOTION
  return variant === 'mobile' ? MOBILE : DESKTOP
}

/** Eased value of a channel at `p`; `stepped` holds each key until the next. */
export function sampleChannel(channel: Channel, p: number, stepped = false) {
  const first = channel[0]!
  if (p <= first[0] || channel.length === 1) return first[1]
  for (let i = 1; i < channel.length; i++) {
    const b = channel[i]!
    if (p < b[0]) {
      const a = channel[i - 1]!
      if (stepped) return a[1]
      return lerp(a[1], b[1], smoothstep(a[0], b[0], p))
    }
  }
  return channel[channel.length - 1]![1]
}

export function actAt(p: number): ActId {
  const q = clamp(p, 0, 1)
  for (const act of ACTS) if (q < act.to) return act.id
  return ACTS[ACTS.length - 1]!.id
}

function spanAt<T>(spans: readonly { from: number; to: number; value: T }[], p: number) {
  for (const span of spans) if (p >= span.from && p < span.to) return span.value
  return null
}

const KEYS = Object.keys(DESKTOP.channels) as (keyof ChannelSet)[]

export function createSample(): Sample {
  const sample = { act: 'hero', expression: null, gaze: null } as Sample
  for (const key of KEYS) sample[key] = 0
  return sample
}

/** Fill `out` with every channel of the variant's script at progress `p`. */
export function sampleTimeline(p: number, variant: Variant, out: Sample = createSample()) {
  const script = scriptFor(variant)
  const q = clamp(p, 0, 1)
  const reduced = variant === 'reduced'
  for (const key of KEYS) {
    out[key] = sampleChannel(script.channels[key], q, reduced && STEPPED.has(key))
  }
  out.act = actAt(q)
  out.expression = spanAt(script.expressions, q)
  out.gaze = spanAt(script.gaze, q)
  return out
}

/**
 * Cues crossed while scrolling forwards from `from` to `to`. Scrolling back
 * fires nothing, and crossing a cue again later fires it again, so the wave
 * replays when the visitor returns to the finale.
 */
export function crossedCues(from: number, to: number, variant: Variant): readonly Cue[] {
  if (to <= from) return []
  return scriptFor(variant).cues.filter((cue) => cue.at > from && cue.at <= to)
}
