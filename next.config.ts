import type { NextConfig } from 'next'
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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
