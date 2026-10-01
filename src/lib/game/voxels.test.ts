import { describe, expect, it } from 'vitest'
import { kelo, type Sprite } from './sprites'
import { lowestRow, voxelHeight, voxelize } from './voxels'

describe('voxels', () => {
  it('turns every filled pixel into a block standing on the floor', () => {
    // A 3 x 3 sprite with a padded bottom row: an L of three pixels.
    const sprite: Sprite = {
      width: 3,
      height: 3,
      pixels: Uint8Array.from([2, 0, 0, 2, 4, 0, 0, 0, 0]),
    }
    expect(lowestRow(sprite)).toBe(1)
    const voxels = voxelize(sprite)
    expect(voxels).toEqual([
      { x: -1, y: 1.5, color: 2, rise: 1 },
      { x: -1, y: 0.5, color: 2, rise: 0 },
      { x: 0, y: 0.5, color: 4, rise: 0 },
    ])
    expect(voxelHeight(voxels)).toBe(2)
  })

  it("builds the runner's Kelo in every pose on the standing pose's floor", () => {
    const floor = lowestRow(kelo('runA'))
    for (const frame of ['runA', 'runB', 'jump', 'hurt'] as const) {
      const sprite = kelo(frame)
      const voxels = voxelize(sprite, floor)
      expect(voxels.length).toBe(sprite.pixels.filter(Boolean).length)
      // Standing he is on the floor; tucked or splayed, his feet lift off it.
      const feet = Math.min(...voxels.map((v) => v.y))
      if (frame === 'runA') expect(feet).toBe(0.5)
      else expect(feet).toBeGreaterThanOrEqual(0.5)
      expect(voxelHeight(voxels)).toBeLessThanOrEqual(sprite.height)
      for (const voxel of voxels) {
        expect(voxel.rise).toBeGreaterThanOrEqual(0)
        expect(voxel.rise).toBeLessThanOrEqual(1)
      }
    }
  })
})
