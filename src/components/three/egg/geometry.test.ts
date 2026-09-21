import { Box3, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import { buildEggPieces } from './geometry'

const box = (g: Parameters<Box3['setFromBufferAttribute']>[0]) =>
  new Box3().setFromBufferAttribute(g)
const egg = character.egg
const pieces = buildEggPieces(egg)

describe('egg geometry', () => {
  it('stands on the floor and matches the contract height', () => {
    const all = [pieces.left, pieces.right].map((g) => box(g.attributes.position as never))
    const cap = box(pieces.cap.attributes.position as never)
    all.push(cap.translate(new Vector3(0, pieces.capCenterY, 0)))
    const minY = Math.min(...all.map((b) => b.min.y))
    const maxY = Math.max(...all.map((b) => b.max.y))
    expect(minY).toBeCloseTo(0, 5)
    expect(maxY).toBeCloseTo(egg.heightM, 5)
  })

  it('keeps the outline within the contract radius', () => {
    const left = box(pieces.left.attributes.position as never)
    const right = box(pieces.right.attributes.position as never)
    expect(right.max.x).toBeLessThanOrEqual(egg.radiusM + 1e-6)
    expect(left.min.x).toBeGreaterThanOrEqual(-egg.radiusM - 1e-6)
    expect(Math.max(left.max.z, right.max.z)).toBeLessThanOrEqual(egg.radiusM + 1e-6)
  })

  it('hinges each half on its outer vertical edge', () => {
    const right = box(pieces.right.attributes.position as never)
    expect(pieces.halfWidth).toBeCloseTo(right.max.x, 2)
  })

  it('splits the body into a left and a right half at x = 0', () => {
    const left = box(pieces.left.attributes.position as never)
    const right = box(pieces.right.attributes.position as never)
    expect(left.max.x).toBeLessThanOrEqual(egg.bevelM + 1e-6)
    expect(right.min.x).toBeGreaterThanOrEqual(-egg.bevelM - 1e-6)
    expect(left.max.y).toBeCloseTo(pieces.bodyHeight, 5)
  })

  it('puts the cap on top and the glowing core inside', () => {
    const cap = box(pieces.cap.attributes.position as never)
    const core = box(pieces.core.attributes.position as never)
    expect(cap.min.y + pieces.capCenterY).toBeCloseTo(pieces.bodyHeight, 5)
    expect((cap.min.y + cap.max.y) / 2).toBeCloseTo(0, 5)
    expect(core.max.x).toBeLessThan(egg.radiusM)
    expect(core.max.y).toBeLessThan(egg.heightM)
  })
})
