'use client'

/**
 * The stage's shared state, filled once per frame before anything else in
 * the scene (docs/interaction-script.md). At rest it is the hero shot; while
 * the bite plays it runs the bite's keys over time and fires its cues: the
 * snap (the mascot shuts the jaw when `snaps` changes) and the sounds,
 * bracketed by biteStart and biteEnd so they are heard before the sound is
 * turned on (src/lib/sound/control.ts). Runs at a negative useFrame
 * priority, which keeps R3F's own rendering on.
 */
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import { BITE, crossedBiteCues, sampleBite } from '@/lib/live/bite'
import { createSample, MOUTH, restSample } from '@/lib/live/pose'
import { smoothstep } from '@/lib/math/damp'
import { playSound, soundLevels } from '@/lib/sound/bus'

export const live = {
  sample: createSample(),
  /** Kelo's mouth in the world, written by the mascot each frame (the bite aims at it). */
  mouth: new Vector3(0, MOUTH.y, MOUTH.z),
  /** Counts the bite's snaps; the mascot snaps the jaw shut when it changes. */
  snaps: 0,
  bite: { playing: false, t: 0 },
  /**
   * Kelo for the screen-space layers, tests and the keyboard button: the
   * middle of his body and the top of his head in the world, and what he
   * is doing. Written by the mascot and the behaviour controller.
   */
  kelo: {
    centre: new Vector3(0, 0.6, 0),
    top: new Vector3(0, 1.2, 0),
    feet: new Vector3(0, 0, 0),
    state: 'rest',
    reaction: '',
    /** Whether anyone has touched him yet: the hint shows until then. */
    touched: false,
  },
}

/** Start the bite unless it is already playing. */
export function startBite() {
  if (live.bite.playing) return false
  live.bite.playing = true
  live.bite.t = 0
  playSound('biteStart')
  return true
}

/** Before every other frame callback. */
export const LIVE_PRIORITY = -2

export function LiveDriver() {
  useFrame((_, delta) => {
    const { bite, sample } = live
    if (!bite.playing) {
      if (sample.biteS !== null) restSample(sample)
      soundLevels.rumble = 0
      return
    }
    const from = bite.t
    bite.t = Math.min(BITE.durationS, bite.t + Math.min(delta, 0.1))
    sampleBite(bite.t, sample)
    for (const cue of crossedBiteCues(from, bite.t)) {
      if (cue.kind === 'snap') {
        live.snaps += 1
        playSound('chomp')
      } else {
        playSound(cue.sound)
      }
    }
    soundLevels.rumble = smoothstep(1, 5, sample.scale)
    if (bite.t >= BITE.durationS) {
      bite.playing = false
      restSample(sample)
      playSound('biteEnd')
    }
  }, LIVE_PRIORITY)
  return null
}
