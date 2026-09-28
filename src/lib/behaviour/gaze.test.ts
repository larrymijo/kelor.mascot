import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import { degToRad } from '@/lib/math/damp'
import { aimAngles, chainShares, clampAngles, dampAngles, softClamp, type Angles } from './gaze'

const angles = (): Angles => ({ yaw: 0, pitch: 0 })
const deg = (radians: number) => (radians * 180) / Math.PI

describe('aimAngles', () => {
  it('reads straight ahead as zero', () => {
    expect(aimAngles(0, 0, 1, angles())).toEqual({ yaw: 0, pitch: 0 })
  })

  it('turns towards +X with positive yaw and looks up with positive pitch', () => {
    expect(deg(aimAngles(1, 0, 1, angles()).yaw)).toBeCloseTo(45)
    expect(deg(aimAngles(-1, 0, 1, angles()).yaw)).toBeCloseTo(-45)
    expect(deg(aimAngles(0, 1, 1, angles()).pitch)).toBeCloseTo(45)
    expect(deg(aimAngles(0, -1, 1, angles()).pitch)).toBeCloseTo(-45)
  })

  it('does not depend on the length of the direction', () => {
    const a = aimAngles(0.3, 0.2, 1, angles())
    const b = aimAngles(3, 2, 10, angles())
    expect(a.yaw).toBeCloseTo(b.yaw)
    expect(a.pitch).toBeCloseTo(b.pitch)
  })
})

describe('softClamp', () => {
  const max = degToRad(40)

  it('never exceeds the limit, however far the target', () => {
    for (const value of [0.5, 1, 3, 100]) {
      expect(Math.abs(softClamp(value, max))).toBeLessThanOrEqual(max)
      expect(Math.abs(softClamp(-value, max))).toBeLessThanOrEqual(max)
    }
  })

  it('is nearly linear for small angles and keeps the sign', () => {
    expect(softClamp(degToRad(5), max)).toBeCloseTo(degToRad(5), 2)
    expect(softClamp(-degToRad(5), max)).toBeCloseTo(-degToRad(5), 2)
  })

  it('never decreases, so the head never jumps back', () => {
    let previous = -Infinity
    for (let v = -3; v <= 3; v += 0.01) {
      const next = softClamp(v, max)
      expect(next).toBeGreaterThanOrEqual(previous)
      previous = next
    }
  })

  it('applies the contract limits per axis', () => {
    const { maxYawDeg, maxPitchDeg } = character.gaze.headChain
    const out = clampAngles(
      { yaw: 10, pitch: -10 },
      degToRad(maxYawDeg),
      degToRad(maxPitchDeg),
      angles(),
    )
    expect(deg(out.yaw)).toBeLessThanOrEqual(maxYawDeg + 1e-9)
    expect(deg(out.pitch)).toBeGreaterThanOrEqual(-maxPitchDeg - 1e-9)
  })
})

describe('dampAngles', () => {
  it('is frame-rate independent: two half steps equal one full step', () => {
    const target = { yaw: 0.6, pitch: -0.3 }
    const once = dampAngles(angles(), target, character.gaze.headChain.lambda, 1 / 30)
    const twice = dampAngles(
      dampAngles(angles(), target, character.gaze.headChain.lambda, 1 / 60),
      target,
      character.gaze.headChain.lambda,
      1 / 60,
    )
    expect(twice.yaw).toBeCloseTo(once.yaw, 10)
    expect(twice.pitch).toBeCloseTo(once.pitch, 10)
  })

  it('makes the eyes lead the head', () => {
    const target = { yaw: 0.5, pitch: 0 }
    const eyes = dampAngles(angles(), target, character.gaze.eyes.lambda, 0.1)
    const head = dampAngles(angles(), target, character.gaze.headChain.lambda, 0.1)
    expect(eyes.yaw).toBeGreaterThan(head.yaw)
  })
})

describe('chainShares', () => {
  it('reads the contract head chain and sums to one', () => {
    const shares = chainShares(character.gaze.headChain.links)
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
    expect(shares).toHaveLength(3)
  })

  it('rejects shares that do not add up', () => {
    expect(() => chainShares([{ share: 0.5 }, { share: 0.4 }])).toThrow(/0.9/)
  })
})
