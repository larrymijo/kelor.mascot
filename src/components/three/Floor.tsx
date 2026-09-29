'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, type Group } from 'three'
import { character } from '@/lib/character'
import { live } from './live/LiveDriver'
import { radialTexture } from './textures'

/**
 * The floor is invisible except for what grounds the character: a real
 * shadow on shadow-capable tiers, a soft blob otherwise, and a quiet glow
 * under his feet, which follow him when he is moved and fade as he is
 * lifted. No horizon line against the backdrop.
 */
export function Floor({ shadows }: { shadows: boolean }) {
  const blob = useMemo(() => radialTexture(64, 1.6), [])
  const pool = useMemo(() => radialTexture(64, 2.4), [])
  const under = useRef<Group>(null)

  useFrame(() => {
    const group = under.current
    if (!group) return
    const { x, y } = live.kelo.feet
    group.position.x = x
    // Lifted, the glow and the blob spread and fade.
    const lift = Math.min(1, y / 1.2)
    group.scale.setScalar(1 + 0.6 * lift)
  })

  return (
    <group rotation-x={-Math.PI / 2}>
      {shadows && (
        <mesh receiveShadow>
          <planeGeometry args={[8, 8]} />
          <shadowMaterial transparent opacity={0.38} />
        </mesh>
      )}
      <group ref={under}>
        {!shadows && (
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
          <planeGeometry args={[2.2, 2.2]} />
          <meshBasicMaterial
            map={pool}
            color={character.colors.mascot['500']}
            transparent
            opacity={0.09}
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  )
}
