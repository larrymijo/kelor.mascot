import { describe, expect, it } from 'vitest'
import { detectQualityTier, stepDown, stepUp, type DeviceSignals } from './detect'

const desktop = (renderer: string, extra: Partial<DeviceSignals> = {}): DeviceSignals => ({
  webgl2: true,
  isMobile: false,
  hardwareConcurrency: 8,
  deviceMemoryGB: 8,
  renderer,
  ...extra,
})

describe('detectQualityTier', () => {
  it.each([
    ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'],
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['Apple M2', 'high'],
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 'low'],
    ['llvmpipe (LLVM 15.0.7, 256 bits)', 'low'],
    ['Some Future GPU', 'medium'],
  ] as const)('%s → %s', (renderer, tier) => {
    expect(detectQualityTier(desktop(renderer))).toBe(tier)
  })

  it('falls back to low without WebGL 2 or with Save-Data', () => {
    expect(detectQualityTier(desktop('NVIDIA GeForce RTX 4090', { webgl2: false }))).toBe('low')
    expect(detectQualityTier(desktop('NVIDIA GeForce RTX 4090', { saveData: true }))).toBe('low')
  })

  it('treats very small devices as low', () => {
    expect(detectQualityTier(desktop('Intel UHD', { deviceMemoryGB: 2 }))).toBe('low')
    expect(detectQualityTier(desktop('Intel UHD', { hardwareConcurrency: 2 }))).toBe('low')
  })

  it('never starts phones on high', () => {
    const phone = (extra: Partial<DeviceSignals>) =>
      detectQualityTier({ webgl2: true, isMobile: true, renderer: 'Apple GPU', ...extra })
    expect(phone({ hardwareConcurrency: 8, deviceMemoryGB: 8 })).toBe('medium')
    expect(phone({})).toBe('medium')
    expect(phone({ hardwareConcurrency: 4 })).toBe('low')
    expect(phone({ deviceMemoryGB: 3 })).toBe('low')
  })
})

describe('tier steps', () => {
  it('steps down and up within bounds', () => {
    expect(stepDown('high')).toBe('medium')
    expect(stepDown('low')).toBe('low')
    expect(stepUp('low')).toBe('medium')
    expect(stepUp('high')).toBe('high')
  })

  it('never steps above the ceiling', () => {
    expect(stepUp('medium', 'medium')).toBe('medium')
    expect(stepUp('low', 'medium')).toBe('medium')
    expect(stepUp('high', 'medium')).toBe('high')
  })
})
