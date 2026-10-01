/**
 * The runner's pixel-art Kelo as a 3D model (docs/interaction-script.md):
 * each coloured pixel of a sprite becomes a block, so the tiny Kelo on the
 * stage is the same character as in the game, with depth when the camera
 * orbits him. Pure, so it is tested without three.
 */
import type { Sprite } from './sprites'

export interface Voxel {
  /** Centre across, in blocks: 0 is the sprite's middle column. */
  x: number
  /** Centre up, in blocks: the bottom row sits on 0. */
  y: number
  /** Palette index. */
  color: number
  /** 0 at the bottom row to 1 at the top, for the transformation's sweep. */
  rise: number
}

/** The lowest filled row of a sprite, or -1 when it is empty. */
export function lowestRow(sprite: Sprite) {
  let bottom = -1
  sprite.pixels.forEach((color, i) => {
    if (color) bottom = Math.floor(i / sprite.width)
  })
  return bottom
}

/**
 * Every filled pixel of a sprite, as a block. The floor row (by default its
 * lowest filled row) stands on the floor; frames of one character share the
 * standing frame's floor row, so tucked legs lift off it as in the game.
 */
export function voxelize(sprite: Sprite, floorRow = lowestRow(sprite)): Voxel[] {
  const { width, pixels } = sprite
  const bottom = floorRow
  const voxels: Voxel[] = []
  pixels.forEach((color, i) => {
    if (!color) return
    const column = i % width
    const row = Math.floor(i / width)
    voxels.push({
      x: column - (width - 1) / 2,
      y: bottom - row + 0.5,
      color,
      rise: bottom > 0 ? Math.min(1, Math.max(0, (bottom - row) / bottom)) : 0,
    })
  })
  return voxels
}

/** How many blocks tall a set of voxels stands. */
export function voxelHeight(voxels: Voxel[]) {
  return voxels.reduce((top, voxel) => Math.max(top, voxel.y + 0.5), 0)
}
