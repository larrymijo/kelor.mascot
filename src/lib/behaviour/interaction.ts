/**
 * How Kelo reads touches and clicks (docs/interaction-script.md). Pure and
 * unit tested: the runtime feeds it events and it answers with what to do.
 *
 * - A press on Kelo that lifts before moving dragThresholdPx is a tap. Taps
 *   less than streakS apart build a streak, and each plays the reaction for
 *   its place in it: a giggle, a hop, a stare, then grumpier and grumpier.
 * - On desktop the tap numbered biteAt makes him bite the screen, and the
 *   streak starts over. With reduced motion he snaps his jaw in place
 *   instead. Touch screens keep repeating the last reaction, and their tap
 *   numbered gameAt opens the pixel runner (the streak starts over).
 * - On desktop a press that moves past the threshold picks him up.
 */
import type { Character } from '@/lib/character'

export type InteractionSettings = Character['interaction']
export type Reaction = InteractionSettings['reactions'][number]
export type Action = InteractionSettings['actions'][number]

export interface Capabilities {
  /** A fine pointer that can hover, on a wide screen: dragging and the bite. */
  desktop: boolean
  reducedMotion: boolean
}

export type TapOutcome =
  | { kind: 'react'; reaction: Reaction; level: number }
  /** The full-screen bite. */
  | { kind: 'bite' }
  /** The bite in place, for reduced motion: a jaw snap and the roar face. */
  | { kind: 'snap'; reaction: Reaction }
  /** Touch screens: the grumpiest reaction, and the pixel runner opens. */
  | { kind: 'game'; reaction: Reaction }

export interface TapStreak {
  count: number
  lastS: number
}

export function createStreak(): TapStreak {
  return { count: 0, lastS: -Infinity }
}

/** Count a tap into the streak and say how Kelo answers it. Mutates `streak`. */
export function registerTap(
  streak: TapStreak,
  nowS: number,
  caps: Capabilities,
  settings: InteractionSettings,
): TapOutcome {
  streak.count = nowS - streak.lastS <= settings.taps.streakS ? streak.count + 1 : 1
  streak.lastS = nowS
  const { reactions } = settings
  const last = reactions[reactions.length - 1]!
  if (caps.desktop && streak.count >= settings.taps.biteAt) {
    streak.count = 0
    return caps.reducedMotion ? { kind: 'snap', reaction: last } : { kind: 'bite' }
  }
  if (!caps.desktop && streak.count >= settings.taps.gameAt) {
    streak.count = 0
    return { kind: 'game', reaction: last }
  }
  const level = Math.min(streak.count, reactions.length)
  return { kind: 'react', reaction: reactions[level - 1]!, level }
}

/**
 * Whether a tap now would be the bite (or its reduced-motion snap): the one
 * press the audio engine has to wake for, since browsers start audio only
 * inside a press.
 */
export function nextTapBites(
  streak: TapStreak,
  nowS: number,
  caps: Capabilities,
  settings: InteractionSettings,
) {
  return (
    caps.desktop &&
    nowS - streak.lastS <= settings.taps.streakS &&
    streak.count + 1 >= settings.taps.biteAt
  )
}

/** Dragging and the bite need a fine pointer that hovers, on a wide screen. */
export function isDesktop(
  device: { finePointer: boolean; canHover: boolean; widthPx: number },
  settings: InteractionSettings,
) {
  return device.finePointer && device.canHover && device.widthPx >= settings.desktop.minWidthPx
}

export interface Press {
  x: number
  y: number
}

/** Whether a press on Kelo has turned into a drag: desktop only, past the threshold. */
export function isDrag(
  press: Press,
  x: number,
  y: number,
  caps: Capabilities,
  settings: InteractionSettings,
) {
  return caps.desktop && Math.hypot(x - press.x, y - press.y) > settings.taps.dragThresholdPx
}
