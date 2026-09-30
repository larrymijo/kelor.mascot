/**
 * Kelo Run, the pixel runner a phone opens on the ninth tap in a row
 * (docs/interaction-script.md): Kelo runs right to left across an old-school
 * screen and jumps over bugs; later, glitch moths fly at head height, where
 * a jump runs into them. Pure and deterministic given its random source, so
 * it is unit tested; RunnerGame draws it and feeds it presses.
 *
 * Units are the screen's pixels (WIDTH x HEIGHT) and seconds, y grows down.
 */

export const WIDTH = 240
export const HEIGHT = 100
/** The top of the ground line: Kelo's feet and the bugs stand on it. */
export const GROUND_Y = 84
export const PLAYER = { x: 22, width: 18, height: 16 } as const

const GRAVITY = 1150
const JUMP_SPEED = 340
/** Letting go early cuts the jump short: its upward speed drops to this. */
const SHORT_HOP_SPEED = 150
const SPEED = { start: 95, perSecond: 2.4, max: 235 }
/** Points per pixel run: about 10 a second at the start. */
const POINTS_PER_PX = 0.105
/** Moths start flying once the score passes this. */
const MOTHS_FROM = 250
/** Collisions forgive this many pixels on every side. */
const FORGIVE = 2
/** After a crash, presses restart only after this long. */
const RESTART_AFTER_S = 0.45

export type Phase = 'ready' | 'running' | 'over'
export type ObstacleKind = 'bug' | 'bigBug' | 'bugPair' | 'moth'

export const OBSTACLES: Record<ObstacleKind, { width: number; height: number; lift: number }> = {
  bug: { width: 12, height: 9, lift: 0 },
  bigBug: { width: 14, height: 12, lift: 0 },
  bugPair: { width: 24, height: 9, lift: 0 },
  // Just above a standing Kelo's head: harmless on the ground, deadly in a jump.
  moth: { width: 12, height: 8, lift: PLAYER.height + 3 },
}

export interface Obstacle {
  kind: ObstacleKind
  x: number
  /** Top edge. */
  y: number
}

export interface RunnerState {
  phase: Phase
  /** Seconds since the run started, and since the last phase change. */
  time: number
  phaseTime: number
  speed: number
  score: number
  best: number
  /** Kelo's top edge and vertical speed (negative is up). */
  y: number
  vy: number
  grounded: boolean
  holding: boolean
  obstacles: Obstacle[]
  /** Pixels to run before the next obstacle appears. */
  untilNext: number
  /** How far the ground has scrolled, for its pebbles and the parallax. */
  scroll: number
}

export type RunnerEvent = 'jump' | 'point' | 'crash'
export type Random = () => number

const standingY = GROUND_Y - PLAYER.height

export function createRunner(best = 0): RunnerState {
  return {
    phase: 'ready',
    time: 0,
    phaseTime: 0,
    speed: SPEED.start,
    score: 0,
    best,
    y: standingY,
    vy: 0,
    grounded: true,
    holding: false,
    obstacles: [],
    untilNext: WIDTH * 0.6,
    scroll: 0,
  }
}

function restart(state: RunnerState) {
  Object.assign(state, createRunner(state.best), { phase: 'running' as Phase })
}

/**
 * A press (a tap, Space or the up arrow): starts the run, jumps while
 * running, restarts after a crash once the crash has sunk in.
 * Returns the events it caused.
 */
export function press(state: RunnerState): RunnerEvent[] {
  state.holding = true
  if (state.phase === 'ready') {
    state.phase = 'running'
    state.phaseTime = 0
    return jump(state)
  }
  if (state.phase === 'over') {
    if (state.phaseTime < RESTART_AFTER_S) return []
    restart(state)
    return []
  }
  return jump(state)
}

function jump(state: RunnerState): RunnerEvent[] {
  if (!state.grounded) return []
  state.vy = -JUMP_SPEED
  state.grounded = false
  return ['jump']
}

/** The press ended: a jump still rising is cut short, for small hops. */
export function release(state: RunnerState) {
  state.holding = false
  if (state.phase === 'running' && state.vy < -SHORT_HOP_SPEED) state.vy = -SHORT_HOP_SPEED
}

/** How far to run before the next obstacle: never too close to clear at this speed. */
function gapAfter(state: RunnerState, width: number, random: Random) {
  const airborne = (2 * JUMP_SPEED) / GRAVITY
  const least = state.speed * airborne * 0.9 + width + 18
  return least + random() * state.speed * 1.1
}

function spawn(state: RunnerState, random: Random) {
  const roll = random()
  const kind: ObstacleKind =
    state.score >= MOTHS_FROM && roll < 0.22
      ? 'moth'
      : roll < 0.55
        ? 'bug'
        : roll < 0.8
          ? 'bigBug'
          : 'bugPair'
  const size = OBSTACLES[kind]
  state.obstacles.push({ kind, x: WIDTH + 2, y: GROUND_Y - size.height - size.lift })
  state.untilNext = gapAfter(state, size.width, random)
}

function hits(state: RunnerState, obstacle: Obstacle) {
  const size = OBSTACLES[obstacle.kind]
  return (
    PLAYER.x + FORGIVE < obstacle.x + size.width - FORGIVE &&
    PLAYER.x + PLAYER.width - FORGIVE > obstacle.x + FORGIVE &&
    state.y + FORGIVE < obstacle.y + size.height - FORGIVE &&
    state.y + PLAYER.height - FORGIVE > obstacle.y + FORGIVE
  )
}

/** One fixed step of the game. Returns what happened, for the sounds. */
export function stepRunner(state: RunnerState, dt: number, random: Random = Math.random) {
  const events: RunnerEvent[] = []
  state.phaseTime += dt
  if (state.phase !== 'running') return events

  state.time += dt
  state.speed = Math.min(SPEED.max, SPEED.start + SPEED.perSecond * state.time)
  const run = state.speed * dt
  state.scroll += run

  // Kelo: gravity while airborne, landing on the ground line.
  if (!state.grounded) {
    state.vy += GRAVITY * dt
    state.y += state.vy * dt
    if (state.y >= standingY) {
      state.y = standingY
      state.vy = 0
      state.grounded = true
    }
  }

  // The bugs and moths come at him; the ones behind him leave.
  for (const obstacle of state.obstacles) obstacle.x -= run
  state.obstacles = state.obstacles.filter((o) => o.x + OBSTACLES[o.kind].width > -4)
  state.untilNext -= run
  if (state.untilNext <= 0) spawn(state, random)

  const before = Math.floor(state.score / 100)
  state.score += run * POINTS_PER_PX
  if (Math.floor(state.score / 100) > before) events.push('point')

  if (state.obstacles.some((o) => hits(state, o))) {
    state.phase = 'over'
    state.phaseTime = 0
    state.best = Math.max(state.best, Math.floor(state.score))
    events.push('crash')
  }
  return events
}
