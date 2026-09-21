import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import { modelUrl, publicUrl, tierSettings } from './model'

describe('model URLs', () => {
  it('maps repo paths under public/ to site URLs', () => {
    expect(publicUrl('public/models/mascot.full.glb')).toBe('/models/mascot.full.glb')
    expect(() => publicUrl('assets/concept/x.png')).toThrow(/not under public/)
  })

  it('loads the lite model on low and the full model otherwise', () => {
    expect(modelUrl(character, 'low')).toBe('/models/mascot.lite.glb')
    expect(modelUrl(character, 'medium')).toBe('/models/mascot.full.glb')
    expect(modelUrl(character, 'high')).toBe('/models/mascot.full.glb')
  })

  it('exposes the tier settings from the contract', () => {
    expect(tierSettings(character, 'medium')).toMatchObject({ ao: 'half', dprMax: 1.5 })
  })
})
