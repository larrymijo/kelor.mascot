import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import { bootTimings, initialBootState, stepBoot, type BootInput, type BootState } from './boot'

const timings = bootTimings(character)
const input = (elapsedS: number, modelReady = true, reducedMotion = false): BootInput => ({
  elapsedS,
  modelReady,
  reducedMotion,
})

/** Run the machine at 60 fps and return the state at `untilS`. */
function simulate(untilS: number, readyAtS: number, reducedMotion = false) {
  let state: BootState = initialBootState
  const phases: string[] = []
  for (let t = 0; t <= untilS + 1e-9; t += 1 / 60) {
    state = stepBoot(state, input(t, t >= readyAtS, reducedMotion), timings)
    if (phases.at(-1) !== state.phase) phases.push(state.phase)
  }
  return { state, phases }
}

describe('boot sequence', () => {
  it('reads its timings from the contract', () => {
    expect(timings).toEqual({ minDisplayS: 1.8, hatchDurationS: 1.2 })
  })

  it('keeps the egg for the minimum time even when the model is instant', () => {
    expect(stepBoot(initialBootState, input(1), timings)).toBe(initialBootState)
    expect(stepBoot(initialBootState, input(timings.minDisplayS), timings).phase).toBe('hatching')
  })

  it('keeps the egg while the model is still loading', () => {
    expect(stepBoot(initialBootState, input(10, false), timings)).toBe(initialBootState)
  })

  it('goes egg, hatching, ready in order and reports hatch progress', () => {
    const hatching = stepBoot(initialBootState, input(3), timings)
    expect(hatching).toMatchObject({ phase: 'hatching', hatchStartedAtS: 3, hatchProgress: 0 })

    const halfway = stepBoot(hatching, input(3 + timings.hatchDurationS / 2), timings)
    expect(halfway.hatchProgress).toBeCloseTo(0.5)

    const done = stepBoot(halfway, input(3 + timings.hatchDurationS), timings)
    expect(done).toMatchObject({ phase: 'ready', hatchProgress: 1 })
    expect(stepBoot(done, input(100), timings)).toBe(done)
  })

  it('simulates a slow network without flicker', () => {
    const { state, phases } = simulate(10, 4.5)
    expect(phases).toEqual(['egg', 'hatching', 'ready'])
    expect(state.hatchStartedAtS).toBeGreaterThanOrEqual(4.5)
  })

  it('cuts straight to ready with reduced motion', () => {
    const { phases } = simulate(5, 0.2, true)
    expect(phases).toEqual(['egg', 'ready'])
  })
})
