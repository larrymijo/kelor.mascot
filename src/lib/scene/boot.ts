/**
 * Boot sequence of the stage (docs/interaction-script.md). The page opens on
 * a dark, empty stage; the visitor's click (or tap, or the drop button)
 * drops the egg, which falls, lands and waits while the mascot GLB finishes
 * downloading, then hatches. Pure and time-driven so it is unit tested and
 * frame-rate independent.
 *
 *   waiting ──(drop)──▶ egg ──(model ready and minDisplayS since the drop)──▶
 *   hatching ──(hatchDurationS)──▶ ready
 *
 * The model starts loading at once, so by the time the egg has landed it
 * is usually there. With reduced motion the hatch is a cut: egg goes
 * straight to ready.
 */
import type { Character } from '@/lib/character'

export type BootPhase = 'waiting' | 'egg' | 'hatching' | 'ready'

export interface BootState {
  phase: BootPhase
  /** Scene time (s) when the egg was dropped, or null before it. */
  droppedAtS: number | null
  /** Scene time (s) when hatching started, or null before it. */
  hatchStartedAtS: number | null
  /** 0 before and during the egg, 0 to 1 while hatching, 1 when ready. */
  hatchProgress: number
}

export interface BootInput {
  /** Seconds since the stage mounted. */
  elapsedS: number
  modelReady: boolean
  reducedMotion: boolean
  /** The visitor has asked for the egg. */
  dropRequested: boolean
}

export interface BootTimings {
  /** The egg shows at least this long after its drop: the fall, the landing, a wobble. */
  minDisplayS: number
  hatchDurationS: number
}

export const initialBootState: BootState = {
  phase: 'waiting',
  droppedAtS: null,
  hatchStartedAtS: null,
  hatchProgress: 0,
}

export function bootTimings(character: Pick<Character, 'egg'>): BootTimings {
  return { minDisplayS: character.egg.minDisplayS, hatchDurationS: character.egg.hatchDurationS }
}

/** Before the hatch: nothing yet, or the egg. Kelo is hidden in both. */
export function beforeHatch(phase: BootPhase) {
  return phase === 'waiting' || phase === 'egg'
}

/** Advance the boot state. Returns the same object when nothing changes. */
export function stepBoot(state: BootState, input: BootInput, timings: BootTimings): BootState {
  const { elapsedS, modelReady, reducedMotion, dropRequested } = input

  if (state.phase === 'waiting') {
    if (!dropRequested) return state
    return { ...state, phase: 'egg', droppedAtS: elapsedS }
  }

  if (state.phase === 'egg') {
    const since = elapsedS - (state.droppedAtS ?? elapsedS)
    if (!modelReady || since < timings.minDisplayS) return state
    if (reducedMotion || timings.hatchDurationS <= 0) {
      return { ...state, phase: 'ready', hatchStartedAtS: elapsedS, hatchProgress: 1 }
    }
    return { ...state, phase: 'hatching', hatchStartedAtS: elapsedS, hatchProgress: 0 }
  }

  if (state.phase === 'hatching') {
    const start = state.hatchStartedAtS ?? elapsedS
    const progress = Math.min(1, Math.max(0, (elapsedS - start) / timings.hatchDurationS))
    if (progress >= 1) return { ...state, phase: 'ready', hatchStartedAtS: start, hatchProgress: 1 }
    if (progress === state.hatchProgress) return state
    return { ...state, hatchStartedAtS: start, hatchProgress: progress }
  }

  return state
}
