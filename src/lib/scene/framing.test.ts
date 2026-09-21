import { describe, expect, it } from 'vitest'
import { frameSubject, projectY, type FramingInput } from './framing'

const base: FramingInput = {
  aspect: 16 / 9,
  fovDeg: 30,
  subjectHeightM: 1.2,
  subjectWidthM: 0.9,
  subjectCenterY: 0.6,
  fill: 0.8,
  bottomReserve: 0.3,
}

const edges = (input: FramingInput) => {
  const framing = frameSubject(input)
  return {
    framing,
    top: projectY(input.subjectCenterY + input.subjectHeightM / 2, framing, input.fovDeg),
    bottom: projectY(input.subjectCenterY - input.subjectHeightM / 2, framing, input.fovDeg),
  }
}

describe('frameSubject', () => {
  it('keeps the subject inside the area above the reserved text', () => {
    const { top, bottom } = edges(base)
    const reserveTop = -1 + 2 * base.bottomReserve
    expect(top).toBeLessThanOrEqual(1)
    expect(bottom).toBeGreaterThanOrEqual(reserveTop - 1e-9)
  })

  it('centres the subject in the free area on wide screens', () => {
    const { top, bottom } = edges(base)
    const freeCentre = base.bottomReserve
    expect((top + bottom) / 2).toBeCloseTo(freeCentre, 6)
  })

  it('moves the camera back on portrait screens so the width still fits', () => {
    const wide = frameSubject(base)
    const portrait = frameSubject({ ...base, aspect: 9 / 19.5 })
    expect(portrait.distance).toBeGreaterThan(wide.distance)
  })

  it('looks straight at the subject when no text is reserved', () => {
    const framing = frameSubject({ ...base, bottomReserve: 0 })
    expect(framing.targetY).toBeCloseTo(base.subjectCenterY)
  })
})
