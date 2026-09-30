import { describe, expect, it } from 'vitest'
import {
  createRunner,
  GROUND_Y,
  OBSTACLES,
  PLAYER,
  press,
  release,
  stepRunner,
  type RunnerState,
} from './runner'

/** A seeded random source, so every run is the same. */
function seeded(seed = 7) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const STEP = 1 / 120
/** Steps the game for up to the given seconds, stopping at a crash. */
function run(state: RunnerState, seconds: number, random = seeded()) {
  const events: string[] = []
  const running = state.phase === 'running'
  for (let t = 0; t < seconds; t += STEP) {
    events.push(...stepRunner(state, STEP, random))
    if (running && state.phase === 'over') break
  }
  return events
}

describe('Kelo Run', () => {
  it('waits on the title screen until the first press, which starts the run with a jump', () => {
    const state = createRunner(42)
    expect(run(state, 1)).toEqual([])
    expect(state.phase).toBe('ready')
    expect(press(state)).toEqual(['jump'])
    expect(state.phase).toBe('running')
    expect(state.best).toBe(42)
  })

  it('jumps only from the ground, lands back on it, and cuts the jump short on release', () => {
    const state = createRunner()
    press(state)
    const random = seeded()
    for (let i = 0; i < 12; i++) stepRunner(state, STEP, random)
    expect(state.grounded).toBe(false)
    expect(press(state)).toEqual([])
    run(state, 1.2, random)
    expect(state.grounded).toBe(true)
    expect(state.y).toBe(GROUND_Y - PLAYER.height)

    // A tap-and-release hop peaks lower than a held jump.
    const peak = (hold: boolean) => {
      const s = createRunner()
      press(s)
      if (!hold) {
        stepRunner(s, STEP, random)
        release(s)
      }
      let top = s.y
      for (let i = 0; i < 120; i++) {
        stepRunner(s, STEP, () => 0.99)
        top = Math.min(top, s.y)
      }
      return GROUND_Y - PLAYER.height - top
    }
    expect(peak(false)).toBeLessThan(peak(true) * 0.6)
    expect(peak(true)).toBeGreaterThan(OBSTACLES.bigBug.height + 20)
  })

  it('speeds up, scores and chimes every hundred points, until a bug ends the run', () => {
    const state = createRunner()
    press(state)
    const events = run(state, 60)
    // Never jumping again, he runs into the first bug.
    expect(state.phase).toBe('over')
    expect(events.at(-1)).toBe('crash')
    expect(state.best).toBe(Math.floor(state.score))

    const survivor = createRunner()
    press(survivor)
    const random = seeded(3)
    const chimes: string[] = []
    // An autopilot that jumps whenever a ground bug is close: a long run.
    for (let t = 0; t < 40 && survivor.phase === 'running'; t += STEP) {
      const ahead = survivor.obstacles.find(
        (o) => o.kind !== 'moth' && o.x > PLAYER.x && o.x - PLAYER.x < survivor.speed * 0.28,
      )
      if (ahead && survivor.grounded) press(survivor)
      if (!ahead) release(survivor)
      chimes.push(...stepRunner(survivor, STEP, random).filter((e) => e === 'point'))
    }
    expect(survivor.speed).toBeGreaterThan(95)
    expect(chimes.length).toBe(Math.floor(survivor.score / 100))
  })

  it('always leaves room to land between two obstacles', () => {
    const state = createRunner()
    press(state)
    state.score = 1000
    const random = seeded(11)
    for (let t = 0; t < 30; t += STEP) {
      stepRunner(state, STEP, random)
      state.phase = 'running'
      const sorted = [...state.obstacles].sort((a, b) => a.x - b.x)
      for (let i = 1; i < sorted.length; i++) {
        const previous = sorted[i - 1]!
        const gap = sorted[i]!.x - (previous.x + OBSTACLES[previous.kind].width)
        expect(gap).toBeGreaterThan(state.speed * 0.5)
      }
    }
  })

  it('flies moths just above his head: harmless standing, deadly in a jump', () => {
    const moth = {
      kind: 'moth' as const,
      x: PLAYER.x,
      y: GROUND_Y - OBSTACLES.moth.height - OBSTACLES.moth.lift,
    }
    const standing = createRunner()
    press(standing)
    run(standing, 1.5, () => 0.99)
    standing.obstacles = [moth]
    standing.untilNext = 1e6
    stepRunner(standing, STEP, () => 0.99)
    expect(standing.phase).toBe('running')

    const jumping = createRunner()
    press(jumping)
    // Three steps into the jump his head is at the moth's height.
    for (let i = 0; i < 3; i++) stepRunner(jumping, STEP, () => 0.99)
    jumping.obstacles = [{ ...moth }]
    jumping.untilNext = 1e6
    for (let i = 0; i < 20 && jumping.phase === 'running'; i++)
      stepRunner(jumping, STEP, () => 0.99)
    expect(jumping.phase).toBe('over')
  })

  it('ignores presses right after a crash, then restarts keeping the record', () => {
    const state = createRunner()
    press(state)
    run(state, 60)
    expect(state.phase).toBe('over')
    const record = state.best
    expect(press(state)).toEqual([])
    expect(state.phase).toBe('over')
    run(state, 0.5)
    press(state)
    expect(state.phase).toBe('running')
    expect(state.score).toBe(0)
    expect(state.obstacles).toEqual([])
    expect(state.best).toBe(record)
  })
})
