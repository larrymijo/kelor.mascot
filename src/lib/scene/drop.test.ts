import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import { createDrop, stepDrop } from './drop'

const settings = character.egg.drop

describe('the egg drop', () => {
  it('falls, lands with a squash, bounces lower each time and settles on the floor', () => {
    const drop = createDrop(3)
    let lowest = Infinity
    let peakAfterFirst = 0
    let firstLanding = 0
    let squashed = 0
    for (let t = 0; t < 3; t += 1 / 60) {
      stepDrop(drop, 1 / 60, settings)
      lowest = Math.min(lowest, drop.y)
      squashed = Math.max(squashed, drop.squash)
      if (drop.landed && !firstLanding) {
        firstLanding = drop.landed
        drop.landed = 0
      }
      if (firstLanding && drop.bounces === 1) peakAfterFirst = Math.max(peakAfterFirst, drop.y)
    }
    expect(lowest).toBeGreaterThanOrEqual(0)
    expect(drop.settled).toBe(true)
    expect(drop.y).toBe(0)
    expect(drop.bounces).toBeGreaterThanOrEqual(1)
    expect(drop.bounces).toBeLessThanOrEqual(3)
    // A 3 m fall hits at about sqrt(2gh), and the first bounce rises far less.
    expect(firstLanding).toBeCloseTo(Math.sqrt(2 * settings.gravity * 3), 0)
    expect(peakAfterFirst).toBeLessThan(3 * settings.restitution)
    expect(squashed).toBeGreaterThan(0.05)
    expect(squashed).toBeLessThanOrEqual(settings.maxSquash + 0.05)
    // And the squash springs back to round.
    expect(Math.abs(drop.squash)).toBeLessThan(0.01)
  })

  it('moves the same at 30, 60 and 144 frames a second', () => {
    const at = (fps: number) => {
      const drop = createDrop(2)
      for (let i = 0; i < Math.round(0.4 * fps); i++) stepDrop(drop, 1 / fps, settings)
      return drop.y
    }
    expect(at(30)).toBeCloseTo(at(60), 2)
    expect(at(144)).toBeCloseTo(at(60), 2)
  })
})
