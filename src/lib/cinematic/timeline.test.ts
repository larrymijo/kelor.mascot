import { describe, expect, it } from 'vitest'
import { ACTS, DESKTOP, REDUCED_MOTION, STEPPED, type ChannelSet } from './acts'
import {
  actAt,
  crossedCues,
  sampleChannel,
  sampleTimeline,
  scriptFor,
  type Variant,
} from './timeline'

const KEYS = Object.keys(DESKTOP.channels) as (keyof ChannelSet)[]
const steps = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n)

describe('acts', () => {
  it('cover progress 0 to 1 with contiguous ranges that never overlap', () => {
    expect(ACTS[0]!.from).toBe(0)
    expect(ACTS.at(-1)!.to).toBe(1)
    ACTS.slice(1).forEach((act, i) => expect(act.from).toBe(ACTS[i]!.to))
    for (const act of ACTS) expect(act.to).toBeGreaterThan(act.from)
  })

  it('name the act at every progress', () => {
    expect(actAt(0)).toBe('hero')
    expect(actAt(0.15)).toBe('gulp')
    expect(actAt(0.42)).toBe('meet')
    expect(actAt(0.61)).toBe('detail')
    expect(actAt(0.95)).toBe('finale')
    expect(actAt(1)).toBe('finale')
  })

  it('keep every channel keyed in increasing order', () => {
    for (const variant of ['desktop', 'mobile', 'reduced'] as Variant[]) {
      for (const key of KEYS) {
        const channel = scriptFor(variant).channels[key]
        channel
          .slice(1)
          .forEach(([at], i) => expect(at, `${variant} ${key}`).toBeGreaterThan(channel[i]![0]))
      }
    }
  })
})

describe('sampleChannel', () => {
  it('eases between keys and holds outside them', () => {
    const channel = [
      [0.2, 0],
      [0.4, 10],
    ] as const
    expect(sampleChannel(channel, 0)).toBe(0)
    expect(sampleChannel(channel, 0.3)).toBeCloseTo(5)
    expect(sampleChannel(channel, 0.25)).toBeLessThan(2.5) // eased, slow start
    expect(sampleChannel(channel, 1)).toBe(10)
  })

  it('steps when asked', () => {
    const channel = [
      [0, 1],
      [0.5, 2],
    ] as const
    expect(sampleChannel(channel, 0.49, true)).toBe(1)
    expect(sampleChannel(channel, 0.5, true)).toBe(2)
  })
})

describe('sampleTimeline', () => {
  it('never jumps on desktop or mobile: every channel is continuous', () => {
    for (const variant of ['desktop', 'mobile'] as Variant[]) {
      for (const key of KEYS) {
        const values = scriptFor(variant).channels[key].map(([, v]) => v)
        // An eased move peaks at 1.5 times its average speed, far below 2% of a
        // channel's range per 1/2000 step; a real jump moves a whole key gap at once.
        const limit = Math.max(1e-3, 0.02 * (Math.max(...values) - Math.min(...values)))
        // Sample the channel alone: running the whole timeline 4,000 times per channel is slow.
        const channel = scriptFor(variant).channels[key]
        let previous = sampleChannel(channel, 0)
        for (const p of steps(2000).slice(1)) {
          const value = sampleChannel(channel, p)
          expect(Math.abs(value - previous), `${variant} ${key} at ${p}`).toBeLessThan(limit)
          previous = value
        }
      }
    }
  }, 20_000)

  it('keeps Kelo at normal size and still with reduced motion', () => {
    const stills = new Set(REDUCED_MOTION.channels.azimuthDeg.map(([, v]) => v))
    for (const p of steps(500)) {
      const sample = sampleTimeline(p, 'reduced')
      expect(sample.scale).toBe(1)
      expect(sample.iris).toBe(0)
      expect(sample.aberration).toBe(0)
      expect(sample.particleSwirl).toBe(0)
      // No orbit: the camera only ever sits at one of the still shots.
      expect(stills.has(sample.azimuthDeg)).toBe(true)
    }
    expect(STEPPED.has('azimuthDeg')).toBe(true)
  })

  it('opens the iris fully outside the gulp and closes it at the swallow', () => {
    for (const p of steps(500)) {
      if (p < 0.16 || p >= 0.28) expect(sampleTimeline(p, 'desktop').iris).toBe(0)
    }
    expect(sampleTimeline(0.22, 'desktop').iris).toBe(1)
  })

  it('grows Kelo during the gulp and shrinks him back by the meet', () => {
    expect(sampleTimeline(0.2, 'desktop').scale).toBe(5)
    expect(sampleTimeline(0.32, 'desktop').scale).toBe(1)
    expect(sampleTimeline(0.2, 'desktop').expression).toBe('roar')
    expect(sampleTimeline(0.3, 'desktop').expression).toBeNull()
  })

  it('shows the words only in their acts', () => {
    expect(sampleTimeline(0.42, 'desktop').meetText).toBe(1)
    expect(sampleTimeline(0.2, 'desktop').meetText).toBe(0)
    expect(sampleTimeline(0.95, 'desktop').contactText).toBe(1)
    expect(sampleTimeline(0.6, 'desktop').contactText).toBe(0)
  })

  it('gives phones thinner bars and no lens shift', () => {
    const desktop = sampleTimeline(0.16, 'desktop')
    const mobile = sampleTimeline(0.16, 'mobile')
    expect(mobile.letterbox).toBeCloseTo(0.04)
    expect(desktop.letterbox).toBeCloseTo(0.11)
    expect(sampleTimeline(0.42, 'mobile').shiftX).toBe(0)
    expect(sampleTimeline(0.42, 'desktop').shiftX).toBeGreaterThan(0)
  })

  it('writes into the object it is given, without allocating', () => {
    const out = sampleTimeline(0.1, 'desktop')
    expect(sampleTimeline(0.5, 'desktop', out)).toBe(out)
  })
})

describe('crossedCues', () => {
  it('fires a cue once when scrolling forwards across it, and never backwards', () => {
    expect(crossedCues(0.85, 0.9, 'desktop').map((c) => c.kind)).toEqual(['clip'])
    expect(crossedCues(0.9, 0.95, 'desktop')).toEqual([])
    expect(crossedCues(0.9, 0.85, 'desktop')).toEqual([])
    // Returning to the finale later fires the wave again.
    expect(crossedCues(0.87, 0.89, 'desktop')).toHaveLength(1)
  })

  it('keeps blinks but drops the wave with reduced motion', () => {
    expect(crossedCues(0, 1, 'reduced').map((c) => c.kind)).toEqual(['blink', 'blink'])
  })
})
