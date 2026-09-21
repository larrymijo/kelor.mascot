'use client'

import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Group } from 'three'
import { character } from '@/lib/character'
import { degToRad, smoothstep } from '@/lib/math/damp'
import { modelUrl } from '@/lib/scene/model'
import { useScene } from '../store'
import { MascotRig } from './MascotRig'

/** Three-quarter turn towards the key light, so the tail and plates read. Phase 5 turns the head back to the viewer. */
const POSE_YAW = degToRad(22)

const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2

/**
 * Loads the mascot for the boot tier (lite on low, full otherwise), stays
 * hidden inside the egg, then plays hatch and settles into idle. Drives the
 * expression atlas and the breathing glow of the dorsal plates.
 */
export function Mascot() {
  const bootTier = useScene((s) => s.bootTier)
  const phase = useScene((s) => s.boot.phase)
  const gltf = useGLTF(modelUrl(character, bootTier), false)
  const rig = useMemo(() => new MascotRig(gltf), [gltf])
  const root = useRef<Group>(null)
  const lastRequest = useRef(0)
  const time = useRef(0)

  useEffect(() => {
    if (rig.missingBones.length && process.env.NODE_ENV !== 'production') {
      console.warn(`[mascot] missing bones: ${rig.missingBones.join(', ')}`)
    }
    useScene.getState().setModelReady(true)
    return () => {
      useScene.getState().setModelReady(false)
      rig.dispose()
    }
  }, [rig])

  useEffect(() => {
    const scene = useScene.getState()
    if (phase === 'hatching') {
      scene.setExpression('surprised')
      rig.play('hatch')
    } else if (phase === 'ready') {
      scene.setExpression('happy')
      if (!rig.currentClip) rig.play('idle')
    }
  }, [phase, rig])

  useFrame((_, delta) => {
    const scene = useScene.getState()
    const dt = Math.min(delta, 0.1)
    time.current += dt
    rig.update(dt)

    if (root.current) {
      const hatch = scene.boot.phase === 'egg' ? 0 : scene.boot.hatchProgress
      root.current.visible = scene.boot.phase !== 'egg'
      const reveal = scene.reducedMotion ? 1 : easeOutBack(smoothstep(0, 0.6, hatch))
      root.current.scale.setScalar(0.55 + 0.45 * reveal)
    }

    if (scene.clipRequest && scene.clipRequest.id !== lastRequest.current) {
      lastRequest.current = scene.clipRequest.id
      rig.play(scene.clipRequest.name)
    }

    rig.setExpression(scene.expression)
    const breathe = scene.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(time.current * 2.2)
    rig.setPlateGlow(scene.tweaks.plateGlow * breathe)
  })

  return (
    <group ref={root} visible={false} rotation-y={POSE_YAW}>
      <primitive object={rig.scene} />
    </group>
  )
}
