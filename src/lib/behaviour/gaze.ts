/**
 * Gaze math: pure numbers, no three.js, so it is unit tested and the rig only
 * turns the results into quaternions.
 *
 * Conventions match the contract rig: a bone at rest looks along its local +Z,
 * +Y is up. Yaw turns about +Y (positive towards +X, the character's left),
 * pitch is positive when looking up. The rig rotates by -pitch about local +X,
 * because a positive +X rotation looks down (the same axis closes the lids).
 */
import { damp } from '@/lib/math/damp'

export interface Angles {
  yaw: number
  pitch: number
}

/** Yaw and pitch of a direction expressed in the bone's rest frame. */
export function aimAngles(x: number, y: number, z: number, out: Angles): Angles {
  out.yaw = Math.atan2(x, z)
  out.pitch = Math.atan2(y, Math.hypot(x, z))
  return out
}

/** Share of the limit that stays exactly linear. */
export const SOFT_KNEE = 0.7

/**
 * Soft limit: exact up to 70% of ±max, so the gaze lands on targets well
 * inside its range, then easing into the limit instead of stopping dead, so a
 * head reaching it settles rather than snaps. Smooth at the knee: the tanh
 * above it starts with slope 1.
 */
export function softClamp(value: number, max: number) {
  if (max <= 0) return 0
  const knee = max * SOFT_KNEE
  const size = Math.abs(value)
  if (size <= knee) return value
  const room = max - knee
  return Math.sign(value) * (knee + room * Math.tanh((size - knee) / room))
}

export function clampAngles(angles: Angles, maxYaw: number, maxPitch: number, out: Angles) {
  out.yaw = softClamp(angles.yaw, maxYaw)
  out.pitch = softClamp(angles.pitch, maxPitch)
  return out
}

/** Frame-rate independent approach of `current` to `target`, in place. */
export function dampAngles(current: Angles, target: Angles, lambda: number, dt: number) {
  current.yaw = damp(current.yaw, target.yaw, lambda, dt)
  current.pitch = damp(current.pitch, target.pitch, lambda, dt)
  return current
}

/**
 * Each link's part of the chain's total rotation. Shares come from the
 * contract and must add up to 1, so the chain turns by exactly the total.
 */
export function chainShares(links: readonly { share: number }[]) {
  const total = links.reduce((sum, link) => sum + link.share, 0)
  if (Math.abs(total - 1) > 1e-6) throw new Error(`Chain shares add up to ${total}, not 1`)
  return links.map((link) => link.share)
}
