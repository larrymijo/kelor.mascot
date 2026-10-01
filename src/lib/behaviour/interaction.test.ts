import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import {
  createStreak,
  isDesktop,
  isDrag,
  nextTapBites,
  nextTapOpensGame,
  registerTap,
  type TapOutcome,
} from './interaction'

const settings = character.interaction
const desktop = { desktop: true, reducedMotion: false }
const touch = { desktop: false, reducedMotion: false }

function tapSeries(times: number[], caps = desktop) {
  const streak = createStreak()
  return times.map((t) => registerTap(streak, t, caps, settings))
}

const names = (outcomes: TapOutcome[]) =>
  outcomes.map((o) => (o.kind === 'react' ? o.reaction.name : o.kind))

describe('interaction', () => {
  it('escalates through the reactions and bites on the sixth tap on desktop', () => {
    const outcomes = tapSeries([0, 0.5, 1, 1.5, 2, 2.5])
    expect(names(outcomes)).toEqual(['giggle', 'hop', 'stare', 'grumpy', 'grumpier', 'bite'])
  })

  it('starts the streak over after the bite', () => {
    const outcomes = tapSeries([0, 0.5, 1, 1.5, 2, 2.5, 3])
    expect(outcomes.at(-1)).toMatchObject({ kind: 'react', level: 1 })
  })

  it('starts over when the taps are further apart than the streak window', () => {
    const outcomes = tapSeries([0, 1, 1 + settings.taps.streakS + 0.1])
    expect(names(outcomes)).toEqual(['giggle', 'hop', 'giggle'])
  })

  it('knows which press will bite, so only that one wakes the audio engine', () => {
    const streak = createStreak()
    const bites: boolean[] = []
    for (const t of [0, 0.5, 1, 1.5, 2, 2.5]) {
      bites.push(nextTapBites(streak, t, desktop, settings))
      registerTap(streak, t, desktop, settings)
    }
    expect(bites).toEqual([false, false, false, false, false, true])
    // The streak has started over, it has run out, or the screen never bites.
    expect(nextTapBites(streak, 3, desktop, settings)).toBe(false)
    for (const t of [3, 3.5, 4, 4.5, 5]) registerTap(streak, t, desktop, settings)
    expect(nextTapBites(streak, 5 + settings.taps.streakS + 0.1, desktop, settings)).toBe(false)
    expect(nextTapBites(streak, 5.4, touch, settings)).toBe(false)
    expect(nextTapBites(streak, 5.4, { desktop: true, reducedMotion: true }, settings)).toBe(true)
  })

  it('knows which tap will open the runner on a touch screen, so it wakes the audio too', () => {
    const streak = createStreak()
    const opens: boolean[] = []
    for (let i = 0; i < settings.taps.gameAt; i++) {
      opens.push(nextTapOpensGame(streak, i * 0.4, touch, settings))
      registerTap(streak, i * 0.4, touch, settings)
    }
    expect(opens.indexOf(true)).toBe(settings.taps.gameAt - 1)
    expect(opens.filter(Boolean)).toHaveLength(1)
    // Desktops open it from the dock instead.
    expect(nextTapOpensGame(createStreak(), 0, desktop, settings)).toBe(false)
  })

  it('never bites as pixel art: the reactions carry on, the grumpiest again', () => {
    const pixel = { ...desktop, pixel: true }
    const outcomes = tapSeries([0, 0.4, 0.8, 1.2, 1.6, 2, 2.4], pixel)
    expect(outcomes.some((o) => o.kind === 'bite' || o.kind === 'game')).toBe(false)
    expect(names(outcomes).at(-1)).toBe('grumpier')
    const streak = createStreak()
    for (const t of [0, 0.4, 0.8, 1.2, 1.6]) registerTap(streak, t, pixel, settings)
    expect(nextTapBites(streak, 2, pixel, settings)).toBe(false)
  })

  it('opens the pixel runner on the ninth tap on touch screens, then starts over', () => {
    const times = Array.from({ length: 10 }, (_, i) => i * 0.4)
    const outcomes = tapSeries(times, touch)
    expect(outcomes[settings.taps.gameAt - 1]).toMatchObject({ kind: 'game' })
    expect(outcomes.filter((o) => o.kind === 'game')).toHaveLength(1)
    expect(outcomes.at(-1)).toMatchObject({ kind: 'react', level: 1 })
    // Desktop bites long before, and never opens the game.
    expect(tapSeries(times).some((o) => o.kind === 'game')).toBe(false)
  })

  it('never bites on touch screens: the last reaction repeats', () => {
    const outcomes = tapSeries([0, 0.4, 0.8, 1.2, 1.6, 2, 2.4, 2.8], touch)
    expect(outcomes.every((o) => o.kind === 'react')).toBe(true)
    expect(names(outcomes).slice(4)).toEqual(['grumpier', 'grumpier', 'grumpier', 'grumpier'])
  })

  it('snaps in place instead of the full-screen bite with reduced motion', () => {
    const outcomes = tapSeries([0, 0.5, 1, 1.5, 2, 2.5], { desktop: true, reducedMotion: true })
    expect(outcomes.at(-1)).toMatchObject({ kind: 'snap', reaction: { name: 'grumpier' } })
  })

  it('treats only fine, hovering pointers on wide screens as desktop', () => {
    const wide = settings.desktop.minWidthPx
    expect(isDesktop({ finePointer: true, canHover: true, widthPx: wide }, settings)).toBe(true)
    expect(isDesktop({ finePointer: true, canHover: true, widthPx: wide - 1 }, settings)).toBe(
      false,
    )
    expect(isDesktop({ finePointer: false, canHover: false, widthPx: 1400 }, settings)).toBe(false)
    expect(isDesktop({ finePointer: true, canHover: false, widthPx: 1400 }, settings)).toBe(false)
  })

  it('turns a press into a drag only past the threshold, and only on desktop', () => {
    const press = { x: 100, y: 100 }
    const edge = settings.taps.dragThresholdPx
    expect(isDrag(press, 100 + edge, 100, desktop, settings)).toBe(false)
    expect(isDrag(press, 100 + edge + 1, 100, desktop, settings)).toBe(true)
    expect(isDrag(press, 300, 300, touch, settings)).toBe(false)
  })
})
