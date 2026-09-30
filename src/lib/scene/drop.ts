/**
 * The egg's drop (docs/interaction-script.md): from above the top of the
 * screen it falls under gravity, lands with a squash, bounces a couple of
 * times lower and lower, and settles. Pure and fixed-step, so it is unit
 * tested and moves the same at any frame rate. Heights in metres above the
 * floor.
 */

export interface DropSettings {
  gravity: number
  /** Share of the speed kept in each bounce. */
  restitution: number
  /** Bounces slower than this (m/s) end the drop. */
  settleMps: number
  /** How much a landing squashes the egg per m/s of impact, at most maxSquash. */
  squashPerMps: number
  maxSquash: number
  /** The squash springs back at this frequency (Hz), lightly damped. */
  springHz: number
}

export interface Drop {
  y: number
  vy: number
  bounces: number
  settled: boolean
  /** 0 round; positive squashed (shorter and wider), negative stretched. */
  squash: number
  squashVelocity: number
  /** Impact speed of the last landing, for the thud; reset by the caller. */
  landed: number
  acc: number
}

const STEP = 1 / 240

export function createDrop(fromY: number): Drop {
  return {
    y: fromY,
    vy: 0,
    bounces: 0,
    settled: false,
    squash: 0,
    squashVelocity: 0,
    landed: 0,
    acc: 0,
  }
}

function step(drop: Drop, s: DropSettings) {
  if (!drop.settled) {
    drop.vy -= s.gravity * STEP
    drop.y += drop.vy * STEP
    if (drop.y <= 0) {
      const impact = -drop.vy
      drop.y = 0
      drop.landed = Math.max(drop.landed, impact)
      drop.squashVelocity +=
        Math.min(s.maxSquash, impact * s.squashPerMps) * 2 * Math.PI * s.springHz
      const rebound = impact * s.restitution
      if (rebound < s.settleMps) {
        drop.vy = 0
        drop.settled = true
      } else {
        drop.vy = rebound
        drop.bounces += 1
      }
    }
  }
  // The squash: a damped spring back to round.
  const omega = 2 * Math.PI * s.springHz
  const acceleration = -omega * omega * drop.squash - 2 * 0.3 * omega * drop.squashVelocity
  drop.squashVelocity += acceleration * STEP
  drop.squash += drop.squashVelocity * STEP
}

/** Advance the drop by `dt` seconds, in fixed steps. */
export function stepDrop(drop: Drop, dt: number, settings: DropSettings) {
  drop.acc += Math.min(dt, 0.1)
  while (drop.acc >= STEP) {
    step(drop, settings)
    drop.acc -= STEP
  }
  return drop
}
