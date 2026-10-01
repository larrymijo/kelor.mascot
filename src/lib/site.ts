/**
 * Absolute site URL for metadata (Open Graph, canonical links).
 * Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every deployment; no secret involved.
 */
const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL

export const siteUrl = productionHost ? `https://${productionHost}` : 'http://localhost:3000'

/**
 * Whether search engines may index a deployment: production only. Previews
 * and local builds keep noindex, so a preview never competes with the site.
 * Vercel sets VERCEL_ENV at build time (production, preview, development).
 */
export function indexable(vercelEnv: string | undefined) {
  return vercelEnv === 'production'
}

export const isIndexable = indexable(process.env.VERCEL_ENV)
