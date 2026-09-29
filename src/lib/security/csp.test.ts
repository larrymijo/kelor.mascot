import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy } from './csp'

const directive = (policy: string, name: string) =>
  policy
    .split('; ')
    .find((d) => d.startsWith(`${name} `))
    ?.split(' ')
    .slice(1) ?? []

describe('content security policy', () => {
  const policy = contentSecurityPolicy()

  it('keeps everything on the site itself', () => {
    expect(directive(policy, 'default-src')).toEqual(["'self'"])
    for (const name of ['script-src', 'style-src', 'img-src', 'font-src', 'connect-src'])
      expect(directive(policy, name).some((v) => v.startsWith('http'))).toBe(false)
  })

  it('lets the Basis transcoder run in its Blob worker, which builds functions from strings', () => {
    expect(directive(policy, 'script-src')).toContain("'unsafe-eval'")
    expect(directive(policy, 'worker-src')).toContain('blob:')
  })

  it('lets the model loader read its embedded textures through Blob URLs', () => {
    expect(directive(policy, 'connect-src')).toContain('blob:')
  })

  it('blocks plugins, framing and foreign form targets', () => {
    expect(directive(policy, 'object-src')).toEqual(["'none'"])
    expect(directive(policy, 'frame-ancestors')).toEqual(["'none'"])
    expect(directive(policy, 'form-action')).toEqual(["'self'"])
    expect(directive(policy, 'base-uri')).toEqual(["'self'"])
  })

  it('allows inline scripts only when asked', () => {
    expect(directive(policy, 'script-src')).not.toContain("'unsafe-inline'")
    expect(directive(contentSecurityPolicy({ inlineScripts: true }), 'script-src')).toContain(
      "'unsafe-inline'",
    )
  })

  it('lets the Vercel toolbar in on previews only', () => {
    expect(policy).not.toContain('vercel.live')
    const preview = contentSecurityPolicy({ preview: true })
    expect(directive(preview, 'script-src')).toContain('https://vercel.live')
    expect(directive(preview, 'frame-src')).toContain('https://vercel.live')
  })
})
