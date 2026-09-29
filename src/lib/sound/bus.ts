/**
 * The sounds the scene asks for, and the one continuous level it drives. The
 * synthesiser (a lazy chunk, loaded on the first press of the sound switch)
 * listens; before that, and while the sound is off, cues go nowhere. Tiny and
 * dependency-free, so the 3D chunk can call it without loading any audio code.
 */
export type SoundCue = 'boop' | 'growl' | 'whoosh' | 'gulp' | 'thud'

type Listener = (cue: SoundCue) => void

const listeners = new Set<Listener>()

/** How much he fills the screen in the bite, 0 to 1: the hum's rumble follows it. */
export const soundLevels = { rumble: 0 }

export function playSound(cue: SoundCue) {
  for (const listener of listeners) listener(cue)
}

export function onSound(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
