import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import { buildLadder, type LadderSettings } from './ladder'

const settings: LadderSettings = {
  tiers: character.quality.tiers,
  dprSteps: character.quality.dprSteps,
}
const show = (rungs: ReturnType<typeof buildLadder>) => rungs.map((r) => `${r.tier}@${r.dpr}`)

describe('quality ladder', () => {
  it('steps the resolution down before the tier on a 150% laptop screen', () => {
    expect(show(buildLadder('medium', 1.5, settings))).toEqual([
      'medium@1.5',
      'medium@1.25',
      'medium@1',
      'low@1',
    ])
  })

  it('keeps high at its floor, then hands over to medium, on a strong GPU at 200%', () => {
    expect(show(buildLadder('high', 2, settings))).toEqual([
      'high@2',
      'high@1.5',
      'medium@1.5',
      'medium@1.25',
      'medium@1',
      'low@1',
    ])
  })

  it('never renders above the device pixel ratio or the tier maximum', () => {
    for (const device of [1, 1.25, 1.5, 1.75, 2, 3]) {
      for (const boot of ['low', 'medium', 'high'] as const) {
        for (const rung of buildLadder(boot, device, settings)) {
          expect(rung.dpr).toBeLessThanOrEqual(device)
          expect(rung.dpr).toBeLessThanOrEqual(character.quality.tiers[rung.tier].dprMax)
        }
      }
    }
  })

  it('never climbs above the boot tier, and never raises the resolution on the way down', () => {
    const rungs = buildLadder('medium', 3, settings)
    expect(rungs.every((r) => r.tier !== 'high')).toBe(true)
    rungs.slice(1).forEach((r, i) => expect(r.dpr).toBeLessThanOrEqual(rungs[i]!.dpr))
  })

  it('starts at the device ratio when it sits between steps, and has one step at 100%', () => {
    expect(show(buildLadder('medium', 1.75, settings))[0]).toBe('medium@1.5')
    expect(show(buildLadder('medium', 1.1, settings))[0]).toBe('medium@1.1')
    expect(show(buildLadder('medium', 1, settings))).toEqual(['medium@1', 'low@1'])
    expect(show(buildLadder('low', 2, settings))).toEqual(['low@1'])
  })
})
