'use client'

/**
 * The desktop sandbox's settings, eased into the shared live state every
 * frame, right after LiveDriver (docs/interaction-script.md): the lighting
 * look crossfades, the camera's orbit and zoom follow their targets, and on
 * the turntable Kelo turns slowly, easing back to face the viewer when it
 * stops. Nothing here re-renders React.
 */
import { useFrame } from '@react-three/fiber'
import { damp } from '@/lib/math/damp'
import { LIGHTINGS, showcase } from '@/lib/showcase/state'
import { useScene } from '../store'
import { live } from './LiveDriver'

/** A slow product turn: a full circle in 15 s. */
const SPIN_RAD_PER_S = (Math.PI * 2) / 15
const TWO_PI = Math.PI * 2

export const SHOWCASE_PRIORITY = -1

export function ShowcaseDriver() {
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    const settings = showcase()
    const reduced = useScene.getState().reducedMotion
    const { look, view } = live

    for (const lighting of LIGHTINGS) {
      look[lighting] = damp(look[lighting], settings.lighting === lighting ? 1 : 0, 3, dt)
    }

    view.yaw = damp(view.yaw, view.yawTarget, 6, dt)
    view.pitch = damp(view.pitch, view.pitchTarget, 6, dt)
    view.zoom = damp(view.zoom, view.zoomTarget, 6, dt)

    // The turntable stops for the bite; with reduced motion it never turns.
    if (settings.spin && !reduced && !live.bite.playing) {
      view.spin = (view.spin + SPIN_RAD_PER_S * dt) % TWO_PI
    } else {
      // Back to facing the viewer, the short way round.
      const home = view.spin > Math.PI ? TWO_PI : 0
      view.spin = damp(view.spin, home, 3, dt)
      if (Math.abs(view.spin - home) < 1e-4) view.spin = 0
    }
  }, SHOWCASE_PRIORITY)
  return null
}
