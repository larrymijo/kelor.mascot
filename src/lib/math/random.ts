/**
 * Seedable random source. Behaviour code takes a `() => number` so tests can
 * replay exact sequences; the scene passes Math.random.
 */
export type Random = () => number

/** mulberry32: tiny, fast, good enough for timing jitter. */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Uniform value in [min, max). */
export const between = ([min, max]: readonly [number, number], random: Random) =>
  min + (max - min) * random()
