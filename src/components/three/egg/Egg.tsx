'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, type Group, type Mesh, type MeshStandardMaterial } from 'three'
import { character } from '@/lib/character'
import { degToRad, smoothstep } from '@/lib/math/damp'
import { useScene } from '../store'
import { buildEggPieces } from './geometry'

const egg = character.egg
const [darkFace, lightFace, capFace] = egg.faceColors as [string, string, string]
const glow = new Color(
  character.colors.mascot[egg.crackGlow as keyof typeof character.colors.mascot],
)

const easeIn = (t: number) => t * t
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)

/**
 * The loader: rocks on its base while the mascot downloads, its cracks
 * widening and glowing with load progress, then splits like the two halves
 * of the logo when the boot sequence hatches. Reduced motion: no rocking or
 * flash, and the boot machine cuts straight to the mascot.
 */
export function Egg() {
  const phase = useScene((s) => s.boot.phase)
  const pieces = useMemo(() => buildEggPieces(egg), [])
  const group = useRef<Group>(null)
  /** Pivot groups on the outer bottom edge of each half, so they tip over outwards. */
  const left = useRef<Group>(null)
  const right = useRef<Group>(null)
  const cap = useRef<Mesh>(null)
  const core = useRef<Mesh>(null)
  const coreMaterial = useRef<MeshStandardMaterial>(null)
  const time = useRef(0)

  useEffect(
    () => () => {
      for (const geometry of [pieces.left, pieces.right, pieces.cap, pieces.core])
        geometry.dispose()
    },
    [pieces],
  )

  useFrame((_, delta) => {
    if (!group.current || !left.current || !right.current || !cap.current || !core.current) return
    const scene = useScene.getState()
    const reduced = scene.reducedMotion
    time.current += Math.min(delta, 0.1)
    const t = time.current
    const progress = scene.loadProgress
    const hatch = scene.boot.phase === 'egg' ? 0 : scene.boot.hatchProgress

    // Rocking from the base, stronger as the download nears the end.
    const amplitude = reduced
      ? 0
      : degToRad(egg.wobble.maxAngleDeg) * (0.35 + 0.65 * progress) * (1 - hatch)
    const phaseAngle = 2 * Math.PI * egg.wobble.frequencyHz * t
    group.current.rotation.z = amplitude * Math.sin(phaseAngle)
    group.current.rotation.x = amplitude * 0.35 * Math.sin(phaseAngle * 0.7 + 1.3)

    // Cracks open a little with progress, then the halves fall outwards.
    const gap = 0.004 + 0.012 * progress
    const fall = easeIn(smoothstep(0.1, 0.9, hatch))
    const hinge = pieces.halfWidth
    const slide = easeOut(hatch) * 0.12
    left.current.position.set(-hinge - gap - slide, 0, 0)
    left.current.rotation.z = fall * 1.35
    right.current.position.set(hinge + gap + slide, 0, 0)
    right.current.rotation.z = -fall * 1.35

    const pop = Math.sin(Math.min(1, hatch * 1.4) * Math.PI) * 0.45 + hatch * 0.3
    cap.current.position.y = pieces.capCenterY + gap * 1.5 + pop
    cap.current.rotation.x = hatch * 2.4
    cap.current.rotation.z = hatch * 0.8

    const shrink = 1 - smoothstep(0.55, 1, hatch)
    left.current.scale.setScalar(shrink)
    right.current.scale.setScalar(shrink)
    cap.current.scale.setScalar(shrink)

    // Core glow: follows progress, pulses gently, flashes on hatch.
    const pulse = reduced ? 0 : 0.35 * Math.sin(t * 4) * progress
    const flash = reduced ? 0 : Math.sin(Math.min(1, hatch * 2.2) * Math.PI) * 7
    if (coreMaterial.current)
      coreMaterial.current.emissiveIntensity = 0.6 + 2.4 * progress + pulse + flash
    core.current.scale.setScalar(1 - smoothstep(0.35, 0.7, hatch))
  })

  if (phase === 'ready') return null

  return (
    <group ref={group}>
      <mesh ref={core} geometry={pieces.core}>
        <meshStandardMaterial
          ref={coreMaterial}
          color="#000000"
          emissive={glow}
          emissiveIntensity={0.6}
        />
      </mesh>
      <group ref={left} position-x={-pieces.halfWidth}>
        <mesh geometry={pieces.left} position-x={pieces.halfWidth} castShadow receiveShadow>
          <meshStandardMaterial color={darkFace} roughness={0.55} metalness={0} />
        </mesh>
      </group>
      <group ref={right} position-x={pieces.halfWidth}>
        <mesh geometry={pieces.right} position-x={-pieces.halfWidth} castShadow receiveShadow>
          <meshStandardMaterial color={lightFace} roughness={0.55} metalness={0} />
        </mesh>
      </group>
      <mesh ref={cap} geometry={pieces.cap} position-y={pieces.capCenterY} castShadow receiveShadow>
        <meshStandardMaterial color={capFace} roughness={0.5} metalness={0} />
      </mesh>
    </group>
  )
}
