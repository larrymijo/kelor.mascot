/**
 * The sounds the scene asks for, and the one continuous level it drives. The
 * synthesiser (a lazy chunk, see control.ts) listens; before it exists, cues
 * go nowhere. Tiny and dependency-free, so the 3D chunk can call it without
 * loading any audio code.
 *
 * The bite brackets its sounds with 'biteStart' and 'biteEnd': they are the
 * only sounds heard before the visitor turns the sound on.
 */

/** A tap's reaction, being carried, tossed and landing, the hatch and the runner: heard once the sound is on. */
export const LIFE_SOUNDS = [
  'giggle',
  'boing',
  'hm',
  'growl',
  'roar',
  'squeak',
  'toss',
  'thud',
  'pat',
  // Kelo Run, the pixel runner.
  'blip',
  'coin',
  'crash',
] as const

/** The bite, in order: heard from the start, unless the visitor turned the sound off. */
export const BITE_SOUNDS = ['biteGrowl', 'lunge', 'rattle', 'chomp', 'smug'] as const

export type LifeSound = (typeof LIFE_SOUNDS)[number]
export type BiteSound = (typeof BITE_SOUNDS)[number]
export type SoundCue = LifeSound | BiteSound | 'biteStart' | 'biteEnd'

type Listener = (cue: SoundCue) => void

const listeners = new Set<Listener>()

/** How much he fills the screen in the bite, 0 to 1: the hum's rumble follows it. */
export const soundLevels = { rumble: 0 }

/** Whether the bite is playing, for a synthesiser created in the middle of it. */
export const soundState = { biting: false }

export function playSound(cue: SoundCue) {
  if (cue === 'biteStart') soundState.biting = true
  else if (cue === 'biteEnd') soundState.biting = false
  for (const listener of listeners) listener(cue)
}

export function onSound(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
