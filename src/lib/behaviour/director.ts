/**
 * The scene director: a pure, time-driven state machine, shaped like the
 * boot sequence it builds on. It decides where Kelo looks, which idle clip
 * plays, which face it pulls and when it reacts. It owns no three.js objects
 * and mutates one memory object, so it is unit tested and allocation-free.
 *
 *   egg ──▶ hatch ──▶ tracking ⇄ acting
 *
 * acting is while an interaction leads (docs/interaction-script.md): a
 * reaction to a tap, being carried, the bite. It may impose Kelo's look and
 * face, and he never plays look_around. Taps themselves are read by
 * interaction.ts; the director only hears what they impose.
 *
 * Attention in tracking, highest priority first: a hovered or focused
 * data-gaze-target (the CTA), an active pointer, then idle. Idle faces the
 * camera with an occasional glance; on touch-first devices it hands the head
 * to the look_around clip instead. Reduced motion keeps idle still.
 */
import type { Character } from '@/lib/character'
import { between, type Random } from '@/lib/math/random'
import type { BootPhase } from '@/lib/scene/boot'

export type DirectorState = 'egg' | 'hatch' | 'tracking' | 'acting'
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
  reducedMotion: boolean
  /** Coarse primary pointer: a phone or tablet, even before the first touch. */
  touchFirst: boolean
  /**
   * What an interaction imposes while it leads (a reaction, being carried,
   * the bite); null keeps the director on its own. A null field leaves that
   * choice free.
   */
  override?: {
    gaze: 'camera' | null
    expression: Expression | null
  } | null
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
}

export interface DirectorSettings {
  returnToCameraAfterS: number
  lookAroundIntervalS: readonly [number, number]
  glanceHoldS: number
  reducedMotionIdleClip: 'idle' | 'look_around'
}

/** While look_around leads the head, gaze keeps only a light hold on it. */
export const LOOK_AROUND_GAZE_WEIGHT = 0.25

export interface DirectorMemory {
  out: DirectorOutput
  idleSinceS: number
  nextGlanceS: number
  glanceUntilS: number
}

export function directorSettings(
  character: Pick<Character, 'gaze' | 'accessibility'>,
): DirectorSettings {
  return {
    returnToCameraAfterS: character.gaze.idle.returnToCameraAfterS,
    lookAroundIntervalS: character.gaze.idle.lookAroundIntervalS,
    glanceHoldS: character.gaze.idle.glanceHoldS,
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
    },
    idleSinceS: -Infinity,
    nextGlanceS: Infinity,
    glanceUntilS: -Infinity,
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

  if (out.state !== 'tracking') {
    out.attention = 'camera'
    out.gazeWeight = 0
    out.idleClip = 'idle'
    out.expression = out.state === 'hatch' ? 'surprised' : 'neutral'
    memory.idleSinceS = -Infinity
    return out
  }

  const override = input.override ?? null
  if (override) out.state = 'acting'
  // An interaction may lock his eyes on the viewer.
  if (override?.gaze === 'camera') {
    out.attention = 'camera'
    out.idleClip = 'idle'
    out.gazeWeight = 1
    memory.idleSinceS = -Infinity
    memory.glanceUntilS = -Infinity
    out.expression = override.expression ?? 'happy'
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
    } else if (touch && !override) {
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
  out.expression = override?.expression ?? 'happy'
  return out
}
