/**
 * Absolute site URL for metadata (Open Graph, canonical links).
 * Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every deployment; no secret involved.
 */
const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL

export const siteUrl = productionHost ? `https://${productionHost}` : 'http://localhost:3000'
