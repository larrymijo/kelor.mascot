import { describe, expect, it } from 'vitest'
import { BITE_FRAMING, layoutFraming, type Layout } from './layout'
import { DEFAULT_SIZE, fillFor, isPixel, parseSize, SIZE, sizeFor } from './size'

describe('size slider', () => {
  it('starts where the sandbox has always framed him', () => {
    expect(fillFor(DEFAULT_SIZE)).toBeCloseTo(layoutFraming(16 / 9, true).fill, 6)
    expect(isPixel(DEFAULT_SIZE)).toBe(false)
  })

  it('runs from tiny to the size of the old hero shot, no larger', () => {
    expect(fillFor(0)).toBeCloseTo(SIZE.minFill)
    expect(fillFor(1)).toBeCloseTo(SIZE.maxFill)
    expect(fillFor(-1)).toBeCloseTo(SIZE.minFill)
    expect(fillFor(2)).toBeCloseTo(SIZE.maxFill)
    // At its largest he stands as tall on screen as phase 8 framed him (the bite's framing).
    const share = ({ fill, topReserve = 0, bottomReserve }: Layout) =>
      fill * (1 - topReserve - bottomReserve)
    const now = share({ ...layoutFraming(16 / 9, true), fill: SIZE.maxFill })
    expect(now).toBeCloseTo(share(BITE_FRAMING), 2)
  })

  it('changes size by the same factor at every step', () => {
    const ratios = [0, 0.25, 0.5, 0.75].map((s) => fillFor(s + 0.25) / fillFor(s))
    for (const ratio of ratios) expect(ratio).toBeCloseTo(ratios[0]!, 6)
    for (const s of [0, 0.3, 0.66, 1]) expect(sizeFor(fillFor(s))).toBeCloseTo(s, 6)
  })

  it('turns him into pixel art only at the small end', () => {
    expect(isPixel(0)).toBe(true)
    expect(isPixel(sizeFor(SIZE.pixelBelowFill) - 0.01)).toBe(true)
    expect(isPixel(sizeFor(SIZE.pixelBelowFill) + 0.01)).toBe(false)
    expect(isPixel(1)).toBe(false)
  })

  it('reads a stored size, and nothing else', () => {
    expect(parseSize('0.4')).toBe(0.4)
    expect(parseSize(0.25)).toBe(0.25)
    expect(parseSize('7')).toBe(1)
    expect(parseSize(null)).toBeNull()
    expect(parseSize('')).toBeNull()
    expect(parseSize('big')).toBeNull()
  })
})
