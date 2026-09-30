import { describe, expect, it } from 'vitest'
import { ShaderChunk } from 'three'
import { softSkinLights } from './finish'

describe('softSkinLights', () => {
  it("still finds the line of three's physical lighting that it softens", () => {
    const lights = softSkinLights()
    expect(lights).not.toBeNull()
    expect(lights).not.toBe(ShaderChunk.lights_physical_pars_fragment)
    expect(lights).toContain('wrapNL')
    expect(lights).toContain('uniform float softSkinWrap;')
  })

  it('leaves plain lighting when three changes that line', () => {
    expect(softSkinLights('void main() {}')).toBeNull()
  })
})
