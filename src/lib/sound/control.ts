/**
 * Who may be heard, shared by the sound switch and the scene
 * (docs/interaction-script.md). Every visit starts in 'auto': silent, except
 * for the bite and the pixel runner. Pressing the switch turns everything on
 * ('on'); pressing it again turns everything off, those too ('off').
 *
 * The audio engine is an AudioContext and the synthesiser, a chunk of its
 * own. Browsers only start audio inside a press (Safari insists), so the
 * engine is created or woken there: by the switch, on desktop by the press
 * on Kelo that bites (the sixth in a row), and by the press that opens the
 * pixel runner (the ninth tap on a phone, the dock's button on desktop),
 * whose sounds are heard from the start too. Nothing sound-related exists
 * before the first such press.
 *
 * iPhones mute web audio with the ringer switch unless the page says it
 * plays media: once the visitor turns the sound on, it does, like a video.
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

/** Safari's audio session (iOS 17+): 'playback' plays through the ringer switch. */
function audioSession(type: 'playback' | 'auto') {
  if (typeof navigator === 'undefined') return
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (session) session.type = type
}

export function setSoundMode(next: SoundMode) {
  if (next === mode) return
  mode = next
  audioSession(next === 'on' ? 'playback' : 'auto')
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
    const created = createContext()
    context = created
    unlock(created)
    engine = import('./synth').then((m) => m.createSynth(created, mode))
  }
  void context.resume()
  void engine?.then((synth) => synth.woke())
  return true
}

/**
 * 24 kHz is plenty for growls and clacks, and halves the audio thread's work
 * while the bite plays over the busiest frames; a browser that refuses the
 * rate gets its own.
 */
function createContext() {
  try {
    return new AudioContext({ latencyHint: 'balanced', sampleRate: 24000 })
  } catch {
    return new AudioContext({ latencyHint: 'balanced' })
  }
}

/** Older iPhones only unlock audio once a sound starts inside the press: a silent sample. */
function unlock(created: AudioContext) {
  try {
    const source = created.createBufferSource()
    source.buffer = created.createBuffer(1, 1, created.sampleRate)
    source.connect(created.destination)
    source.start()
  } catch {
    // Nothing to unlock where the engine cannot play a buffer yet.
  }
}
