/**
 * The scene director: a pure, time-driven state machine, shaped like the
 * boot sequence it builds on. It decides where Kelo looks, which idle clip
 * plays, which face it pulls and when it reacts. It owns no three.js objects
 * and mutates one memory object, so it is unit tested and allocation-free.
 *
 *   egg ──▶ hatch ──▶ tracking ──▶ scroll (phase 6, not entered yet)
 *
 * Attention in tracking, highest priority first: a hovered or focused
 * data-gaze-target (the CTA), an active pointer, then idle. Idle faces the
 * camera with an occasional glance; on touch-first devices it hands the head
 * to the look_around clip instead. Reduced motion keeps idle still.
 */
import type { Character } from '@/lib/character'
import { between, type Random } from '@/lib/math/random'
import type { BootPhase } from '@/lib/scene/boot'

export type DirectorState = 'egg' | 'hatch' | 'tracking' | 'scroll'
export type Attention = 'camera' | 'pointer' | 'cta' | 'glance'
export type PointerKind = 'mouse' | 'pen' | 'touch'
export type Expression = 'neutral' | 'happy' | 'surprised' | 'roar'

export interface DirectorInput {
  nowS: number
  bootPhase: BootPhase
  /** Latest pointer activity anywhere on the page, or null before any. */
  pointer: { kind: PointerKind; lastActiveS: number } | null
  /** A data-gaze-target element is hovered or has keyboard focus. */
  ctaActive: boolean
  /** Time of the latest click or tap that landed on Kelo, or null. */
  tapS: number | null
  reducedMotion: boolean
  /** Coarse primary pointer: a phone or tablet, even before the first touch. */
  touchFirst: boolean
}

export interface DirectorOutput {
  state: DirectorState
  attention: Attention
  /** Glance direction in normalised screen units (-1 to 1), used when attention is glance. */
  glance: { x: number; y: number }
  /** Target weight of the gaze and life layers, 0 to 1; the rig damps towards it. */
  gazeWeight: number
  idleClip: 'idle' | 'look_around'
  expression: Expression
  /** A reaction to start on this step; reported once. */
  reaction: 'hop' | null
}

export interface DirectorSettings {
  returnToCameraAfterS: number
  lookAroundIntervalS: readonly [number, number]
  glanceHoldS: number
  /** How long the surprised face lasts after a hop: the jump clip's length. */
  hopS: number
  reducedMotionIdleClip: 'idle' | 'look_around'
}

/** While look_around leads the head, gaze keeps only a light hold on it. */
export const LOOK_AROUND_GAZE_WEIGHT = 0.25

export interface DirectorMemory {
  out: DirectorOutput
  idleSinceS: number
  nextGlanceS: number
  glanceUntilS: number
  handledTapS: number
  surprisedUntilS: number
}

export function directorSettings(
  character: Pick<Character, 'gaze' | 'clips' | 'accessibility'>,
): DirectorSettings {
  const jump = character.clips.required.find((clip) => clip.name === 'jump')
  return {
    returnToCameraAfterS: character.gaze.idle.returnToCameraAfterS,
    lookAroundIntervalS: character.gaze.idle.lookAroundIntervalS,
    glanceHoldS: character.gaze.idle.glanceHoldS,
    hopS: jump?.durationS ?? 0.8,
    reducedMotionIdleClip:
      character.accessibility.reducedMotion.idleClip === 'look_around' ? 'look_around' : 'idle',
  }
}

export function createDirector(): DirectorMemory {
  return {
    out: {
      state: 'egg',
      attention: 'camera',
      glance: { x: 0, y: 0 },
      gazeWeight: 0,
      idleClip: 'idle',
      expression: 'neutral',
      reaction: null,
    },
    idleSinceS: -Infinity,
    nextGlanceS: Infinity,
    glanceUntilS: -Infinity,
    handledTapS: -Infinity,
    surprisedUntilS: -Infinity,
  }
}

function stateFor(phase: BootPhase): DirectorState {
  if (phase === 'egg') return 'egg'
  if (phase === 'hatching') return 'hatch'
  return 'tracking'
}

/** Advance the director. Mutates and returns `memory.out`. */
export function stepDirector(
  memory: DirectorMemory,
  input: DirectorInput,
  settings: DirectorSettings,
  random: Random,
): DirectorOutput {
  const out = memory.out
  const { nowS } = input
  out.state = stateFor(input.bootPhase)
  out.reaction = null

  // Clicks inside the egg or mid-hatch are consumed, never replayed later.
  if (input.tapS !== null && input.tapS > memory.handledTapS) {
    memory.handledTapS = input.tapS
    if (out.state === 'tracking') {
      out.reaction = 'hop'
      memory.surprisedUntilS = nowS + settings.hopS
    }
  }

  if (out.state !== 'tracking') {
    out.attention = 'camera'
    out.gazeWeight = 0
    out.idleClip = 'idle'
    out.expression = out.state === 'hatch' ? 'surprised' : 'neutral'
    memory.idleSinceS = -Infinity
    return out
  }

  const pointerActive =
    input.pointer !== null && nowS - input.pointer.lastActiveS < settings.returnToCameraAfterS
  const engaged = input.ctaActive || pointerActive
  const touch = input.touchFirst || input.pointer?.kind === 'touch'

  if (engaged) {
    out.attention = input.ctaActive ? 'cta' : 'pointer'
    out.idleClip = 'idle'
    memory.idleSinceS = -Infinity
    memory.glanceUntilS = -Infinity
  } else {
    if (memory.idleSinceS === -Infinity) {
      // Just went idle: face the camera for a while before the first glance.
      memory.idleSinceS = nowS
      memory.nextGlanceS = nowS + between(settings.lookAroundIntervalS, random)
    }
    if (input.reducedMotion) {
      out.attention = 'camera'
      out.idleClip = settings.reducedMotionIdleClip
    } else if (touch) {
      out.attention = 'camera'
      out.idleClip = 'look_around'
    } else {
      out.idleClip = 'idle'
      if (nowS >= memory.glanceUntilS && nowS >= memory.nextGlanceS) {
        // A short look away: mostly sideways, a little more often up than down.
        const side = random() < 0.5 ? -1 : 1
        out.glance.x = side * (0.35 + 0.35 * random())
        out.glance.y = -0.15 + 0.5 * random()
        memory.glanceUntilS = nowS + settings.glanceHoldS
        memory.nextGlanceS = memory.glanceUntilS + between(settings.lookAroundIntervalS, random)
      }
      out.attention = nowS < memory.glanceUntilS ? 'glance' : 'camera'
    }
  }

  out.gazeWeight = out.idleClip === 'look_around' ? LOOK_AROUND_GAZE_WEIGHT : 1
  out.expression = nowS < memory.surprisedUntilS ? 'surprised' : 'happy'
  return out
}
