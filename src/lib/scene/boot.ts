/**
 * Boot sequence of the stage: the procedural egg shows while the mascot GLB
 * downloads, then hatches. Pure and time-driven so it is unit tested and
 * frame-rate independent; the phase 5 director builds on the same shape.
 *
 *   egg ──(model ready and minDisplayS elapsed)──▶ hatching ──(hatchDurationS)──▶ ready
 *
 * With reduced motion the hatch is a cut: egg goes straight to ready.
 */
import type { Character } from '@/lib/character'

export type BootPhase = 'egg' | 'hatching' | 'ready'

export interface BootState {
  phase: BootPhase
  /** Scene time (s) when hatching started, or null before it. */
  hatchStartedAtS: number | null
  /** 0 during egg, 0 to 1 while hatching, 1 when ready. */
  hatchProgress: number
}

export interface BootInput {
  /** Seconds since the stage mounted. */
  elapsedS: number
  modelReady: boolean
  reducedMotion: boolean
}

export interface BootTimings {
  minDisplayS: number
  hatchDurationS: number
}

export const initialBootState: BootState = { phase: 'egg', hatchStartedAtS: null, hatchProgress: 0 }

export function bootTimings(character: Pick<Character, 'egg'>): BootTimings {
  return { minDisplayS: character.egg.minDisplayS, hatchDurationS: character.egg.hatchDurationS }
}

/** Advance the boot state. Returns the same object when nothing changes. */
export function stepBoot(state: BootState, input: BootInput, timings: BootTimings): BootState {
  const { elapsedS, modelReady, reducedMotion } = input

  if (state.phase === 'egg') {
    if (!modelReady || elapsedS < timings.minDisplayS) return state
    if (reducedMotion || timings.hatchDurationS <= 0) {
      return { phase: 'ready', hatchStartedAtS: elapsedS, hatchProgress: 1 }
    }
    return { phase: 'hatching', hatchStartedAtS: elapsedS, hatchProgress: 0 }
  }

  if (state.phase === 'hatching') {
    const start = state.hatchStartedAtS ?? elapsedS
    const progress = Math.min(1, Math.max(0, (elapsedS - start) / timings.hatchDurationS))
    if (progress >= 1) return { phase: 'ready', hatchStartedAtS: start, hatchProgress: 1 }
    if (progress === state.hatchProgress) return state
    return { phase: 'hatching', hatchStartedAtS: start, hatchProgress: progress }
  }

  return state
}
