import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import { firstPaintUrl, upgradeUrl } from './model'
import { shouldUpgrade } from './upgrade'

describe('model URLs for progressive loading', () => {
  it('paints the lite model first on every tier', () => {
    expect(firstPaintUrl(character)).toBe('/models/mascot.lite.glb')
  })

  it('streams the full model in on medium and high only', () => {
    expect(upgradeUrl(character, 'low')).toBeNull()
    expect(upgradeUrl(character, 'medium')).toBe('/models/mascot.full.glb')
    expect(upgradeUrl(character, 'high')).toBe('/models/mascot.full.glb')
  })
})

describe('shouldUpgrade', () => {
  const full = '/models/mascot.full.glb'

  it('upgrades when the tier wants it and the connection says nothing', () => {
    expect(shouldUpgrade(full)).toBe(true)
    expect(shouldUpgrade(full, { effectiveType: '4g' })).toBe(true)
    expect(shouldUpgrade(full, { effectiveType: '3g', saveData: false })).toBe(true)
  })

  it('never upgrades when the tier stays on lite', () => {
    expect(shouldUpgrade(null)).toBe(false)
    expect(shouldUpgrade(null, { effectiveType: '4g' })).toBe(false)
  })

  it('respects save-data and 2G-class connections', () => {
    expect(shouldUpgrade(full, { saveData: true })).toBe(false)
    expect(shouldUpgrade(full, { effectiveType: '2g' })).toBe(false)
    expect(shouldUpgrade(full, { effectiveType: 'slow-2g' })).toBe(false)
    // Phones and tablets keep the lite model.
    expect(shouldUpgrade(full, { effectiveType: '4g', coarsePointer: true })).toBe(false)
  })
})
