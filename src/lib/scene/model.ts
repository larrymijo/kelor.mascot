/**
 * Where the stage loads the mascot from, per quality tier. character.json
 * stores repo paths (public/models/…); the browser needs site URLs.
 */
import type { Character } from '@/lib/character'
import type { QualityTier } from '@/lib/quality/detect'

/** "public/models/x.glb" → "/models/x.glb". */
export function publicUrl(repoPath: string) {
  if (!repoPath.startsWith('public/')) throw new Error(`${repoPath} is not under public/`)
  return repoPath.slice('public'.length)
}

export function tierSettings(character: Pick<Character, 'quality'>, tier: QualityTier) {
  return character.quality.tiers[tier]
}

export function modelUrl(character: Pick<Character, 'quality' | 'files'>, tier: QualityTier) {
  return publicUrl(character.files[tierSettings(character, tier).model])
}

/** The lite model paints first on every tier: it decodes with no transcoder. */
export function firstPaintUrl(character: Pick<Character, 'files'>) {
  return publicUrl(character.files.lite)
}

/** The model to stream in after first paint, or null when the tier stays on lite. */
export function upgradeUrl(character: Pick<Character, 'quality' | 'files'>, tier: QualityTier) {
  return tierSettings(character, tier).model === 'lite' ? null : modelUrl(character, tier)
}
