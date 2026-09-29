/**
 * Where the stage loads the mascot from, per quality tier. character.json
 * stores repo paths (public/models/…); the browser needs site URLs, which
 * carry the file's content hash in builds (src/lib/assets/versions.ts).
 */
import { assetVersions, versionedUrl } from '@/lib/assets/versions'
import type { Character } from '@/lib/character'
import type { QualityTier } from '@/lib/quality/detect'

/** "public/models/x.glb" → "/models/x.glb", plus "?v=<hash>" when the build knows it. */
export function publicUrl(repoPath: string, versions = assetVersions) {
  if (!repoPath.startsWith('public/')) throw new Error(`${repoPath} is not under public/`)
  return versionedUrl(repoPath.slice('public'.length), repoPath, versions)
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
