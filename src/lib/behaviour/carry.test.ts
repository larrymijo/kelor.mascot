import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import {
  createBody,
  feetBounds,
  grab,
  holdAt,
  hopTo,
  release,
  stepBody,
  type Bounds,
  type CarryBody,
} from './carry'

const settings = character.interaction
const bounds: Bounds = { xMin: -1.5, xMax: 1.5, yMax: 1.2 }
const deg = (rad: number) => (rad * 180) / Math.PI

/** Run `seconds` at `fps`, calling `each(t)` before every frame. */
function run(body: CarryBody, seconds: number, fps: number, each?: (t: number) => void) {
  const dt = 1 / fps
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    each?.(t)
    stepBody(body, dt, bounds, settings)
  }
  return body
}

/** Pick him up, carry him right and up, shake him, and let go. */
function carryAndToss(fps: number) {
  const body = createBody(0)
  grab(body, 0.8)
  run(body, 1.5, fps, (t) => holdAt(body, Math.sin(t * 5) * 0.8, 1.3 + 0.2 * Math.sin(t * 3)))
  release(body, settings)
  run(body, 3, fps)
  return body
}

describe('carry', () => {
  it('follows the pointer smoothly and settles on it', () => {
    const body = createBody(0)
    grab(body, 0.8)
    holdAt(body, 1, 1.4)
    let previous = body.x
    let maxStep = 0
    run(body, 1, 60, () => {
      maxStep = Math.max(maxStep, Math.abs(body.x - previous))
      previous = body.x
    })
    expect(body.x).toBeCloseTo(1, 2)
    expect(body.y + body.grabY).toBeCloseTo(1.4, 2)
    // No teleporting: a one-metre jump of the pointer takes several frames.
    expect(maxStep).toBeLessThan(0.2)
  })

  it('swings opposite to the hand, within its limit, and settles when the hand stops', () => {
    const body = createBody(0)
    grab(body, 0.8)
    holdAt(body, 1.2, 1.2)
    let minSwing = 0
    let maxAbs = 0
    run(body, 0.4, 60, () => {
      minSwing = Math.min(minSwing, body.swing.angle)
      maxAbs = Math.max(maxAbs, Math.abs(body.swing.angle))
    })
    // Pulled towards +x, the feet lag behind towards -x.
    expect(minSwing).toBeLessThan(-0.05)
    expect(deg(maxAbs)).toBeLessThanOrEqual(settings.carry.maxSwingDeg + 1e-6)
    run(body, 6, 60)
    expect(Math.abs(deg(body.swing.angle))).toBeLessThan(1)
  })

  it('moves the same at 30, 60 and 144 fps', () => {
    const a = carryAndToss(30)
    const b = carryAndToss(60)
    const c = carryAndToss(144)
    for (const other of [b, c]) {
      expect(other.x).toBeCloseTo(a.x, 2)
      expect(other.y).toBeCloseTo(a.y, 2)
      expect(other.mode).toBe(a.mode)
    }
  })

  it('falls, bounces and comes to rest on the floor, inside the screen', () => {
    const body = carryAndToss(60)
    expect(body.mode).toBe('rest')
    expect(body.y).toBe(0)
    expect(body.x).toBeGreaterThanOrEqual(bounds.xMin)
    expect(body.x).toBeLessThanOrEqual(bounds.xMax)
  })

  it('bounces off the screen edge when tossed at it', () => {
    const body = createBody(1.2)
    grab(body, 0.8)
    run(body, 0.2, 60, () => holdAt(body, 1.2 + 0.2, 1.2))
    body.vx = 4
    release(body, settings)
    let furthest = -Infinity
    let cameBack = false
    run(body, 1, 60, () => {
      furthest = Math.max(furthest, body.x)
      if (body.vx < 0) cameBack = true
    })
    // The bounce happens between frames: he reaches the edge and heads back.
    expect(furthest).toBeGreaterThan(bounds.xMax - 0.05)
    expect(furthest).toBeLessThanOrEqual(bounds.xMax)
    expect(cameBack).toBe(true)
  })

  it('squashes on landing and springs back to shape', () => {
    const body = createBody(0)
    body.mode = 'air'
    body.y = 1
    let minSquash = 1
    let landed = 0
    run(body, 0.6, 60, () => {
      minSquash = Math.min(minSquash, body.squash.angle)
      landed = Math.max(landed, body.landed)
    })
    expect(landed).toBeGreaterThan(2)
    expect(minSquash).toBeLessThan(0.95)
    expect(minSquash).toBeGreaterThanOrEqual(settings.fall.landSquash)
    run(body, 3, 60)
    expect(body.squash.angle).toBeCloseTo(1, 2)
  })

  it('caps the speed of a toss', () => {
    const body = createBody(0)
    grab(body, 0.8)
    body.vx = 40
    release(body, settings)
    expect(Math.hypot(body.vx, body.vy)).toBeCloseTo(settings.fall.maxThrowMps, 5)
  })

  it('hops lower under a low ceiling, still landing on its spot', () => {
    const low: Bounds = { ...bounds, yMax: 0.15 }
    const body = createBody(0)
    hopTo(body, -0.8, low, settings)
    let peak = 0
    for (let t = 0; t < 2; t += 1 / 60) {
      stepBody(body, 1 / 60, low, settings)
      peak = Math.max(peak, body.y)
    }
    expect(peak).toBeLessThanOrEqual(low.yMax)
    expect(body.x).toBeCloseTo(-0.8, 1)
  })

  it('hops to a spot on the floor', () => {
    const body = createBody(0)
    hopTo(body, 0.9, bounds, settings)
    let peak = 0
    run(body, 2, 60, () => (peak = Math.max(peak, body.y)))
    expect(body.mode).toBe('rest')
    expect(body.x).toBeCloseTo(0.9, 1)
    expect(peak).toBeCloseTo(settings.hop.heightM, 1)
  })

  it('keeps his feet inside the visible stage, less his size and the margin', () => {
    const inside = feetBounds(
      { left: -2, right: 2, top: 2 },
      { halfWidthM: 0.4, heightM: 1.2 },
      0.05,
    )
    expect(inside).toEqual({ xMin: -1.55, xMax: 1.55, yMax: expect.closeTo(0.75, 6) })
    const narrow = feetBounds(
      { left: -0.3, right: 0.3, top: 1 },
      { halfWidthM: 0.4, heightM: 1.2 },
      0,
    )
    expect(narrow.xMin).toBe(0)
    expect(narrow.xMax).toBe(0)
    expect(narrow.yMax).toBe(0)
  })
})
