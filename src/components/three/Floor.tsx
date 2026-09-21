'use client'

import { useMemo } from 'react'
import { AdditiveBlending } from 'three'
import { character } from '@/lib/character'
import { radialTexture } from './textures'

/**
 * The floor is invisible except for what grounds the character: a real
 * shadow on shadow-capable tiers, a soft blob otherwise, and a faint purple
 * pool of light. No horizon line against the background.
 */
export function Floor({ shadows }: { shadows: boolean }) {
  const blob = useMemo(() => radialTexture(64, 1.6), [])
  const pool = useMemo(() => radialTexture(64, 2.4), [])

  return (
    <group rotation-x={-Math.PI / 2}>
      {shadows ? (
        <mesh receiveShadow>
          <planeGeometry args={[8, 8]} />
          <shadowMaterial transparent opacity={0.5} />
        </mesh>
      ) : (
        <mesh position-z={0.002}>
          <planeGeometry args={[1.3, 1.3]} />
          <meshBasicMaterial
            map={blob}
            color="#000000"
            transparent
            opacity={0.55}
            depthWrite={false}
          />
        </mesh>
      )}
      <mesh position-z={0.001}>
        <planeGeometry args={[3.2, 3.2]} />
        <meshBasicMaterial
          map={pool}
          color={character.colors.mascot['500']}
          transparent
          opacity={0.16}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
