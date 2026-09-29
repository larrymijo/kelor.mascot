/**
 * Content versions of the large static files: the models and the Basis
 * transcoder. next.config.ts hashes them at build time (hash.ts) and inlines
 * the result as NEXT_PUBLIC_ASSET_VERSIONS. Their URLs carry the hash, so
 * they are cached as immutable: a changed file is a new URL.
 */
export interface AssetVersions {
  /** Repo path → short content hash. */
  files: Record<string, string>
  /** One hash over the transcoder's files; it names the folder they are served from. */
  basis: string
}

/** The query parameter of a versioned model; only requests with it are cached as immutable. */
export const VERSION_PARAM = 'v'
export const BASIS_DIR = '/basis/'

export function parseAssetVersions(raw: string | undefined): AssetVersions | null {
  return raw ? (JSON.parse(raw) as AssetVersions) : null
}

/** Inlined by the build; absent in unit tests, where URLs stay plain. */
export const assetVersions = parseAssetVersions(process.env.NEXT_PUBLIC_ASSET_VERSIONS)

/** A site URL with its file's content hash, when the build knows it. */
export function versionedUrl(url: string, repoPath: string, versions = assetVersions) {
  const hash = versions?.files[repoPath]
  return hash ? `${url}?${VERSION_PARAM}=${hash}` : url
}

/**
 * Where the KTX2 loader fetches the transcoder. It appends the file names
 * itself, so the version is a folder, which next.config.ts rewrites to
 * public/basis.
 */
export function transcoderPath(versions = assetVersions) {
  return versions ? `${BASIS_DIR}${versions.basis}/` : BASIS_DIR
}
