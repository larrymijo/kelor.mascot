import { describe, expect, it } from 'vitest'
import { frameSubject } from '@/lib/scene/framing'
import { BITE_FRAMING, layoutFraming, type Layout } from './layout'

const kelo = { fovDeg: 30, subjectHeightM: 1.3, subjectWidthM: 1.02, subjectCenterY: 0.6 }
/** Kelo's height as a share of the screen's height. */
const share = (aspect: number, layout: Layout) => {
  const { fill, topReserve, bottomReserve } = layout
  const { distance } = frameSubject({ ...kelo, aspect, fill, topReserve, bottomReserve })
  return kelo.subjectHeightM / (2 * distance * Math.tan((kelo.fovDeg * Math.PI) / 360))
}

describe('layoutFraming', () => {
  it('stands Kelo small on the dark stage: a third of a desktop screen', () => {
    const desktop = share(1920 / 975, layoutFraming(1920 / 975, true))
    expect(desktop).toBeGreaterThan(0.25)
    expect(desktop).toBeLessThan(0.4)
  })

  it('keeps him small on a phone too, but big enough to tap', () => {
    const aspect = 390 / 844
    const phone = share(aspect, layoutFraming(aspect, false))
    expect(phone).toBeLessThan(0.4)
    // At 844 px tall, more than 150 px of Kelo to aim a finger at.
    expect(phone * 844).toBeGreaterThan(150)
  })

  it('bites at the close framing, whatever the layout', () => {
    const aspect = 1920 / 975
    expect(share(aspect, BITE_FRAMING)).toBeGreaterThan(
      2 * share(aspect, layoutFraming(aspect, true)),
    )
  })

  it('always leaves Kelo room between the bands', () => {
    for (const [aspect, sandbox] of [
      [16 / 9, true],
      [4 / 3, false],
      [9 / 19.5, false],
    ] as const) {
      const { topReserve = 0, bottomReserve, fill } = layoutFraming(aspect, sandbox)
      expect(topReserve + bottomReserve).toBeLessThan(0.35)
      expect(fill).toBeLessThanOrEqual(1)
    }
  })
})
