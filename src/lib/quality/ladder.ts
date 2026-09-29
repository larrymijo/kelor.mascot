/**
 * The quality ladder: the steps the runtime walks when the frame rate says
 * so, best first. Each step is a tier and a render pixel ratio. Within a tier
 * the resolution steps down first, a cheap resize; only at the tier's floor
 * does the next step change the tier, which rebuilds the effects. The pixel
 * ratio never rises on the way down, so each step is cheaper than the last.
 *
 * On a 150% laptop screen booting on medium: medium at 1.5, 1.25 and 1, then
 * low at 1. On a strong GPU at 200%: high at 2 and 1.5, then medium at 1.5,
 * 1.25 and 1, then low. Pure, so it is unit tested.
 */
import { QUALITY_TIERS, type QualityTier } from './detect'

export interface Rung {
  tier: QualityTier
  dpr: number
}

export interface LadderSettings {
  /** Per tier: the highest pixel ratio it renders at, and the lowest it steps down to. */
  tiers: Record<QualityTier, { dprMax: number; dprMin: number }>
  /** The pixel ratios the ladder may stop at between them. */
  dprSteps: readonly number[]
}

/** Rounds away float noise such as 1.2500000001 from devicePixelRatio. */
const tidy = (n: number) => Math.round(n * 1000) / 1000

export function buildLadder(
  bootTier: QualityTier,
  devicePixelRatio: number,
  settings: LadderSettings,
): Rung[] {
  const tiers = QUALITY_TIERS.slice(0, QUALITY_TIERS.indexOf(bootTier) + 1).reverse()
  const rungs: Rung[] = []
  let ceiling = Infinity
  for (const tier of tiers) {
    const { dprMax, dprMin } = settings.tiers[tier]
    const top = tidy(Math.min(dprMax, devicePixelRatio, ceiling))
    const floor = Math.min(dprMin, top)
    const dprs = [top, ...settings.dprSteps.filter((d) => d < top && d >= floor)]
    for (const dpr of [...new Set(dprs)].sort((a, b) => b - a)) rungs.push({ tier, dpr })
    ceiling = rungs.at(-1)!.dpr
  }
  return rungs
}
