'use client'

/**
 * The camera. Each frame it places the camera on an orbit around a target,
 * from the live pose (docs/interaction-script.md, sampled by LiveDriver): the
 * hero shot at rest, and the bite's moves while it plays.
 *
 * - distance is a multiple of the hero framing that frameSubject computes for
 *   this screen and layout (src/lib/showcase/layout.ts), so every shot works
 *   on any aspect ratio;
 * - the target keeps the layout's bands free above and below for the words
 *   and the dock, the same rule frameSubject uses, at whatever distance;
 * - in the desktop sandbox the visitor orbits the camera (dragging the empty
 *   stage) and zooms it (the wheel); the bite eases that away while it plays,
 *   and plays at the close framing of BITE_FRAMING, so the small Kelo of the
 *   layout still fills the screen with his jaws;
 * - a lens shift stands Kelo where the layout wants him across the screen
 *   (right of centre in the sandbox), so the orbit still circles him;
 * - in the bite the target slides onto the mouth of the scaled Kelo, and the
 *   snap shakes the camera.
 *
 * On load it also pushes in during the hatch and gives a short kick when the
 * shell bursts; reduced motion gets neither.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MathUtils, Vector3, type PerspectiveCamera } from 'three'
import { character } from '@/lib/character'
import { damp, degToRad, smoothstep } from '@/lib/math/damp'
import { RESET_S } from '@/lib/live/bite'
import { frameSubject } from '@/lib/scene/framing'
import { beforeHatch } from '@/lib/scene/boot'
import { BITE_FRAMING, layoutFraming, SANDBOX_QUERY } from '@/lib/showcase/layout'
import { fillFor } from '@/lib/showcase/size'
import { live } from './live/LiveDriver'
import { useScene } from './store'

export const FOV = 30
const H = character.meta.heightM
/** Pull back while the egg waits, then push in as it hatches. */
const EGG_DISTANCE = 1.15
/** The kick: when in the hatch it fires, how long it lasts and how hard it hits. */
const KICK = { from: 0.28, to: 0.55, amplitude: 0.018, frequency: 38 }
/** The bite's shake at full strength, as a share of the camera's distance. */
const SHAKE = 0.035

const _target = new Vector3()

export function CameraRig() {
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  // Client-only chunk: the media query can be read while initialising.
  const [sandbox, setSandbox] = useState(() => window.matchMedia(SANDBOX_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia(SANDBOX_QUERY)
    const update = () => setSandbox(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  /** How much of the sandbox's orbit and zoom shows: none while the bite plays. */
  const orbit = useRef(1)

  // The hero framing for this screen and layout; every shot is a multiple of its distance.
  const frame = useMemo(() => {
    const aspect = width / Math.max(1, height)
    const frameFor = ({ centreX, ...layout }: typeof BITE_FRAMING) => ({
      distance: frameSubject({
        aspect,
        fovDeg: FOV,
        subjectHeightM: H * 1.08,
        // Off centre, the far side of the screen is further from him: frame the width for it.
        subjectWidthM: H * 0.85 * (1 + 2 * Math.abs(centreX - 0.5)),
        subjectCenterY: H * 0.5,
        ...layout,
      }).distance,
      shift: layout.bottomReserve - (layout.topReserve ?? 0),
      centreX,
    })
    const layout = layoutFraming(aspect, sandbox)
    const hero = frameFor(layout)
    const bite = frameFor(BITE_FRAMING)
    return { ...hero, fill: layout.fill, biteDistance: bite.distance, biteShift: bite.shift }
  }, [width, height, sandbox])

  // The lens shift: the picture slides so he stands at centreX, without turning the camera.
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  useEffect(() => {
    live.layout.centreX = frame.centreX
    const offset = (frame.centreX - 0.5) * width
    if (Math.abs(offset) < 0.5) camera.clearViewOffset()
    else camera.setViewOffset(width, height, -offset, 0, width, height)
    return () => camera.clearViewOffset()
  }, [camera, frame.centreX, width, height])

  useFrame((state, delta) => {
    const camera = state.camera as PerspectiveCamera
    const { sample } = live
    const scene = useScene.getState()
    const { phase, hatchProgress } = scene.boot

    // The load: pulled back around the egg, pushing in as it hatches.
    const push = beforeHatch(phase)
      ? EGG_DISTANCE
      : phase === 'hatching' && !scene.reducedMotion
        ? MathUtils.lerp(EGG_DISTANCE, 1, smoothstep(0, 1, hatchProgress))
        : 1
    // The bite takes the camera over until he is reset in the dark: the
    // visitor's shot, at his chosen size, is back whole before the iris opens.
    const lunging = sample.biteS !== null && sample.biteS < RESET_S
    orbit.current = lunging ? damp(orbit.current, 0, 5, Math.min(delta, 0.1)) : 1
    const { view } = live
    const zoom = MathUtils.lerp(1, view.zoom, orbit.current)
    // The sandbox's size slider: the hero shot frames him at its fill instead
    // (frameSubject's distance goes as 1 / fill).
    const hero = sandbox ? frame.distance * (frame.fill / fillFor(view.size)) : frame.distance
    // The bite moves in to its close framing as the orbit eases away.
    const close = 1 - orbit.current
    const base = MathUtils.lerp(hero, frame.biteDistance, close)
    const shift = MathUtils.lerp(frame.shift, frame.biteShift, close)
    const distance = base * sample.distance * push * zoom

    if (camera.fov !== sample.fovDeg) {
      camera.fov = sample.fovDeg
      camera.updateProjectionMatrix()
    }
    const halfHeight = distance * Math.tan(degToRad(camera.fov) / 2)

    // Target: the orbit point, keeping the layout's bands free, sliding onto the mouth in the gulp.
    _target.set(0, sample.targetY - shift * halfHeight, 0)
    // The mouth as the mascot left it last frame: it follows the head's gaze and the clip.
    if (sample.mouthFocus > 0) _target.lerp(live.mouth, sample.mouthFocus)

    const azimuth = degToRad(sample.azimuthDeg) + view.yaw * orbit.current
    const elevation = degToRad(sample.elevationDeg) + view.pitch * orbit.current
    camera.position.set(
      _target.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
      _target.y + Math.sin(elevation) * distance,
      _target.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
    )

    // The kick when the shell bursts: a fast, decaying shake.
    if (phase === 'hatching' && !scene.reducedMotion) {
      const k = (hatchProgress - KICK.from) / (KICK.to - KICK.from)
      if (k > 0 && k < 1) {
        const strength = KICK.amplitude * frame.distance * (1 - k) ** 2
        const t = hatchProgress * KICK.frequency
        camera.position.x += Math.sin(t * 7.1) * strength
        camera.position.y += Math.sin(t * 9.3 + 1.3) * strength
      }
    }
    // The bite's shake: fast, uneven, and scaled to how close the camera is.
    if (sample.shake > 0 && !scene.reducedMotion) {
      const strength = SHAKE * distance * sample.shake
      const t = state.clock.elapsedTime * 41
      camera.position.x += (Math.sin(t * 1.7) + 0.5 * Math.sin(t * 3.1)) * strength
      camera.position.y += (Math.sin(t * 2.3 + 1.1) + 0.5 * Math.sin(t * 4.3)) * strength
      _target.x += Math.sin(t * 1.3 + 2) * strength * 0.5
    }
    camera.lookAt(_target)
  })

  return null
}
