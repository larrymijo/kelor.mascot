'use client'

import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import type { PerspectiveCamera } from 'three'
import { character } from '@/lib/character'
import { degToRad } from '@/lib/math/damp'
import { frameSubject } from '@/lib/scene/framing'

export const FOV = 30
const ELEVATION_DEG = 7

/**
 * Frames the 1.2 m character above the hero text on any aspect ratio, from a
 * slightly high angle. Phase 6 replaces this with scroll-driven camera moves.
 */
export function CameraRig() {
  const get = useThree((s) => s.get)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)

  useLayoutEffect(() => {
    const aspect = width / Math.max(1, height)
    const portrait = aspect < 1
    const h = character.meta.heightM
    const { distance, targetY } = frameSubject({
      aspect,
      fovDeg: FOV,
      subjectHeightM: h * 1.08,
      subjectWidthM: h * 0.85,
      subjectCenterY: h * 0.5,
      fill: portrait ? 0.88 : 0.8,
      bottomReserve: portrait ? 0.4 : 0.3,
    })
    const elevation = degToRad(ELEVATION_DEG)
    // Read the camera inside the effect: it is an external three.js object, not React state.
    const camera = get().camera as PerspectiveCamera
    camera.fov = FOV
    camera.position.set(0, targetY + Math.sin(elevation) * distance, Math.cos(elevation) * distance)
    camera.lookAt(0, targetY, 0)
    camera.updateProjectionMatrix()
  }, [get, width, height])

  return null
}
