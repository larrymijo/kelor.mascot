import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import { createTail, stepSpring, stepTail } from './tail'

const settings = character.life.tail

/** Turn the hips at 2 rad/s for half a second, then hold still, at a given frame rate. */
function swing(fps: number, seconds = 3) {
  const tail = createTail(settings.bones.length)
  const trace: number[] = []
  const dt = 1 / fps
  for (let t = 0; t < seconds; t += dt) {
    const yawRate = t < 0.5 ? 2 : 0
    stepTail(tail, yawRate, 0, settings, dt)
    trace.push(tail.at(-1)!.yaw.angle)
  }
  return { tail, trace }
}

describe('stepSpring', () => {
  it('settles on its target without exploding, even with a long frame', () => {
    const spring = { angle: 0, velocity: 0 }
    for (let i = 0; i < 20; i++)
      stepSpring(spring, 1, settings.frequency, settings.dampingRatio, 0.25)
    expect(spring.angle).toBeCloseTo(1, 3)
    expect(Number.isFinite(spring.velocity)).toBe(true)
  })
})

describe('stepTail', () => {
  it('trails the hips: turning towards +yaw swings the tail the other way', () => {
    const tail = createTail(settings.bones.length)
    for (let i = 0; i < 20; i++) stepTail(tail, 2, 0, settings, 1 / 60)
    for (const link of tail) expect(link.yaw.angle).toBeLessThan(0)
  })

  it('drops when the hips rise, as in the hop', () => {
    const tail = createTail(settings.bones.length)
    for (let i = 0; i < 20; i++) stepTail(tail, 0, 1.5, settings, 1 / 60)
    for (const link of tail) expect(link.pitch.angle).toBeLessThan(0)
  })

  it('moves the tip more than the base', () => {
    const tail = createTail(settings.bones.length)
    for (let i = 0; i < 20; i++) stepTail(tail, 2, 0, settings, 1 / 60)
    expect(Math.abs(tail.at(-1)!.yaw.angle)).toBeGreaterThan(Math.abs(tail[0]!.yaw.angle))
  })

  it('never exceeds the contract limit', () => {
    const tail = createTail(settings.bones.length)
    for (let i = 0; i < 200; i++) stepTail(tail, 50, 50, settings, 1 / 60)
    const max = (settings.maxAngleDeg * Math.PI) / 180
    for (const link of tail) {
      expect(Math.abs(link.yaw.angle)).toBeLessThanOrEqual(max + 1e-12)
      expect(Math.abs(link.pitch.angle)).toBeLessThanOrEqual(max + 1e-12)
    }
  })

  it('is stable and settles back to rest at 30, 60 and 144 fps, in step with each other', () => {
    const results = [30, 60, 144].map((fps) => swing(fps))
    for (const { tail } of results) {
      for (const link of tail) expect(Math.abs(link.yaw.angle)).toBeLessThan(0.002)
    }
    // Peak swing agrees across frame rates within a few per cent.
    const peaks = results.map(({ trace }) => Math.min(...trace))
    expect(peaks[0]!).toBeCloseTo(peaks[2]!, 1)
    expect(Math.abs(peaks[0]! - peaks[2]!) / Math.abs(peaks[2]!)).toBeLessThan(0.05)
  })
})
