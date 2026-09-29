/**
 * The site's Content Security Policy, built in one place so it is unit
 * tested. Everything is same-origin: fonts through next/font, the models, the
 * Basis transcoder and every chunk ship from the site itself.
 *
 * - 'unsafe-eval': the Basis transcoder that decodes the full model's KTX2
 *   textures is Emscripten code whose embind layer builds functions with
 *   new Function, inside a Blob worker that inherits this policy. Without it
 *   the full model never loads. It also covers the WebAssembly the Meshopt
 *   and Basis decoders compile. The page has no user input or dynamic content
 *   to inject into, and every source stays the site's own.
 * - worker-src blob: covers the KTX2 transcoder workers, which three builds
 *   from a Blob URL, and connect-src blob: the textures embedded in the
 *   models, which three's loader fetches through Blob URLs.
 * - img-src data: covers the loading brand mark, an inline SVG image.
 * - Scripts: Next inlines its RSC payload as scripts. Hashes (the
 *   experimental SRI) cover only external scripts and left the page broken,
 *   and nonces would force dynamic rendering of a static page, so the site
 *   uses Next's documented no-nonce policy: 'unsafe-inline' for scripts.
 * - Previews also allow the Vercel toolbar (vercel.live and its websocket).
 */
export interface CspOptions {
  /** Vercel preview deployments load the Vercel toolbar. */
  preview?: boolean
  /** Allow inline scripts (Next's RSC payload) when hashes cannot cover them. */
  inlineScripts?: boolean
}

const VERCEL_TOOLBAR = {
  script: ['https://vercel.live'],
  connect: ['https://vercel.live', 'wss://ws-us3.pusher.com'],
  img: ['https://vercel.live', 'https://vercel.com'],
  frame: ['https://vercel.live'],
  style: ['https://vercel.live'],
  font: ['https://vercel.live', 'https://assets.vercel.com'],
}

export function contentSecurityPolicy({ preview = false, inlineScripts = false }: CspOptions = {}) {
  const extra = (key: keyof typeof VERCEL_TOOLBAR) => (preview ? VERCEL_TOOLBAR[key] : [])
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      ...(inlineScripts ? ["'unsafe-inline'"] : []),
      "'unsafe-eval'",
      ...extra('script'),
    ],
    'style-src': ["'self'", "'unsafe-inline'", ...extra('style')],
    'img-src': ["'self'", 'data:', 'blob:', ...extra('img')],
    'font-src': ["'self'", ...extra('font')],
    'connect-src': ["'self'", 'blob:', ...extra('connect')],
    'worker-src': ["'self'", 'blob:'],
    'media-src': ["'self'"],
    'frame-src': preview ? VERCEL_TOOLBAR.frame : ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  }
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}
