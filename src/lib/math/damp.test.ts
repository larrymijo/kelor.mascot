import { describe, expect, it } from 'vitest'
import { clamp, damp, dampFactor, degToRad, lerp, smoothstep } from './damp'

describe('damp', () => {
  it('is frame-rate independent', () => {
    const oneStep = damp(0, 1, 5, 1 / 30)
    const twoSteps = damp(damp(0, 1, 5, 1 / 60), 1, 5, 1 / 60)
    expect(twoSteps).toBeCloseTo(oneStep, 12)
  })

  it('does not move with a zero or negative delta', () => {
    expect(damp(0.25, 1, 5, 0)).toBe(0.25)
    expect(dampFactor(5, -1)).toBe(0)
  })

  it('converges on the target without overshooting', () => {
    let x = 0
    for (let i = 0; i < 600; i++) x = damp(x, 1, 8, 1 / 60)
    expect(x).toBeCloseTo(1, 6)
    expect(x).toBeLessThanOrEqual(1)
  })

  it('covers 63 % of the distance after one time constant', () => {
    expect(dampFactor(4, 0.25)).toBeCloseTo(1 - Math.exp(-1), 12)
  })
})

describe('helpers', () => {
  it('clamps, interpolates and converts angles', () => {
    expect(clamp(5, 0, 1)).toBe(1)
    expect(clamp(-5, 0, 1)).toBe(0)
    expect(lerp(2, 4, 0.5)).toBe(3)
    expect(degToRad(180)).toBeCloseTo(Math.PI)
  })

  it('smoothsteps with flat ends and a symmetric middle', () => {
    expect(smoothstep(0, 1, -1)).toBe(0)
    expect(smoothstep(0, 1, 2)).toBe(1)
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5)
    expect(smoothstep(1, 1, 0.5)).toBe(0)
  })
})
