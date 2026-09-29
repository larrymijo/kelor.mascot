import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import { acceptsDecline, buildLadder, type LadderSettings } from './ladder'

const settings: LadderSettings = {
  tiers: character.quality.tiers,
  dprSteps: character.quality.dprSteps,
}
const show = (rungs: ReturnType<typeof buildLadder>) => rungs.map((r) => `${r.tier}@${r.dpr}`)

describe('quality ladder', () => {
  it('trades resolution below 54 fps but keeps the tier until 45', () => {
    const ladder = buildLadder('medium', 1.5, settings)
    const bounds = { dprLowerFps: 54, lowerFps: 45 }
    // medium at 1.5 → medium at 1.25: a resize, taken at 50 fps.
    expect(acceptsDecline(ladder, 0, 50, bounds)).toBe(true)
    expect(acceptsDecline(ladder, 0, 56, bounds)).toBe(false)
    // medium at 1 → low at 1: the look changes, so 50 fps is not enough reason.
    const floor = ladder.findIndex((r) => r.tier === 'medium' && r.dpr === 1)
    expect(ladder[floor + 1]).toEqual({ tier: 'low', dpr: 1 })
    expect(acceptsDecline(ladder, floor, 50, bounds)).toBe(false)
    expect(acceptsDecline(ladder, floor, 40, bounds)).toBe(true)
    // Nothing below the last step.
    expect(acceptsDecline(ladder, ladder.length - 1, 10, bounds)).toBe(false)
  })

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
