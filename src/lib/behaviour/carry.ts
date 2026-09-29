/**
 * Being picked up, carried, dropped and tossed (docs/interaction-script.md).
 * Pure and allocation-free physics for Kelo's root on the stage plane, run in
 * fixed 1/240 s steps from an accumulator, so every frame rate sees exactly
 * the same motion.
 *
 * - Held: his grab point follows the pointer on a critically damped spring,
 *   smooth even when the mouse jerks. His body hangs from it like a damped
 *   pendulum, swinging opposite to the hand's sideways acceleration, and
 *   leans with its vertical speed. Fast motion stretches him a little.
 * - In the air: he keeps the hand's velocity (capped), gravity and drag pull
 *   on him, and the screen edges bounce him back.
 * - Landing: he bounces while the impact is hard enough, then settles; every
 *   impact squashes him and a spring brings him back to shape.
 *
 * Positions are the feet, in metres; x is sideways, y is up from the floor.
 */
import type { Character } from '@/lib/character'
import { stepSpring, type Spring } from './tail'

export type CarrySettings = Pick<Character['interaction'], 'carry' | 'fall' | 'hop'>
export type CarryMode = 'rest' | 'held' | 'air'

export interface Bounds {
  /** Where the feet may go, already inside the screen by his size and the margin. */
  xMin: number
  xMax: number
  yMax: number
}

export interface CarryBody {
  mode: CarryMode
  x: number
  y: number
  vx: number
  vy: number
  /** Height of the grab point above the feet. */
  grabY: number
  /** Where the pointer wants the grab point, while held. */
  targetX: number
  targetY: number
  /** Swing of the body about the grab point (rad); positive puts the feet towards +x. */
  swing: Spring
  /** Lean forwards (rad) with the hand's vertical speed. */
  lean: Spring
  /** Height scale: 1 at rest, below when squashed, above when stretched. */
  squash: Spring
  /** A hop lands planted: no bounce and no slide, right on its spot. */
  planted: boolean
  /** Set on the step of a landing, with the impact speed; the caller clears it. */
  landed: number
  /** Unspent time, below one step. */
  acc: number
}

const STEP_S = 1 / 240
const TWO_PI = Math.PI * 2
const rad = (deg: number) => (deg * Math.PI) / 180
/** Slower than this, a fall ends instead of bouncing again (m/s). */
const SETTLE_MPS = 0.55
/** Squash per m/s of impact, before the landSquash limit. */
const SQUASH_PER_MPS = 0.07
/** Lean per m/s of the hand's vertical speed (rad). */
const LEAN_PER_MPS = 0.18

export function createBody(x = 0): CarryBody {
  return {
    mode: 'rest',
    x,
    y: 0,
    vx: 0,
    vy: 0,
    grabY: 0.8,
    targetX: x,
    targetY: 0.8,
    swing: { angle: 0, velocity: 0 },
    lean: { angle: 0, velocity: 0 },
    squash: { angle: 1, velocity: 0 },
    planted: false,
    landed: 0,
    acc: 0,
  }
}

/** Pick him up by the point `grabY` above his feet. */
export function grab(body: CarryBody, grabY: number) {
  body.mode = 'held'
  body.planted = false
  body.grabY = grabY
  body.targetX = body.x
  body.targetY = body.y + grabY
}

/** Where the pointer holds the grab point now. */
export function holdAt(body: CarryBody, x: number, y: number) {
  body.targetX = x
  body.targetY = y
}

/** Let go: he keeps the hand's velocity, up to maxThrowMps. */
export function release(body: CarryBody, settings: CarrySettings) {
  if (body.mode !== 'held') return
  body.mode = 'air'
  const speed = Math.hypot(body.vx, body.vy)
  const cap = settings.fall.maxThrowMps
  if (speed > cap) {
    body.vx *= cap / speed
    body.vy *= cap / speed
  }
}

/**
 * A hop to `x` on the floor, peaking hop.heightM above where he stands, or
 * lower when the top of the screen is closer: he never hits the ceiling.
 */
export function hopTo(body: CarryBody, x: number, bounds: Bounds, settings: CarrySettings) {
  if (body.mode === 'held') return
  const g = settings.fall.gravity
  const to = Math.min(bounds.xMax, Math.max(bounds.xMin, x))
  const apex = Math.max(0.03, Math.min(settings.hop.heightM, 0.9 * bounds.yMax - body.y))
  const up = Math.sqrt(2 * g * apex)
  // Time up to the apex and down again to the floor.
  const flight = up / g + Math.sqrt((2 * (apex + body.y)) / g)
  body.mode = 'air'
  body.planted = true
  body.vy = up
  body.vx = (to - body.x) / flight
}

/** Advance the physics by `dt` seconds. Mutates and returns `body`. */
export function stepBody(body: CarryBody, dt: number, bounds: Bounds, settings: CarrySettings) {
  body.acc += Math.min(dt, 0.25)
  while (body.acc >= STEP_S) {
    body.acc -= STEP_S
    step(body, STEP_S, bounds, settings)
  }
  return body
}

function step(body: CarryBody, h: number, bounds: Bounds, settings: CarrySettings) {
  const { carry, fall } = settings
  let ax = 0
  let ay = 0

  if (body.mode === 'held') {
    // The grab point chases the pointer, critically damped.
    const w = TWO_PI * carry.followHz
    ax = w * w * (body.targetX - body.x) - 2 * w * body.vx
    ay = w * w * (body.targetY - body.grabY - body.y) - 2 * w * body.vy
    body.vx += ax * h
    body.vy += ay * h
  } else if (body.mode === 'air') {
    body.vy -= fall.gravity * h
    // A hop is a jump, not a toss: no drag, so it lands where it aimed.
    const drag = body.planted ? 1 : Math.exp(-fall.airDrag * h)
    body.vx *= drag
    body.vy *= drag
  } else {
    body.vx *= Math.exp(-fall.friction * h)
    body.vy = 0
  }
  body.x += body.vx * h
  body.y += body.vy * h

  // The screen edges: held, he stops at them; flying, he bounces off them.
  const bounce = body.mode === 'air' ? fall.restitution : 0
  if (body.x < bounds.xMin) {
    body.x = bounds.xMin
    body.vx = Math.abs(body.vx) * bounce
  } else if (body.x > bounds.xMax) {
    body.x = bounds.xMax
    body.vx = -Math.abs(body.vx) * bounce
  }
  if (body.y > bounds.yMax) {
    body.y = bounds.yMax
    body.vy = -Math.abs(body.vy) * bounce
  }
  if (body.y <= 0) {
    const impact = -body.vy
    body.y = 0
    if (body.mode === 'held') {
      body.vy = Math.max(0, body.vy)
    } else if (body.mode === 'air') {
      body.landed = Math.max(body.landed, impact)
      // Squashed by the impact, never below landSquash of his height.
      const room = 1 - fall.landSquash
      body.squash.velocity -= Math.min(impact * SQUASH_PER_MPS, room) * TWO_PI * fall.squashHz
      if (impact > SETTLE_MPS && !body.planted) {
        body.vy = impact * fall.restitution
      } else {
        body.vy = 0
        if (body.planted) body.vx = 0
        body.planted = false
        body.mode = 'rest'
      }
    }
  }

  // The body: a damped pendulum under the grab point while held, easing back upright otherwise.
  const maxSwing = rad(carry.maxSwingDeg)
  if (body.mode === 'held') {
    const g = fall.gravity
    const natural = Math.sqrt(g / carry.lengthM)
    const s = body.swing
    s.velocity +=
      (-(natural * natural) * Math.sin(s.angle) -
        2 * carry.dampingRatio * natural * s.velocity -
        (ax / carry.lengthM) * Math.cos(s.angle)) *
      h
    s.angle += s.velocity * h
    if (Math.abs(s.angle) > maxSwing) {
      s.angle = Math.sign(s.angle) * maxSwing
      s.velocity *= -0.3
    }
    const lean = Math.max(-1, Math.min(1, (body.vy * LEAN_PER_MPS) / rad(carry.maxLeanDeg)))
    stepSpring(body.lean, lean * rad(carry.maxLeanDeg), 6, 0.6, h)
  } else {
    stepSpring(body.swing, 0, 5, 0.45, h)
    stepSpring(body.lean, 0, 6, 0.6, h)
  }

  // Shape: stretched along fast motion in the hand or the air, squashed by landings.
  const speed = Math.hypot(body.vx, body.vy)
  const stretch = body.mode === 'rest' ? 1 : 1 + carry.stretch * Math.min(1, speed / 3)
  stepSpring(body.squash, stretch, TWO_PI * fall.squashHz, fall.squashDamping, h)
  body.squash.angle = Math.max(fall.landSquash, Math.min(1 + carry.stretch, body.squash.angle))
}

/**
 * Where his feet may go: the visible stage at his depth, less his size and
 * the margin. Centred if the screen is narrower than he is.
 */
export function feetBounds(
  visible: { left: number; right: number; top: number },
  body: { halfWidthM: number; heightM: number },
  marginM: number,
): Bounds {
  let xMin = visible.left + body.halfWidthM + marginM
  let xMax = visible.right - body.halfWidthM - marginM
  if (xMin > xMax) xMin = xMax = (visible.left + visible.right) / 2
  const yMax = Math.max(0, visible.top - body.heightM - marginM)
  return { xMin, xMax, yMax }
}
