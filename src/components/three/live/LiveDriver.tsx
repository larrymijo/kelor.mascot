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
import { DEFAULT_SIZE } from '@/lib/showcase/size'
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
    /** Counts every reaction and action, so the pixel-art Kelo hops at each. */
    acts: 0,
  },
  /**
   * The desktop sandbox's view, eased by ShowcaseDriver: the camera's orbit
   * around the hero shot (yaw and pitch in radians) and zoom (a multiple of
   * its distance), the targets the pointer and the wheel set, and Kelo's
   * turn on the spot (spin, radians).
   */
  view: {
    yaw: 0,
    pitch: 0,
    zoom: 1,
    spin: 0,
    yawTarget: 0,
    pitchTarget: 0,
    zoomTarget: 1,
    /** The size slider's position, eased (size.ts). */
    size: DEFAULT_SIZE,
  },
  /**
   * His form: whether the size slider has made him pixel art (target), and
   * how far the transformation has gone, 0 the 3D model to 1 the blocks.
   */
  form: { target: false, pixel: 0 },
  /** How much each of the sandbox's lighting looks shows, eased; they add up to 1. */
  look: { studio: 1, sunset: 0, neon: 0 },
  /**
   * The egg: where on the stage it was dropped (x, metres), and its height
   * above the floor while it falls (written by the controller and the egg).
   */
  egg: { x: 0, y: 0 },
  /** Where the layout stands Kelo across the screen, 0 to 1 (written by the camera). */
  layout: { centreX: 0.5 },
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
