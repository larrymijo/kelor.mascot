'use client'

/**
 * The cinematic camera. Each frame it places the camera on an orbit around a
 * target, as the scroll script says (docs/scroll-script.md, sampled by
 * CinematicDriver):
 *
 * - distance is a multiple of the hero framing that frameSubject computes for
 *   this screen, so every shot works on any aspect ratio;
 * - the target keeps a band free at the bottom for the words, the same rule
 *   frameSubject uses, at whatever distance the shot is;
 * - in the gulp the target slides onto the mouth of the scaled Kelo;
 * - a lens shift (setViewOffset) moves him aside for the words on desktop.
 *
 * On load it also pushes in during the hatch and gives a short kick when the
 * shell bursts; reduced motion gets neither.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { MathUtils, Vector3, type PerspectiveCamera } from 'three'
import { character } from '@/lib/character'
import { degToRad, smoothstep } from '@/lib/math/damp'
import { frameSubject } from '@/lib/scene/framing'
import { cinematic } from './cinematic/CinematicDriver'
import { useScene } from './store'

export const FOV = 30
const H = character.meta.heightM
/** Pull back while the egg waits, then push in as it hatches. */
const EGG_DISTANCE = 1.15
/** The kick: when in the hatch it fires, how long it lasts and how hard it hits. */
const KICK = { from: 0.28, to: 0.55, amplitude: 0.018, frequency: 38 }

const _target = new Vector3()

export function CameraRig() {
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const lastShift = useRef('')

  // The hero framing for this screen; every shot is a multiple of its distance.
  const frame = useMemo(() => {
    const aspect = width / Math.max(1, height)
    const portrait = aspect < 1
    const bottomReserve = portrait ? 0.16 : 0.06
    const { distance } = frameSubject({
      aspect,
      fovDeg: FOV,
      subjectHeightM: H * 1.08,
      subjectWidthM: H * 0.85,
      subjectCenterY: H * 0.5,
      fill: portrait ? 0.82 : 0.74,
      bottomReserve,
    })
    return { distance, bottomReserve }
  }, [width, height])

  useFrame((state) => {
    const camera = state.camera as PerspectiveCamera
    const { sample } = cinematic
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
    if (sample.mouthFocus > 0) _target.lerp(cinematic.mouth, sample.mouthFocus)

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
    camera.lookAt(_target)

    // Lens shift: move the subject aside for the words, without changing perspective.
    const shift = Math.round(sample.shiftX * 1000) / 1000
    const key = `${shift}:${width}x${height}`
    if (key !== lastShift.current) {
      lastShift.current = key
      if (shift === 0) camera.clearViewOffset()
      else camera.setViewOffset(width, height, -shift * width, 0, width, height)
    }
  })

  return null
}
