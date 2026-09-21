import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { BUDGETS, main, measureBundle } from './bundle-report.mjs'

/** A fake .next directory with one chunk of each kind. */
function fakeBuild(sizes: { initial: number; deferred: number }) {
  const dir = mkdtempSync(join(tmpdir(), 'kelor-bundle-'))
  const chunks = join(dir, 'static', 'chunks')
  mkdirSync(chunks, { recursive: true })
  mkdirSync(join(dir, 'server', 'app', 'page'), { recursive: true })
  // Pseudo-random bytes (xorshift) so gzip cannot shrink them.
  const blob = (kb: number, seed: number) => {
    const bytes = Buffer.alloc(kb * 1024)
    let x = seed * 2654435761
    for (let i = 0; i < bytes.length; i++) {
      x ^= x << 13
      x ^= x >>> 17
      x ^= x << 5
      bytes[i] = x & 0xff
    }
    return bytes
  }
  writeFileSync(join(chunks, 'main.js'), blob(sizes.initial, 1))
  writeFileSync(join(chunks, 'legacy.js'), blob(4, 2))
  writeFileSync(join(chunks, 'stage.js'), blob(sizes.deferred, 3))
  writeFileSync(join(chunks, 'debug.js'), blob(2, 4))
  writeFileSync(
    join(dir, 'server', 'app', 'index.html'),
    '<script src="/_next/static/chunks/main.js" async></script>' +
      '<script src="/_next/static/chunks/legacy.js" noModule></script>',
  )
  writeFileSync(
    join(dir, 'server', 'app', 'page', 'react-loadable-manifest.json'),
    JSON.stringify({ 1: { id: 1, files: ['static/chunks/stage.js'] } }),
  )
  return dir
}

const dirs: string[] = []
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

describe('bundle report', () => {
  it('classifies initial, deferred, on-demand and legacy chunks', () => {
    const dir = fakeBuild({ initial: 8, deferred: 8 })
    dirs.push(dir)
    const report = measureBundle(dir)
    const kinds = Object.fromEntries(report.chunks.map((c) => [c.file, c.kind]))
    expect(kinds).toEqual({
      'main.js': 'initial',
      'legacy.js': 'legacy',
      'stage.js': 'deferred 3D',
      'debug.js': 'on demand',
    })
    expect(report.ok).toBe(true)
  })

  it('fails when the initial JS exceeds its budget', () => {
    const dir = fakeBuild({ initial: BUDGETS.initialKB + 60, deferred: 4 })
    dirs.push(dir)
    const lines: string[] = []
    expect(main([], { log: (s: string) => lines.push(s), nextDir: dir })).toBe(1)
    expect(lines.join('\n')).toMatch(/FAIL\s+initial JS/)
  })

  it('asks for a build when there is none', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kelor-empty-'))
    dirs.push(dir)
    expect(main([], { log: () => {}, nextDir: dir })).toBe(2)
  })
})
