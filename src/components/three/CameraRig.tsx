'use client'

/**
 * The camera. Each frame it places the camera on an orbit around a target,
 * from the live pose (docs/interaction-script.md, sampled by LiveDriver): the
 * hero shot at rest, and the bite's moves while it plays.
 *
 * - distance is a multiple of the hero framing that frameSubject computes for
 *   this screen, so every shot works on any aspect ratio;
 * - the target keeps a band free at the bottom for the words, the same rule
 *   frameSubject uses, at whatever distance the shot is;
 * - in the bite the target slides onto the mouth of the scaled Kelo, and the
 *   snap shakes the camera.
 *
 * On load it also pushes in during the hatch and gives a short kick when the
 * shell bursts; reduced motion gets neither.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import { MathUtils, Vector3, type PerspectiveCamera } from 'three'
import { character } from '@/lib/character'
import { degToRad, smoothstep } from '@/lib/math/damp'
import { frameSubject } from '@/lib/scene/framing'
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

  // The hero framing for this screen; every shot is a multiple of its distance.
  const frame = useMemo(() => {
    const aspect = width / Math.max(1, height)
    const portrait = aspect < 1
    // A band at the bottom for the words, the hint and the contact line.
    const bottomReserve = portrait ? 0.24 : 0.12
    const { distance } = frameSubject({
      aspect,
      fovDeg: FOV,
      subjectHeightM: H * 1.08,
      subjectWidthM: H * 0.85,
      subjectCenterY: H * 0.5,
      fill: 0.72,
      bottomReserve,
    })
    return { distance, bottomReserve }
  }, [width, height])

  useFrame((state) => {
    const camera = state.camera as PerspectiveCamera
    const { sample } = live
    const scene = useScene.getState()
    const { phase, hatchProgress } = scene.boot

    // The load: pulled back around the egg, pushing in as it hatches.
    const push =
      phase === 'egg'
        ? EGG_DISTANCE
        : phase === 'hatching' && !scene.reducedMotion
          ? MathUtils.lerp(EGG_DISTANCE, 1, smoothstep(0, 1, hatchProgress))
          : 1
    const distance = frame.distance * sample.distance * push

    if (camera.fov !== sample.fovDeg) {
      camera.fov = sample.fovDeg
      camera.updateProjectionMatrix()
    }
    const halfHeight = distance * Math.tan(degToRad(camera.fov) / 2)

    // Target: the orbit point, keeping the bottom band free, sliding onto the mouth in the gulp.
    _target.set(0, sample.targetY - frame.bottomReserve * halfHeight, 0)
    // The mouth as the mascot left it last frame: it follows the head's gaze and the clip.
    if (sample.mouthFocus > 0) _target.lerp(live.mouth, sample.mouthFocus)

    const azimuth = degToRad(sample.azimuthDeg)
    const elevation = degToRad(sample.elevationDeg)
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
