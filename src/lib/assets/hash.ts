/**
 * Build-time content hashes for versions.ts. Node only: next.config.ts and
 * tests import it, the client never does.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { AssetVersions } from './versions'

export const BASIS_FILES = [
  'public/basis/basis_transcoder.js',
  'public/basis/basis_transcoder.wasm',
] as const

type Read = (path: string) => Uint8Array

const readBytes: Read = (path) => readFileSync(path)

/** A short hash of the files' bytes; 12 hex digits leave collisions out of reach. */
export function contentHash(paths: readonly string[], read = readBytes) {
  const hash = createHash('sha256')
  for (const path of paths) hash.update(read(path))
  return hash.digest('hex').slice(0, 12)
}

/** Hashes each model and the transcoder, with paths relative to the repo root. */
export function hashAssets(modelPaths: readonly string[], read = readBytes): AssetVersions {
  return {
    files: Object.fromEntries(modelPaths.map((path) => [path, contentHash([path], read)])),
    basis: contentHash(BASIS_FILES, read),
  }
}
