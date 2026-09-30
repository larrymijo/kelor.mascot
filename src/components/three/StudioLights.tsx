'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { DirectionalLight } from 'three'
import { character } from '@/lib/character'
import { live } from './live/LiveDriver'
import { blendColor, blendScale } from './looks'
import { useScene } from './store'
import { useStudioEnvironment, type StudioPanel } from './studioEnvironment'

const KEY_POSITION = [2.2, 3.4, 2.6] as const
const PURPLE = character.colors.mascot['300']
/** Reflections only: a softbox overhead, a purple strip behind, a round fill in front. */
const PANELS: readonly StudioPanel[] = [
  { form: 'rect', intensity: 2.2, position: [0, 4, 1], scale: [5, 2, 1] },
  { form: 'rect', intensity: 1.4, color: PURPLE, position: [-4, 1.5, -2], scale: [3, 1, 1] },
  { form: 'circle', intensity: 1.6, position: [3, 2.2, 3], scale: 1.4 },
]
const ENVIRONMENT_RESOLUTION = 128
/** Shadow frustum around Kelo at scale 1, in light space; tight for texel density. */
const SHADOW = { left: -1, right: 1, top: 1.5, bottom: -0.5, near: 1, far: 9 }

interface StudioLightsProps {
  shadows: boolean
  shadowMapSize: number
}

/**
 * Dark studio: warm key with soft shadows, purple rim from behind, cool fill,
 * and a procedural environment (Lightformers rendered once) for reflections
 * on the glossy eyes. No HDR files, no network.
 *
 * Each frame the key and rim follow the live pose's multipliers, the three
 * lights take the colours and strengths of the sandbox's lighting look
 * (looks.ts), and the key light moves with Kelo and grows with his scale, so
 * his shadow stays sharp wherever he is dragged and is never clipped when he
 * towers over the camera in the bite.
 */
export function StudioLights({ shadows, shadowMapSize }: StudioLightsProps) {
  const tweaks = useScene((s) => s.tweaks)
  useStudioEnvironment(PANELS, ENVIRONMENT_RESOLUTION, tweaks.envIntensity)
  const key = useRef<DirectionalLight>(null)
  const rim = useRef<DirectionalLight>(null)
  const fill = useRef<DirectionalLight>(null)
  const lastScale = useRef(0)

  useFrame(() => {
    const { sample } = live
    const { keyIntensity, rimIntensity, fillIntensity } = useScene.getState().tweaks
    if (fill.current) {
      fill.current.intensity = fillIntensity * blendScale('fillScale')
      blendColor('fill', fill.current.color)
    }
    if (key.current) {
      key.current.intensity = keyIntensity * sample.keyLight * blendScale('keyScale')
      blendColor('key', key.current.color)
      const scale = Math.max(1, sample.scale)
      const { x } = live.kelo.feet
      key.current.position.set(...KEY_POSITION).multiplyScalar(scale)
      key.current.position.x += x
      if (key.current.target.position.x !== x) {
        key.current.target.position.x = x
        key.current.target.updateMatrixWorld()
      }
      if (scale !== lastScale.current) {
        lastScale.current = scale
        const camera = key.current.shadow.camera
        camera.left = SHADOW.left * scale
        camera.right = SHADOW.right * scale
        camera.top = SHADOW.top * scale
        camera.bottom = SHADOW.bottom * scale
        camera.near = SHADOW.near * scale
        camera.far = SHADOW.far * scale
        camera.updateProjectionMatrix()
      }
    }
    if (rim.current) {
      rim.current.intensity = rimIntensity * sample.rimLight * blendScale('rimScale')
      blendColor('rim', rim.current.color)
    }
  })

  return (
    <>
      <hemisphereLight args={['#dcdcdc', character.colors.brandMono.ink900, 0.35]} />
      <directionalLight
        ref={key}
        position={KEY_POSITION}
        intensity={tweaks.keyIntensity}
        color="#fff4ea"
        castShadow={shadows}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-camera-left={SHADOW.left}
        shadow-camera-right={SHADOW.right}
        shadow-camera-top={SHADOW.top}
        shadow-camera-bottom={SHADOW.bottom}
        shadow-camera-near={SHADOW.near}
        shadow-camera-far={SHADOW.far}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={3}
      />
      <directionalLight
        ref={rim}
        position={[-2.6, 2.4, -2.8]}
        intensity={tweaks.rimIntensity}
        color={PURPLE}
      />
      <directionalLight
        ref={fill}
        position={[-2.4, 1.2, 2.2]}
        intensity={tweaks.fillIntensity}
        color="#dfe3ff"
      />
    </>
  )
}
