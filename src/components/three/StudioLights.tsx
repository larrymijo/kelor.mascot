'use client'

import { Environment, Lightformer } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { DirectionalLight } from 'three'
import { character } from '@/lib/character'
import { cinematic } from './cinematic/CinematicDriver'
import { useScene } from './store'

const KEY_POSITION = [2.2, 3.4, 2.6] as const
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
 * Each frame the key and rim follow the act's multipliers from the scroll
 * script, and the key's shadow frustum and position grow with Kelo's scale,
 * so his shadow is never clipped when he towers over the camera in the gulp.
 */
export function StudioLights({ shadows, shadowMapSize }: StudioLightsProps) {
  const tweaks = useScene((s) => s.tweaks)
  const purple = character.colors.mascot['300']
  const key = useRef<DirectionalLight>(null)
  const rim = useRef<DirectionalLight>(null)
  const lastScale = useRef(0)

  useFrame(() => {
    const { sample } = cinematic
    const { keyIntensity, rimIntensity } = useScene.getState().tweaks
    if (key.current) {
      key.current.intensity = keyIntensity * sample.keyLight
      const scale = Math.max(1, sample.scale)
      if (scale !== lastScale.current) {
        lastScale.current = scale
        key.current.position.set(...KEY_POSITION).multiplyScalar(scale)
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
    if (rim.current) rim.current.intensity = rimIntensity * sample.rimLight
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
        color={purple}
      />
      <directionalLight
        position={[-2.4, 1.2, 2.2]}
        intensity={tweaks.fillIntensity}
        color="#dfe3ff"
      />
      <Environment resolution={128} frames={1} environmentIntensity={tweaks.envIntensity}>
        <Lightformer
          form="rect"
          intensity={2.2}
          position={[0, 4, 1]}
          rotation-x={Math.PI / 2}
          scale={[5, 2, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.4}
          color={purple}
          position={[-4, 1.5, -2]}
          rotation-y={Math.PI / 2}
          scale={[3, 1, 1]}
        />
        <Lightformer form="circle" intensity={1.6} position={[3, 2.2, 3]} scale={1.4} />
      </Environment>
    </>
  )
}
