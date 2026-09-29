'use client'

import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AnimationClip, Group, Object3D } from 'three'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { character } from '@/lib/character'
import { degToRad, smoothstep } from '@/lib/math/damp'
import type { BootPhase } from '@/lib/scene/boot'
import { crossedCues } from '@/lib/cinematic/timeline'
import { firstPaintUrl, upgradeUrl } from '@/lib/scene/model'
import { readConnection, shouldUpgrade } from '@/lib/scene/upgrade'
import { cinematic } from '../cinematic/CinematicDriver'
import { loadKtx2Module, useKtx2Extension, warmUp } from '../loaders'
import { useScene } from '../store'
import { BehaviourController } from './BehaviourController'
import { MascotRig, type RigSnapshot } from './MascotRig'
import { useBehaviourInput } from './useBehaviourInput'

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
 * swaps to the full model without a visible cut. Each frame the clips play,
 * then the behaviour controller runs the director and lays gaze, blinks and
 * tail on top. Drives the expression atlas and the breathing glow of the
 * dorsal plates.
 */
export function Mascot() {
  const bootTier = useScene((s) => s.bootTier)
  const phase = useScene((s) => s.boot.phase)
  // The lite model carries WebP, so it loads with Meshopt alone and no KTX2 code.
  const lite = useGLTF(firstPaintUrl(character), false, true)
  const [full, setFull] = useState<{ model: LoadedModel; snapshot: RigSnapshot } | null>(null)
  const rig = useMemo(() => {
    // The physical finish costs fragment work; the low tier keeps plain materials.
    const next = new MascotRig(full?.model ?? lite, { finish: bootTier !== 'low' })
    // A swap continues exactly where the previous model stopped, from its very
    // first frame: restoring later, in an effect, left a frame with no clip.
    if (full) next.restore(full.snapshot)
    return next
  }, [full, lite, bootTier])
  const adoptFull = useCallback(
    (model: LoadedModel) => setFull({ model, snapshot: rig.snapshot() }),
    [rig],
  )
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const root = useRef<Group>(null)
  const handledPhase = useRef<BootPhase | null>(null)
  const lastRequest = useRef(0)
  const lastBlink = useRef(0)
  const lastExpression = useRef<string | null>(null)
  const lastProgress = useRef(0)
  const time = useRef(0)
  // Outlives rig swaps: the director, blink rhythm and gaze target carry on.
  const [behaviour] = useState(() => new BehaviourController())
  useBehaviourInput(behaviour)
  const upgrade = useMemo(() => {
    const url = upgradeUrl(character, bootTier)
    return shouldUpgrade(url, readConnection()) ? url : null
  }, [bootTier])

  useEffect(() => {
    if (rig.missingBones.length && process.env.NODE_ENV !== 'production') {
      console.warn(`[mascot] missing bones: ${rig.missingBones.join(', ')}`)
    }
    let cancelled = false
    void warmUp(gl, rig.scene, camera, scene).then(() => {
      if (!cancelled) useScene.getState().setModelReady(true)
    })
    useScene.getState().setModelQuality(full ? 'full' : 'lite')
    return () => {
      cancelled = true
      rig.dispose()
    }
  }, [rig, full, gl, camera, scene])

  useEffect(() => () => useScene.getState().setModelReady(false), [])

  // React to boot phase changes only; a model swap must not replay them.
  useEffect(() => {
    if (handledPhase.current === phase) return
    handledPhase.current = phase
    // Expressions follow the director; the boot phases only start clips.
    if (phase === 'hatching') rig.play('hatch')
    else if (phase === 'ready' && !rig.currentClip) rig.play(rig.idleClip)
  }, [phase, rig])

  useFrame((state, delta) => {
    const scene = useScene.getState()
    const dt = Math.min(delta, 0.1)
    time.current += dt
    rig.update(dt)

    if (scene.blinkRequest !== lastBlink.current) {
      lastBlink.current = scene.blinkRequest
      behaviour.requestBlink()
    }
    const { sample, progress, variant } = cinematic
    // One-shot moments of the scroll script, when scrolling forwards across them.
    if (scene.boot.phase === 'ready') {
      for (const cue of crossedCues(lastProgress.current, progress, variant)) {
        if (cue.kind === 'blink') behaviour.requestBlink()
        else if (cue.kind === 'bite') rig.bite()
        else rig.play(cue.clip)
      }
    }
    lastProgress.current = progress
    // The script opens the jaw as he closes in on the viewer; behave() moves it.
    rig.setJawScript(sample.jaw * character.jaw.maxOpenDeg)
    const out = behaviour.step(dt, rig, {
      camera: state.camera,
      size: state.size,
      bootPhase: scene.boot.phase,
      reducedMotion: scene.reducedMotion,
      gazeEnabled: scene.gazeEnabled,
      script: sample.act === 'hero' ? null : { gaze: sample.gaze, expression: sample.expression },
    })
    // Mirror the director into the store: edge-triggered, so the debug panel can override.
    if (out.expression !== lastExpression.current) {
      lastExpression.current = out.expression
      scene.setExpression(out.expression)
    }
    scene.setDirector(out.attention, out.state)
    scene.setClip(rig.currentClip)

    if (root.current) {
      const hatch = scene.boot.phase === 'egg' ? 0 : scene.boot.hatchProgress
      root.current.visible = scene.boot.phase !== 'egg'
      const reveal = scene.reducedMotion ? 1 : easeOutBack(smoothstep(0, 0.6, hatch))
      root.current.scale.setScalar((0.55 + 0.45 * reveal) * sample.scale)
      root.current.rotation.y = degToRad(sample.bodyYawDeg)
      rig.mouthWorld(cinematic.mouth)
      rig.eyesWorld(cinematic.focus.eyes)
      rig.platesWorld(cinematic.focus.plates)
    }

    if (scene.clipRequest && scene.clipRequest.id !== lastRequest.current) {
      lastRequest.current = scene.clipRequest.id
      rig.play(scene.clipRequest.name)
    }

    rig.setExpression(scene.expression)
    const breathe = scene.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(time.current * 2.2)
    rig.setPlateGlow(scene.tweaks.plateGlow * breathe * sample.plateGlow)
    rig.setFinish(scene.tweaks)
  })

  return (
    <>
      <group ref={root} visible={false}>
        <primitive object={rig.scene} />
      </group>
      {upgrade && phase === 'ready' && !full && (
        // A full model that fails to download or decode leaves the lite Kelo in place.
        <ErrorBoundary>
          <Suspense fallback={null}>
            <ModelUpgrade url={upgrade} onReady={adoptFull} />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  )
}
