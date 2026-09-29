import type { NextConfig } from 'next'
import character from './character.json'
import { hashAssets } from './src/lib/assets/hash'
import { BASIS_DIR, VERSION_PARAM } from './src/lib/assets/versions'
import { contentSecurityPolicy } from './src/lib/security/csp'

/**
 * Security headers. HSTS is served by Vercel. The Content Security Policy
 * (src/lib/security/csp.ts) applies to production builds, which includes a
 * local `next start`; `next dev` needs eval and inline scripts for its
 * tooling, so it gets none. Previews also let the Vercel toolbar in.
 */
const production = process.env.NODE_ENV === 'production'
const preview = process.env.VERCEL_ENV === 'preview'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  ...(production
    ? [
        {
          key: 'Content-Security-Policy',
          // Next inlines the RSC payload as scripts: hashes (experimental SRI)
          // cover only external scripts, and nonces need dynamic rendering.
          value: contentSecurityPolicy({ preview, inlineScripts: true }),
        },
      ]
    : []),
]

/**
 * The models and the Basis transcoder are the heaviest files, and their URLs
 * carry a content hash (src/lib/assets/versions.ts), so browsers keep them
 * for a year without asking again. Only in builds: `next dev` hashes once at
 * start and would pin a model rebuilt during the session.
 */
const immutable = [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]
const basisVersioned = `${BASIS_DIR}:version/:file`

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_ASSET_VERSIONS: JSON.stringify(
      hashAssets([character.files.lite, character.files.full]),
    ),
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      ...(production
        ? [
            {
              source: '/models/:file',
              has: [{ type: 'query' as const, key: VERSION_PARAM }],
              headers: immutable,
            },
            { source: basisVersioned, headers: immutable },
          ]
        : []),
    ]
  },
  async rewrites() {
    return [{ source: basisVersioned, destination: `${BASIS_DIR}:file` }]
  },
}

export default nextConfig
