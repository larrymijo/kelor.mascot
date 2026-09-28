'use client'

import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, use, useEffect, useMemo, useRef, useState } from 'react'
import type { AnimationClip, Group, Object3D } from 'three'
import { character } from '@/lib/character'
import { degToRad, smoothstep } from '@/lib/math/damp'
import type { BootPhase } from '@/lib/scene/boot'
import { firstPaintUrl, upgradeUrl } from '@/lib/scene/model'
import { readConnection, shouldUpgrade } from '@/lib/scene/upgrade'
import { loadKtx2Module, useKtx2Extension, warmUp } from '../loaders'
import { useScene } from '../store'
import { MascotRig, type RigSnapshot } from './MascotRig'

/** Three-quarter turn towards the key light, so the tail and plates read. Phase 5 turns the head back to the viewer. */
const POSE_YAW = degToRad(22)

const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2

type LoadedModel = { scene: Object3D; animations: AnimationClip[] }

/**
 * Streams the full model in behind the lite one. It suspends inside its own
 * boundary, first on the KTX2 loader chunk and then on the model, so the
 * mascot on screen never unmounts, and it compiles the new shaders before
 * handing the model over, so the swap costs no frame.
 */
function ModelUpgrade({ url, onReady }: { url: string; onReady: (model: LoadedModel) => void }) {
  const extend = useKtx2Extension(use(loadKtx2Module()))
  const gltf = useGLTF(url, false, true, extend)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    let cancelled = false
    void warmUp(gl, gltf.scene, camera, scene).then(() => {
      if (!cancelled) onReady(gltf)
    })
    return () => {
      cancelled = true
    }
  }, [gltf, gl, camera, scene, onReady])

  return null
}

/**
 * Paints the lite model first on every tier, so the egg opens as soon as it
 * can. It stays hidden inside the egg until its shaders are compiled, plays
 * hatch, settles into idle, and then, where the tier and connection allow,
 * swaps to the full model without a visible cut. Drives the expression atlas
 * and the breathing glow of the dorsal plates.
 */
export function Mascot() {
  const bootTier = useScene((s) => s.bootTier)
  const phase = useScene((s) => s.boot.phase)
  // The lite model carries WebP, so it loads with Meshopt alone and no KTX2 code.
  const lite = useGLTF(firstPaintUrl(character), false, true)
  const [full, setFull] = useState<LoadedModel | null>(null)
  const model = full ?? lite
  const rig = useMemo(() => new MascotRig(model), [model])
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const root = useRef<Group>(null)
  const handover = useRef<RigSnapshot | null>(null)
  const handledPhase = useRef<BootPhase | null>(null)
  const lastRequest = useRef(0)
  const time = useRef(0)
  const upgrade = useMemo(() => {
    const url = upgradeUrl(character, bootTier)
    return shouldUpgrade(url, readConnection()) ? url : null
  }, [bootTier])

  useEffect(() => {
    if (rig.missingBones.length && process.env.NODE_ENV !== 'production') {
      console.warn(`[mascot] missing bones: ${rig.missingBones.join(', ')}`)
    }
    // A swap continues exactly where the previous model stopped.
    if (handover.current) {
      rig.restore(handover.current)
      handover.current = null
    }
    let cancelled = false
    void warmUp(gl, rig.scene, camera, scene).then(() => {
      if (!cancelled) useScene.getState().setModelReady(true)
    })
    useScene.getState().setModelQuality(full ? 'full' : 'lite')
    return () => {
      cancelled = true
      handover.current = rig.snapshot()
      rig.dispose()
    }
  }, [rig, full, gl, camera, scene])

  useEffect(() => () => useScene.getState().setModelReady(false), [])

  // React to boot phase changes only; a model swap must not replay them.
  useEffect(() => {
    if (handledPhase.current === phase) return
    handledPhase.current = phase
    const store = useScene.getState()
    if (phase === 'hatching') {
      store.setExpression('surprised')
      rig.play('hatch')
    } else if (phase === 'ready') {
      store.setExpression('happy')
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
    <>
      <group ref={root} visible={false} rotation-y={POSE_YAW}>
        <primitive object={rig.scene} />
      </group>
      {upgrade && phase === 'ready' && !full && (
        <Suspense fallback={null}>
          <ModelUpgrade url={upgrade} onReady={setFull} />
        </Suspense>
      )}
    </>
  )
}
