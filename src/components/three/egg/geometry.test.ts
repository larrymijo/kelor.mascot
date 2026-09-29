import { Box3, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import { buildEggPieces, EGG_SEGMENTS, eggProfile } from './geometry'

const box = (g: Parameters<Box3['setFromBufferAttribute']>[0]) =>
  new Box3().setFromBufferAttribute(g)
const egg = character.egg
const pieces = buildEggPieces(egg)
const shellBoxes = () =>
  [pieces.left, pieces.right, pieces.cap].map((g) => box(g.attributes.position as never))

describe('egg geometry', () => {
  it('stands on the floor and matches the contract height', () => {
    const boxes = shellBoxes()
    expect(Math.min(...boxes.map((b) => b.min.y))).toBeCloseTo(0, 5)
    expect(Math.max(...boxes.map((b) => b.max.y))).toBeCloseTo(egg.heightM, 5)
  })

  it('is widest at the contract radius, below the middle, like a real egg', () => {
    const profile = eggProfile(egg.heightM, egg.radiusM, egg.taper)
    let widest = { r: 0, y: 0 }
    for (let i = 0; i <= 1000; i++) {
      const p = profile((i / 1000) * Math.PI)
      if (p.r > widest.r) widest = { r: p.r, y: p.y }
    }
    expect(widest.r).toBeCloseTo(egg.radiusM, 3)
    expect(widest.y).toBeLessThan(egg.heightM / 2)
    for (const b of shellBoxes()) {
      expect(Math.max(b.max.x, b.max.z, -b.min.x, -b.min.z)).toBeLessThanOrEqual(egg.radiusM + 1e-6)
    }
  })

  it('is smooth: dense enough to stay round, with unit normals pointing outwards', () => {
    expect(EGG_SEGMENTS.around).toBeGreaterThanOrEqual(96)
    const position = pieces.right.attributes.position!
    const normal = pieces.right.attributes.normal!
    for (let i = 0; i < position.count; i += 97) {
      const n = new Vector3().fromBufferAttribute(normal as never, i)
      const p = new Vector3().fromBufferAttribute(position as never, i)
      expect(n.length()).toBeCloseTo(1, 5)
      // Outwards from the axis, wherever the surface is not at a pole.
      if (Math.hypot(p.x, p.z) > 0.02) expect(n.x * p.x + n.z * p.z).toBeGreaterThan(0)
    }
  })

  it('breaks into a left and a right half along a jagged seam near x = 0', () => {
    const left = box(pieces.left.attributes.position as never)
    const right = box(pieces.right.attributes.position as never)
    expect(left.max.x).toBeLessThan(0.04)
    expect(right.min.x).toBeGreaterThan(-0.04)
    expect(left.min.x).toBeCloseTo(-egg.radiusM, 2)
    expect(right.max.x).toBeCloseTo(egg.radiusM, 2)
  })

  it('frees a cap along a jagged crack near the top, pivoting about its centre', () => {
    const cap = box(pieces.cap.attributes.position as never)
    expect(cap.min.y).toBeGreaterThan(pieces.capLineY - 0.05)
    expect((cap.min.y + cap.max.y) / 2).toBeCloseTo(pieces.capCenterY, 5)
    const halves = box(pieces.left.attributes.position as never)
    expect(halves.max.y).toBeLessThan(pieces.capLineY + 0.05)
  })

  it('keeps the unbroken egg whole: every face of the three pieces', () => {
    const faces = (g: typeof pieces.whole) => g.index!.count / 3
    expect(faces(pieces.whole)).toBe(faces(pieces.left) + faces(pieces.right) + faces(pieces.cap))
  })

  it('keeps the glowing core inside the shell', () => {
    const core = box(pieces.core.attributes.position as never)
    expect(core.max.x).toBeLessThan(egg.radiusM)
    expect(core.min.y).toBeGreaterThan(0)
    expect(core.max.y).toBeLessThan(egg.heightM)
  })
})
