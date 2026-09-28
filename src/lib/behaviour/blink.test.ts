import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import { seededRandom } from '@/lib/math/random'
import { blinkSoon, closureAt, createBlink, DOUBLE_BLINK_GAP_S, stepBlink } from './blink'

const settings = character.gaze.blink

/** Run the scheduler at a fixed frame rate and record every blink start. */
function simulate(seconds: number, fps: number, seed = 7) {
  const random = seededRandom(seed)
  const state = createBlink(0, settings, random)
  const starts: number[] = []
  let peak = 0
  let lastStart = -Infinity
  for (let frame = 0; frame <= seconds * fps; frame++) {
    const closure = stepBlink(state, frame / fps, settings, random)
    peak = Math.max(peak, closure)
    if (state.startedAtS !== -Infinity && state.startedAtS !== lastStart) {
      lastStart = state.startedAtS
      starts.push(state.startedAtS)
    }
  }
  return { starts, peak }
}

describe('closureAt', () => {
  it('shuts completely, stays within 0 and 1, and is open before and after', () => {
    const d = settings.durationS
    expect(closureAt(-0.01, d)).toBe(0)
    expect(closureAt(d, d)).toBe(0)
    let max = 0
    for (let t = 0; t < d; t += d / 200) {
      const c = closureAt(t, d)
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
      max = Math.max(max, c)
    }
    expect(max).toBeCloseTo(1, 2)
  })

  it('closes faster than it opens', () => {
    const d = settings.durationS
    // A quarter into the blink the lid is further along than a quarter before the end.
    expect(closureAt(d * 0.25, d)).toBeGreaterThan(closureAt(d * 0.75, d))
  })
})

describe('stepBlink', () => {
  it('spaces single blinks by the contract interval and sometimes doubles them', () => {
    const { starts } = simulate(600, 60)
    const gaps = starts.slice(1).map((s, i) => s - starts[i]!)
    const doubles = gaps.filter((g) => g < 0.5)
    const singles = gaps.filter((g) => g >= 0.5)
    const [min, max] = settings.intervalS
    for (const g of singles) {
      expect(g).toBeGreaterThanOrEqual(min + settings.durationS - 1e-9)
      expect(g).toBeLessThan(max + settings.durationS + 1e-9)
    }
    for (const g of doubles) expect(g).toBeCloseTo(settings.durationS + DOUBLE_BLINK_GAP_S, 6)
    // About 15% of blinks come as a pair; the seeded run lands close to it.
    const rate = doubles.length / singles.length
    expect(rate).toBeGreaterThan(0.08)
    expect(rate).toBeLessThan(0.25)
  })

  it('schedules the same blinks at 30 and 144 fps', () => {
    const slow = simulate(120, 30).starts
    const fast = simulate(120, 144).starts
    expect(slow.length).toBe(fast.length)
    slow.forEach((s, i) => expect(s).toBeCloseTo(fast[i]!, 9))
  })

  it('closes the lids fully at some point', () => {
    expect(simulate(20, 240).peak).toBeGreaterThan(0.95)
  })

  it('blinks on request without waiting for the interval', () => {
    const random = seededRandom(1)
    const state = createBlink(0, settings, random)
    blinkSoon(state, 0.5)
    stepBlink(state, 0.5, settings, random)
    expect(state.startedAtS).toBe(0.5)
  })
})
