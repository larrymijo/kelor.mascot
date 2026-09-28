/**
 * Blink scheduler. Pure and allocation-free: it mutates a small state object
 * and returns how closed the lids are, from 0 (open) to 1 (shut). Timing comes
 * from character.json gaze.blink; randomness is injected so tests replay it.
 */
import { between, type Random } from '@/lib/math/random'
import { smoothstep } from '@/lib/math/damp'

export interface BlinkSettings {
  intervalS: readonly [number, number]
  durationS: number
  doubleBlinkChance: number
}

export interface BlinkState {
  /** When the next blink starts. */
  nextAtS: number
  /** Start of the blink in progress, or -Infinity. */
  startedAtS: number
  /** Whether the blink in progress is the second of a double. */
  double: boolean
}

/** Pause between the two blinks of a double. */
export const DOUBLE_BLINK_GAP_S = 0.09

/** Share of the blink spent closing; the lid opens more slowly than it shuts. */
const CLOSING_SHARE = 0.4

export function createBlink(nowS: number, settings: BlinkSettings, random: Random): BlinkState {
  return {
    nextAtS: nowS + between(settings.intervalS, random),
    startedAtS: -Infinity,
    double: false,
  }
}

/** Lid closure `t` seconds into a blink. */
export function closureAt(t: number, durationS: number) {
  if (t < 0 || t >= durationS) return 0
  const closeS = durationS * CLOSING_SHARE
  return t < closeS ? smoothstep(0, closeS, t) : 1 - smoothstep(closeS, durationS, t)
}

/** Advance to `nowS` and return the lid closure. */
export function stepBlink(
  state: BlinkState,
  nowS: number,
  settings: BlinkSettings,
  random: Random,
) {
  if (state.startedAtS !== -Infinity && nowS >= state.startedAtS + settings.durationS) {
    const endedAtS = state.startedAtS + settings.durationS
    state.startedAtS = -Infinity
    if (!state.double && random() < settings.doubleBlinkChance) {
      state.double = true
      state.nextAtS = endedAtS + DOUBLE_BLINK_GAP_S
    } else {
      state.double = false
      state.nextAtS = endedAtS + between(settings.intervalS, random)
    }
  }
  // Start exactly on schedule, so blink timing does not depend on frame rate.
  if (state.startedAtS === -Infinity && nowS >= state.nextAtS) state.startedAtS = state.nextAtS
  return state.startedAtS === -Infinity ? 0 : closureAt(nowS - state.startedAtS, settings.durationS)
}

/** Blink as soon as possible, for reactions and the debug panel. */
export function blinkSoon(state: BlinkState, nowS: number) {
  if (state.startedAtS === -Infinity) state.nextAtS = Math.min(state.nextAtS, nowS)
}
