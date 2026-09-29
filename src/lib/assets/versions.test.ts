import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import { BASIS_FILES, contentHash, hashAssets } from './hash'
import { parseAssetVersions, transcoderPath, versionedUrl, type AssetVersions } from './versions'

const versions: AssetVersions = {
  files: { 'public/models/mascot.lite.glb': '0123456789ab' },
  basis: 'cafebabe1234',
}

describe('asset versions', () => {
  it('adds the content hash to a known file and leaves others plain', () => {
    expect(versionedUrl('/models/mascot.lite.glb', 'public/models/mascot.lite.glb', versions)).toBe(
      '/models/mascot.lite.glb?v=0123456789ab',
    )
    expect(versionedUrl('/models/other.glb', 'public/models/other.glb', versions)).toBe(
      '/models/other.glb',
    )
    expect(versionedUrl('/models/mascot.lite.glb', 'public/models/mascot.lite.glb', null)).toBe(
      '/models/mascot.lite.glb',
    )
  })

  it('serves the transcoder from a versioned folder', () => {
    expect(transcoderPath(versions)).toBe('/basis/cafebabe1234/')
    expect(transcoderPath(null)).toBe('/basis/')
  })

  it('reads the inlined JSON, or nothing', () => {
    expect(parseAssetVersions(JSON.stringify(versions))).toEqual(versions)
    expect(parseAssetVersions(undefined)).toBeNull()
  })

  it('hashes content, so a changed file gets a new version', () => {
    const files: Record<string, string> = { a: 'one', b: 'two' }
    const read = (path: string) => Buffer.from(files[path]!)
    const before = contentHash(['a'], read)
    expect(before).toMatch(/^[0-9a-f]{12}$/)
    files.a = 'one!'
    expect(contentHash(['a'], read)).not.toBe(before)
  })

  it('hashes the real models and transcoder from the repo root', () => {
    const real = hashAssets([character.files.lite, character.files.full])
    expect(Object.keys(real.files)).toEqual([character.files.lite, character.files.full])
    expect(real.files[character.files.lite]).not.toBe(real.files[character.files.full])
    expect(real.basis).toBe(contentHash(BASIS_FILES))
  })
})
