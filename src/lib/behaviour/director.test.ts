import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import { seededRandom } from '@/lib/math/random'
import {
  createDirector,
  directorSettings,
  LOOK_AROUND_GAZE_WEIGHT,
  stepDirector,
  type DirectorInput,
} from './director'

const settings = directorSettings(character)

const base = (patch: Partial<DirectorInput> = {}): DirectorInput => ({
  nowS: 0,
  bootPhase: 'ready',
  pointer: null,
  ctaActive: false,
  tapS: null,
  reducedMotion: false,
  touchFirst: false,
  ...patch,
})

/** Step a fresh director through a list of inputs; returns a copy of each output. */
function run(inputs: DirectorInput[], seed = 3) {
  const memory = createDirector()
  const random = seededRandom(seed)
  return inputs.map((input) => {
    const out = stepDirector(memory, input, settings, random)
    return { ...out, glance: { ...out.glance } }
  })
}

describe('director states', () => {
  it('follows the boot phases and keeps the gaze off until tracking', () => {
    const [egg, hatch, tracking] = run([
      base({ bootPhase: 'egg' }),
      base({ bootPhase: 'hatching', nowS: 1 }),
      base({ bootPhase: 'ready', nowS: 2 }),
    ])
    expect([egg!.state, hatch!.state, tracking!.state]).toEqual(['egg', 'hatch', 'tracking'])
    expect([egg!.gazeWeight, hatch!.gazeWeight, tracking!.gazeWeight]).toEqual([0, 0, 1])
    expect(hatch!.expression).toBe('surprised')
    expect(tracking!.expression).toBe('happy')
  })

  it('stays in tracking on the first screen and enters scroll past it', () => {
    const [hero, cinematic] = run([
      base({ nowS: 1 }),
      base({ nowS: 2, script: { gaze: null, expression: null } }),
    ])
    expect(hero!.state).toBe('tracking')
    expect(cinematic!.state).toBe('scroll')
  })
})

describe('attention', () => {
  const mouse = (lastActiveS: number) => ({ kind: 'mouse' as const, lastActiveS })

  it('follows an active pointer and returns to the camera after the contract delay', () => {
    const wait = settings.returnToCameraAfterS
    const [active, stale] = run([
      base({ nowS: 1, pointer: mouse(1) }),
      base({ nowS: 1 + wait + 0.01, pointer: mouse(1) }),
    ])
    expect(active!.attention).toBe('pointer')
    expect(stale!.attention).toBe('camera')
  })

  it('puts the CTA before the pointer', () => {
    const [out] = run([base({ nowS: 1, pointer: mouse(1), ctaActive: true })])
    expect(out!.attention).toBe('cta')
  })

  it('glances away now and then when idle, for the contract hold, then looks back', () => {
    const fps = 30
    const outputs = run(Array.from({ length: 60 * fps }, (_, i) => base({ nowS: i / fps })))
    const starts: number[] = []
    const lengths: number[] = []
    let current: number | null = null
    outputs.forEach((o, i) => {
      const t = i / fps
      if (o.attention === 'glance' && current === null) {
        current = t
        starts.push(t)
      }
      if (o.attention !== 'glance' && current !== null) {
        lengths.push(t - current)
        current = null
      }
    })
    expect(starts.length).toBeGreaterThan(8)
    // The first glance waits a full interval after going idle.
    expect(starts[0]!).toBeGreaterThanOrEqual(settings.lookAroundIntervalS[0] - 1 / fps)
    for (const length of lengths) expect(length).toBeCloseTo(settings.glanceHoldS, 1)
    const gaps = starts.slice(1).map((s, i) => s - starts[i]!)
    const [min, max] = settings.lookAroundIntervalS
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(min + settings.glanceHoldS - 1 / fps)
      expect(gap).toBeLessThanOrEqual(max + settings.glanceHoldS + 1 / fps)
    }
    for (const o of outputs.filter((o) => o.attention === 'glance')) {
      expect(Math.abs(o.glance.x)).toBeGreaterThanOrEqual(0.35)
      expect(Math.abs(o.glance.x)).toBeLessThanOrEqual(0.7)
    }
  })

  it('does not glance while the visitor is engaged', () => {
    const fps = 30
    const outputs = run(
      Array.from({ length: 20 * fps }, (_, i) => base({ nowS: i / fps, pointer: mouse(i / fps) })),
    )
    expect(outputs.every((o) => o.attention === 'pointer')).toBe(true)
  })
})

describe('touch and reduced motion', () => {
  it('lets look_around lead on a touch-first device left alone', () => {
    const [out] = run([base({ nowS: 5, touchFirst: true })])
    expect(out!.idleClip).toBe('look_around')
    expect(out!.attention).toBe('camera')
    expect(out!.gazeWeight).toBe(LOOK_AROUND_GAZE_WEIGHT)
  })

  it('follows the finger while it is on the screen', () => {
    const [out] = run([
      base({ nowS: 5, touchFirst: true, pointer: { kind: 'touch', lastActiveS: 4.9 } }),
    ])
    expect(out!.attention).toBe('pointer')
    expect(out!.idleClip).toBe('idle')
    expect(out!.gazeWeight).toBe(1)
  })

  it('keeps idle still with reduced motion: no glances, no look_around', () => {
    const fps = 30
    const outputs = run(
      Array.from({ length: 30 * fps }, (_, i) =>
        base({ nowS: i / fps, reducedMotion: true, touchFirst: i % 2 === 0 }),
      ),
    )
    expect(outputs.every((o) => o.attention === 'camera')).toBe(true)
    expect(outputs.every((o) => o.idleClip === 'idle')).toBe(true)
  })
})

describe('reactions', () => {
  it('hops once per tap on Kelo and looks surprised for the length of the jump', () => {
    const outputs = run([
      base({ nowS: 1, tapS: 1 }),
      base({ nowS: 1.1, tapS: 1 }),
      base({ nowS: 1 + settings.hopS + 0.01, tapS: 1 }),
    ])
    expect(outputs.map((o) => o.reaction)).toEqual(['hop', null, null])
    expect(outputs[1]!.expression).toBe('surprised')
    expect(outputs[2]!.expression).toBe('happy')
  })

  it('swallows taps made during the egg or the hatch', () => {
    const outputs = run([
      base({ bootPhase: 'egg', nowS: 0.5, tapS: 0.5 }),
      base({ bootPhase: 'hatching', nowS: 1, tapS: 0.9 }),
      base({ bootPhase: 'ready', nowS: 2, tapS: 0.9 }),
    ])
    expect(outputs.map((o) => o.reaction)).toEqual([null, null, null])
  })

  it('hops even with reduced motion, because the visitor asked for it', () => {
    const [out] = run([base({ nowS: 1, tapS: 1, reducedMotion: true })])
    expect(out!.reaction).toBe('hop')
  })
})

describe('scroll script', () => {
  const mouse = (lastActiveS: number) => ({ kind: 'mouse' as const, lastActiveS })

  it('imposes the camera and the roar face during the gulp, over an active pointer', () => {
    const [out] = run([
      base({ nowS: 3, pointer: mouse(3), script: { gaze: 'camera', expression: 'roar' } }),
    ])
    expect(out!.attention).toBe('camera')
    expect(out!.expression).toBe('roar')
    expect(out!.gazeWeight).toBe(1)
  })

  it('switches the gaze off for the plates close-up', () => {
    const [out] = run([base({ nowS: 3, script: { gaze: 'off', expression: null } })])
    expect(out!.gazeWeight).toBe(0)
    expect(out!.expression).toBe('happy')
  })

  it('lets the visitor lead in the finale and never plays look_around', () => {
    const [cta, idle] = run([
      base({
        nowS: 3,
        ctaActive: true,
        touchFirst: true,
        script: { gaze: null, expression: null },
      }),
      base({ nowS: 9, touchFirst: true, script: { gaze: null, expression: null } }),
    ])
    expect(cta!.attention).toBe('cta')
    expect(idle!.idleClip).toBe('idle')
  })
})
