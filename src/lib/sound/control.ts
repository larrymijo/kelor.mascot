/**
 * Who may be heard, shared by the sound switch and the scene
 * (docs/interaction-script.md). Every visit starts in 'auto': silent, except
 * for the bite. Pressing the switch turns everything on ('on'); pressing it
 * again turns everything off, the bite too ('off').
 *
 * The audio engine is an AudioContext and the synthesiser, a chunk of its
 * own. Browsers only start audio inside a press (Safari insists), so the
 * engine is created or woken there: by the switch, or on desktop by the
 * press on Kelo that bites (the sixth in a row). Nothing sound-related
 * exists before the first such press.
 */
import type { Synth } from './synth'

export type SoundMode = 'auto' | 'on' | 'off'

let mode: SoundMode = 'auto'
let context: AudioContext | null = null
let engine: Promise<Synth> | null = null
const listeners = new Set<() => void>()

export function soundMode() {
  return mode
}

/** For useSyncExternalStore. */
export function onSoundMode(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setSoundMode(next: SoundMode) {
  if (next === mode) return
  mode = next
  for (const listener of listeners) listener()
  void engine?.then((synth) => synth.setMode(next))
}

/**
 * Load the synthesiser's code ahead of the press that bites, without any
 * audio, so the engine it creates is ready for the bite's first sound.
 */
export function preloadAudio() {
  if (mode !== 'off') void import('./synth')
}

/**
 * Call inside a press. Creates the audio engine on the first call and wakes it
 * on later ones, unless the visitor turned the sound off. Returns whether an
 * engine exists.
 */
export function wakeAudio() {
  if (mode === 'off' || typeof window === 'undefined' || !('AudioContext' in window)) return false
  if (!context) {
    // 24 kHz is plenty for growls and clacks, and halves the audio thread's work
    // while the bite plays over the busiest frames.
    const created = new AudioContext({ latencyHint: 'balanced', sampleRate: 24000 })
    context = created
    engine = import('./synth').then((m) => m.createSynth(created, mode))
  }
  void context.resume()
  void engine?.then((synth) => synth.woke())
  return true
}
