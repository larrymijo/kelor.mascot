'use client'

import { Environment, Lightformer } from '@react-three/drei'
import { character } from '@/lib/character'
import { useScene } from './store'

interface StudioLightsProps {
  shadows: boolean
  shadowMapSize: number
}

/**
 * Dark studio: warm key with soft shadows, purple rim from behind, cool fill,
 * and a procedural environment (Lightformers rendered once) for reflections
 * on the glossy eyes. No HDR files, no network.
 */
export function StudioLights({ shadows, shadowMapSize }: StudioLightsProps) {
  const tweaks = useScene((s) => s.tweaks)
  const purple = character.colors.mascot['300']

  return (
    <>
      <hemisphereLight args={['#dcdcdc', character.colors.brandMono.ink900, 0.35]} />
      <directionalLight
        position={[2.2, 3.4, 2.6]}
        intensity={tweaks.keyIntensity}
        color="#fff4ea"
        castShadow={shadows}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-camera-left={-1.2}
        shadow-camera-right={1.2}
        shadow-camera-top={1.6}
        shadow-camera-bottom={-0.6}
        shadow-camera-near={1}
        shadow-camera-far={9}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight
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
