/**
 * The sandbox's size slider (docs/interaction-script.md): how much of the
 * screen Kelo fills, from a tiny figure to the size of phase 8's hero shot.
 * The slider runs 0 to 1 on a log scale, so every step looks like the same
 * change in size; below a threshold he turns into the pixel-art Kelo of the
 * runner.
 *
 * Fills are the `fill` of frameSubject in the sandbox layout, whose free
 * band is 80% of the screen's height (layout.ts).
 */
export const SIZE = {
  /** The smallest: about a twelfth of the screen's height. */
  minFill: 0.08,
  /**
   * The largest: as tall on screen as phase 8's hero shot (fill 0.72 of an
   * 88% band there, 0.79 of this 80% one), and no larger.
   */
  maxFill: 0.79,
  /** Where every visit starts: small in the middle of the dark. */
  defaultFill: 0.34,
  /** Smaller than this, he is pixel art. */
  pixelBelowFill: 0.18,
} as const

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** The frameSubject fill for a slider position, 0 to 1. */
export function fillFor(size: number) {
  return SIZE.minFill * (SIZE.maxFill / SIZE.minFill) ** clamp01(size)
}

/** The slider position, 0 to 1, for a fill. */
export function sizeFor(fill: number) {
  return clamp01(Math.log(fill / SIZE.minFill) / Math.log(SIZE.maxFill / SIZE.minFill))
}

export const DEFAULT_SIZE = sizeFor(SIZE.defaultFill)

/** Whether he is small enough to turn into pixel art. */
export function isPixel(size: number) {
  return fillFor(size) < SIZE.pixelBelowFill
}

/** A stored or typed size, or null when it is not one. */
export function parseSize(value: unknown) {
  const size = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof size === 'number' && Number.isFinite(size) ? clamp01(size) : null
}
