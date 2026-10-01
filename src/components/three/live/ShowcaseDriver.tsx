'use client'

/**
 * The desktop sandbox's settings, eased into the shared live state every
 * frame, right after LiveDriver (docs/interaction-script.md): the lighting
 * look crossfades, the camera's orbit and zoom follow their targets, the
 * size slider eases, and below its threshold he turns into pixel art; on
 * the turntable Kelo turns slowly, easing back to face the viewer when it
 * stops. Nothing here re-renders React.
 */
import { useFrame } from '@react-three/fiber'
import { damp } from '@/lib/math/damp'
import { SANDBOX_QUERY } from '@/lib/showcase/layout'
import { isPixel } from '@/lib/showcase/size'
import { LIGHTINGS, showcase } from '@/lib/showcase/state'
import { useScene } from '../store'
import { live } from './LiveDriver'

/** A slow product turn: a full circle in 15 s. */
const SPIN_RAD_PER_S = (Math.PI * 2) / 15
const TWO_PI = Math.PI * 2
/** The transformation into pixel art, and back, takes this long. */
const MORPH_S = 0.7

/** The slider only exists in the sandbox; anywhere else he stays the 3D model. */
let sandbox: MediaQueryList | null = null
const inSandbox = () => (sandbox ??= window.matchMedia(SANDBOX_QUERY)).matches

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
    view.size = reduced ? settings.size : damp(view.size, settings.size, 8, dt)

    // Pixel art below the slider's threshold; never in the middle of the bite.
    const { form } = live
    if (!live.bite.playing) form.target = inSandbox() && isPixel(settings.size)
    const goal = form.target ? 1 : 0
    form.pixel = reduced
      ? goal
      : form.pixel +
        Math.sign(goal - form.pixel) * Math.min(Math.abs(goal - form.pixel), dt / MORPH_S)

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
