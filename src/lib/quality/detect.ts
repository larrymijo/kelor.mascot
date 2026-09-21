/**
 * Initial quality tier from device signals. Pure and deterministic, so the
 * heuristics are unit tested; the browser-only signal reader lives next to
 * the stage. drei's PerformanceMonitor then steps the tier at runtime.
 *
 * No detect-gpu: it downloads benchmark data from a CDN at runtime.
 */

export const QUALITY_TIERS = ['low', 'medium', 'high'] as const
export type QualityTier = (typeof QUALITY_TIERS)[number]

export interface DeviceSignals {
  webgl2: boolean
  /** WebGL renderer string, e.g. "ANGLE (Intel, Intel(R) UHD Graphics 620 …)". */
  renderer?: string | null
  isMobile: boolean
  hardwareConcurrency?: number
  /** navigator.deviceMemory, in GB (Chromium only). */
  deviceMemoryGB?: number
  saveData?: boolean
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i
const INTEGRATED =
  /intel(?!.*\barc\b)|radeon\(tm\) graphics|radeon graphics|vega \d|uhd graphics|iris/i
const DISCRETE = /nvidia|geforce|quadro|rtx|radeon rx|radeon pro|\barc\b|apple m\d|apple gpu/i

/** Pick the starting tier. Unknown desktops default to `medium`. */
export function detectQualityTier(signals: DeviceSignals): QualityTier {
  const renderer = signals.renderer ?? ''
  const cores = signals.hardwareConcurrency
  const memory = signals.deviceMemoryGB

  if (!signals.webgl2) return 'low'
  if (signals.saveData) return 'low'
  if (SOFTWARE.test(renderer)) return 'low'
  if ((memory !== undefined && memory <= 2) || (cores !== undefined && cores <= 2)) return 'low'

  if (signals.isMobile) {
    // Phones never start on high: heat and battery matter more than the last 10 %.
    const weak = (memory !== undefined && memory <= 3) || (cores !== undefined && cores <= 4)
    return weak ? 'low' : 'medium'
  }

  if (INTEGRATED.test(renderer)) return 'medium'
  if (DISCRETE.test(renderer)) return 'high'
  return 'medium'
}

export function stepDown(tier: QualityTier): QualityTier {
  return QUALITY_TIERS[Math.max(0, QUALITY_TIERS.indexOf(tier) - 1)]!
}

export function stepUp(tier: QualityTier, ceiling: QualityTier = 'high'): QualityTier {
  const next = Math.min(QUALITY_TIERS.indexOf(tier) + 1, QUALITY_TIERS.indexOf(ceiling))
  return QUALITY_TIERS[Math.max(next, QUALITY_TIERS.indexOf(tier))]!
}
