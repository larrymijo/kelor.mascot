import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import {
  beforeHatch,
  bootTimings,
  initialBootState,
  stepBoot,
  type BootInput,
  type BootState,
} from './boot'

const timings = bootTimings(character)
const input = (
  elapsedS: number,
  modelReady = true,
  reducedMotion = false,
  dropRequested = true,
): BootInput => ({ elapsedS, modelReady, reducedMotion, dropRequested })

/** The egg as dropped at `atS`. */
const dropped = (atS: number): BootState => stepBoot(initialBootState, input(atS), timings)

/** Run the machine at 60 fps and return the state at `untilS`. */
function simulate(untilS: number, readyAtS: number, dropAtS: number, reducedMotion = false) {
  let state: BootState = initialBootState
  const phases: string[] = [state.phase]
  for (let t = 0; t <= untilS + 1e-9; t += 1 / 60) {
    state = stepBoot(state, input(t, t >= readyAtS, reducedMotion, t >= dropAtS), timings)
    if (phases.at(-1) !== state.phase) phases.push(state.phase)
  }
  return { state, phases }
}

describe('boot sequence', () => {
  it('reads its timings from the contract', () => {
    expect(timings).toEqual({ minDisplayS: 2.4, hatchDurationS: 1.2 })
  })

  it('waits on the empty stage until the visitor drops the egg, however long the model is ready', () => {
    const waiting = stepBoot(initialBootState, input(60, true, false, false), timings)
    expect(waiting).toBe(initialBootState)
    expect(beforeHatch(waiting.phase)).toBe(true)
    expect(dropped(3)).toMatchObject({ phase: 'egg', droppedAtS: 3 })
  })

  it('keeps the egg for the minimum time after the drop, even when the model is instant', () => {
    const egg = dropped(5)
    expect(stepBoot(egg, input(5 + timings.minDisplayS - 0.1), timings)).toBe(egg)
    expect(stepBoot(egg, input(5 + timings.minDisplayS), timings).phase).toBe('hatching')
  })

  it('keeps the egg while the model is still loading', () => {
    const egg = dropped(0)
    expect(stepBoot(egg, input(10, false), timings)).toBe(egg)
  })

  it('goes egg, hatching, ready in order and reports hatch progress', () => {
    const hatching = stepBoot(dropped(0), input(3), timings)
    expect(hatching).toMatchObject({ phase: 'hatching', hatchStartedAtS: 3, hatchProgress: 0 })

    const halfway = stepBoot(hatching, input(3 + timings.hatchDurationS / 2), timings)
    expect(halfway.hatchProgress).toBeCloseTo(0.5)
    expect(beforeHatch(halfway.phase)).toBe(false)

    const done = stepBoot(halfway, input(3 + timings.hatchDurationS), timings)
    expect(done).toMatchObject({ phase: 'ready', hatchProgress: 1 })
    expect(stepBoot(done, input(100), timings)).toBe(done)
  })

  it('simulates a slow network without flicker', () => {
    const { state, phases } = simulate(12, 6, 1)
    expect(phases).toEqual(['waiting', 'egg', 'hatching', 'ready'])
    expect(state.hatchStartedAtS).toBeGreaterThanOrEqual(6)
  })

  it('cuts straight to ready with reduced motion', () => {
    const { phases } = simulate(8, 0.2, 1, true)
    expect(phases).toEqual(['waiting', 'egg', 'ready'])
  })
})
