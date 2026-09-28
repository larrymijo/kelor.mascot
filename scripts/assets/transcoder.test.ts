import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * public/basis serves a copy of three's Basis transcoder so KTX2 textures
 * decode without a CDN. The worker protocol changes between three releases,
 * so upgrading three without refreshing the copy would only fail at runtime,
 * in the browser. This turns that into a test failure.
 */
describe('Basis transcoder served from public/basis', () => {
  for (const file of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
    it(`${file} matches the installed three`, () => {
      const served = readFileSync(`public/basis/${file}`)
      const installed = readFileSync(`node_modules/three/examples/jsm/libs/basis/${file}`)
      expect(
        served.equals(installed),
        `Copy node_modules/three/examples/jsm/libs/basis/${file} to public/basis/`,
      ).toBe(true)
    })
  }
})
