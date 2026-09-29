import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import { BITE, crossedBiteCues, sampleBite, sampleChannel, SNAP_S } from './bite'
import { createSample, POSE_KEYS, REST, restSample } from './pose'

const at = (t: number) => sampleBite(t, createSample())

describe('the bite', () => {
  it('lasts as long as the contract says', () => {
    expect(BITE.durationS).toBe(character.interaction.bite.durationS)
    for (const channel of Object.values(BITE.channels)) {
      expect(channel!.at(-1)![0]).toBeLessThanOrEqual(BITE.durationS)
    }
  })

  it('starts and ends at rest', () => {
    for (const t of [0, BITE.durationS]) {
      const sample = at(t)
      for (const key of POSE_KEYS) expect(sample[key], `${key} at ${t}`).toBeCloseTo(REST[key], 6)
    }
  })

  it('only jumps while the screen is black', () => {
    const range = Object.fromEntries(
      POSE_KEYS.map((key) => {
        const values = (BITE.channels[key] ?? [[0, REST[key]]]).map(([, v]) => v)
        return [key, Math.max(...values) - Math.min(...values) || 1]
      }),
    )
    let previous = at(0)
    for (let t = 0.005; t <= BITE.durationS; t += 0.005) {
      const sample = at(t)
      for (const key of POSE_KEYS) {
        const jump = Math.abs(sample[key] - previous[key]) / range[key]!
        if (jump > 0.25)
          expect(sample.iris, `${key} jumps at ${t.toFixed(3)}`).toBeGreaterThan(0.999)
      }
      previous = { ...sample }
    }
  })

  it('snaps at full size with the jaw wide open, before the iris hides it', () => {
    const before = at(SNAP_S - 0.04)
    expect(before.scale).toBeGreaterThan(4.9)
    expect(before.jaw).toBeCloseTo(1, 3)
    expect(before.expression).toBe('roar')
    expect(at(SNAP_S).iris).toBeLessThan(0.3)
    expect(at(SNAP_S + 0.05).jaw).toBe(0)
    expect(at(SNAP_S).shake).toBe(1)
  })

  it('is back at normal size, smug, when the iris opens', () => {
    const back = at(2.6)
    expect(back.scale).toBe(1)
    expect(back.iris).toBeLessThan(0.7)
    expect(back.expression).toBe('happy')
    expect(back.gaze).toBe('camera')
  })

  it('fires each cue once over a run of frames', () => {
    const fired: string[] = []
    let t = 0
    while (t < BITE.durationS) {
      const next = t + 1 / 60
      for (const cue of crossedBiteCues(t, next))
        fired.push(cue.kind === 'sound' ? cue.sound : cue.kind)
      t = next
    }
    expect(fired).toEqual(['growl', 'whoosh', 'snap'])
  })

  it('eases between keys and holds the ends', () => {
    const channel = [
      [1, 0],
      [2, 10],
    ] as const
    expect(sampleChannel(channel, 0)).toBe(0)
    expect(sampleChannel(channel, 1.5)).toBeCloseTo(5, 6)
    expect(sampleChannel(channel, 3)).toBe(10)
  })

  it('returns to the hero shot at rest', () => {
    const sample = restSample(at(1.5))
    for (const key of POSE_KEYS) expect(sample[key]).toBe(REST[key])
    expect(sample.biteS).toBeNull()
    expect(sample.expression).toBeNull()
  })
})
