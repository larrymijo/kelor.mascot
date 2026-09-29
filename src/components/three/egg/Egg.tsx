'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, type Group, type Mesh, type MeshStandardMaterial } from 'three'
import { character } from '@/lib/character'
import { degToRad, smoothstep } from '@/lib/math/damp'
import { useScene } from '../store'
import { buildEggPieces } from './geometry'
import { EggShell } from './shell'

const egg = character.egg
const glow = new Color(
  character.colors.mascot[egg.crackGlow as keyof typeof character.colors.mascot],
)

const easeIn = (t: number) => t * t
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)

/**
 * The loader, a dinosaur egg: rocks on its base while the mascot downloads,
 * its cracks widening and glowing brighter with load progress, then breaks
 * along them into two halves and a cap when the boot sequence hatches.
 * Until then it is one seamless shell with the cracks drawn on it; the
 * pieces only appear for the burst. Reduced motion: no rocking, pulse or
 * flash, and the boot machine cuts straight to the mascot.
 */
export function Egg() {
  const phase = useScene((s) => s.boot.phase)
  const pieces = useMemo(() => buildEggPieces(egg), [])
  const shell = useMemo(() => new EggShell(egg, glow), [])
  const group = useRef<Group>(null)
  const whole = useRef<Mesh>(null)
  /** Pivot groups on the outer edge of each half, so they tip over outwards. */
  const left = useRef<Group>(null)
  const right = useRef<Group>(null)
  /** Pivot at the cap's centre, so it spins about itself as it pops. */
  const cap = useRef<Group>(null)
  const core = useRef<Mesh>(null)
  const coreMaterial = useRef<MeshStandardMaterial>(null)
  const time = useRef(0)

  useEffect(
    () => () => {
      for (const geometry of [pieces.whole, pieces.left, pieces.right, pieces.cap, pieces.core])
        geometry.dispose()
    },
    [pieces],
  )
  useEffect(() => () => shell.dispose(), [shell])

  useFrame((_, delta) => {
    if (!group.current || !whole.current || !left.current || !right.current) return
    if (!cap.current || !core.current) return
    const scene = useScene.getState()
    const reduced = scene.reducedMotion
    time.current += Math.min(delta, 0.1)
    const t = time.current
    const progress = scene.loadProgress
    const hatch = scene.boot.phase === 'egg' ? 0 : scene.boot.hatchProgress
    const broken = hatch > 0

    // Rocking from the base, stronger as the download nears the end.
    const amplitude = reduced
      ? 0
      : degToRad(egg.wobble.maxAngleDeg) * (0.35 + 0.65 * progress) * (1 - hatch)
    const phaseAngle = 2 * Math.PI * egg.wobble.frequencyHz * t
    group.current.rotation.z = amplitude * Math.sin(phaseAngle)
    group.current.rotation.x = amplitude * 0.35 * Math.sin(phaseAngle * 0.7 + 1.3)

    // Whole while it waits; the pieces take over for the burst.
    whole.current.visible = !broken
    left.current.visible = broken
    right.current.visible = broken
    cap.current.visible = broken

    // The cracks widen with progress and pulse, then flare as the shell bursts.
    const pulse = reduced ? 0 : 0.35 * Math.sin(t * 4) * progress
    const flash = reduced ? 0 : Math.sin(Math.min(1, hatch * 2.2) * Math.PI) * 7
    shell.setCracks(Math.min(1, progress + hatch), 0.45 + 1.6 * progress + pulse + flash)

    // The halves fall outwards and the cap pops, spinning.
    const gap = 0.006
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

    // The core shows through the gaps as the pieces part, and flashes.
    if (coreMaterial.current) coreMaterial.current.emissiveIntensity = 1 + 2 * progress + flash
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
          emissiveIntensity={1}
        />
      </mesh>
      <mesh
        ref={whole}
        geometry={pieces.whole}
        material={shell.material}
        castShadow
        receiveShadow
      />
      <group ref={left} position-x={-pieces.halfWidth} visible={false}>
        <mesh
          geometry={pieces.left}
          material={shell.material}
          position-x={pieces.halfWidth}
          castShadow
          receiveShadow
        />
      </group>
      <group ref={right} position-x={pieces.halfWidth} visible={false}>
        <mesh
          geometry={pieces.right}
          material={shell.material}
          position-x={-pieces.halfWidth}
          castShadow
          receiveShadow
        />
      </group>
      <group ref={cap} position-y={pieces.capCenterY} visible={false}>
        <mesh
          geometry={pieces.cap}
          material={shell.material}
          position-y={-pieces.capCenterY}
          castShadow
          receiveShadow
        />
      </group>
    </group>
  )
}
