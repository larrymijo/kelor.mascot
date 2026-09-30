import { describe, expect, it } from 'vitest'
import { OBSTACLES, PLAYER } from './runner'
import { bug, bugPair, cloud, kelo, moth, PALETTE, pixelText } from './sprites'

describe('Kelo Run sprites', () => {
  it('draws Kelo in every frame, outlined, within his hitbox and palette', () => {
    for (const frame of ['runA', 'runB', 'jump', 'hurt'] as const) {
      const sprite = kelo(frame)
      expect(sprite.pixels.length).toBe(sprite.width * sprite.height)
      // The hitbox is a little smaller than the sprite: collisions forgive the outline.
      expect(sprite.width).toBeGreaterThanOrEqual(PLAYER.width)
      expect(sprite.height).toBeGreaterThanOrEqual(PLAYER.height)
      expect(Math.max(...sprite.pixels)).toBeLessThan(PALETTE.length)
      const counts = new Map<number, number>()
      for (const c of sprite.pixels) counts.set(c, (counts.get(c) ?? 0) + 1)
      // Mostly purple, with an outline, a belly, an eye and a pupil.
      for (const index of [1, 2, 5, 6, 7]) expect(counts.get(index) ?? 0).toBeGreaterThan(0)
    }
    // The run frames differ in the legs only.
    const a = kelo('runA').pixels
    const b = kelo('runB').pixels
    const width = kelo('runA').width
    const changed = [...a.keys()].filter((i) => a[i] !== b[i])
    expect(changed.length).toBeGreaterThan(0)
    expect(changed.every((i) => Math.floor(i / width) >= 14)).toBe(true)
  })

  it('draws the obstacles at their hitbox sizes', () => {
    for (const frame of ['a', 'b'] as const) {
      const one = bug(frame)
      expect([one.width, one.height]).toEqual([OBSTACLES.bug.width, OBSTACLES.bug.height])
      const big = bug(frame, OBSTACLES.bigBug.width, OBSTACLES.bigBug.height)
      expect([big.width, big.height]).toEqual([OBSTACLES.bigBug.width, OBSTACLES.bigBug.height])
      const pair = bugPair(frame)
      expect([pair.width, pair.height]).toEqual([OBSTACLES.bugPair.width, OBSTACLES.bugPair.height])
      const flyer = moth(frame)
      expect([flyer.width, flyer.height]).toEqual([OBSTACLES.moth.width, OBSTACLES.moth.height])
    }
    expect(cloud().pixels.some((c) => c > 0)).toBe(true)
  })

  it('writes the score in 3 x 5 pixel digits with a gap', () => {
    const one = pixelText('1')
    expect(one.every(([x, y]) => x < 3 && y < 5)).toBe(true)
    const wide = pixelText('HI 00120')
    expect(Math.max(...wide.map(([x]) => x))).toBeLessThan(8 * 4)
    expect(pixelText('8').length).toBe(13)
  })
})
