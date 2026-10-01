'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Color, SkeletonHelper, type AnimationClip, type Group, type Object3D } from 'three'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { character } from '@/lib/character'
import { degToRad, smoothstep } from '@/lib/math/damp'
import { beforeHatch, type BootPhase } from '@/lib/scene/boot'
import { firstPaintUrl, upgradeUrl } from '@/lib/scene/model'
import { readConnection, shouldUpgrade } from '@/lib/scene/upgrade'
import { showcase } from '@/lib/showcase/state'
import { live } from '../live/LiveDriver'
import { loadKtx2Module, useKtx2Extension, useModel, warmUp } from '../loaders'
import { useScene } from '../store'
import { BehaviourController } from './BehaviourController'
import { MascotRig, type RigSnapshot } from './MascotRig'
import { PixelKelo } from './PixelKelo'
import { useBehaviourInput } from './useBehaviourInput'

const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2
const H = character.meta.heightM
/** Carried, he turns most of the way to face the viewer from his three-quarter pose. */
const CARRIED_FACING = 0.7
/** The x-ray's skeleton: bright violet joints fading to the glow colour along each bone. */
const BONE_COLORS = [
  new Color(character.colors.mascot['300']),
  new Color(character.colors.mascot.glow),
]

type LoadedModel = { scene: Object3D; animations: AnimationClip[] }

/**
 * Streams the full model in behind the lite one. It suspends inside its own
 * boundary, first on the KTX2 loader chunk and then on the model, so the
 * mascot on screen never unmounts, and it compiles the new shaders before
 * handing the model over, so the swap costs no frame.
 */
function ModelUpgrade({ url, onReady }: { url: string; onReady: (model: LoadedModel) => void }) {
  const extend = useKtx2Extension(use(loadKtx2Module()))
  const gltf = useModel(url, extend)
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
 * then the behaviour controller runs the director, the taps and the carry
 * physics, and lays the carried pose, gaze, blinks, tail and jaw on top.
 *
 * His root is a small stack: a pivot at the point where he is held, carrying
 * the swing and lean; an offset back down to his feet; the squash; and the
 * hatch's pop and the bite's growth, with his turn. Also drives the
 * expression atlas and the breathing glow of the dorsal plates.
 */
export function Mascot() {
  const bootTier = useScene((s) => s.bootTier)
  const phase = useScene((s) => s.boot.phase)
  // The lite model carries WebP, so it loads with Meshopt alone and no KTX2 code.
  const lite = useModel(firstPaintUrl(character))
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
  const pivot = useRef<Group>(null)
  const offset = useRef<Group>(null)
  const shape = useRef<Group>(null)
  const root = useRef<Group>(null)
  /** The 3D model inside the pose, which shrinks away when he turns into pixel art. */
  const model = useRef<Group>(null)
  const handledPhase = useRef<BootPhase | null>(null)
  const lastRequest = useRef(0)
  const lastBlink = useRef(0)
  const lastExpression = useRef<string | null>(null)
  const lastSnaps = useRef(live.snaps)
  const time = useRef(0)
  /** The x-ray's skeleton, in the scene while the x-ray is on. */
  const skeleton = useRef<SkeletonHelper | null>(null)
  // Outlives rig swaps: the director, blink rhythm and gaze target carry on.
  const [behaviour] = useState(() => new BehaviourController())
  useBehaviourInput(behaviour)
  // The runner's Kelo as blocks: the size slider's smallest end (docs/interaction-script.md).
  const [pixel] = useState(() => new PixelKelo())
  useEffect(() => () => pixel.dispose(), [pixel])
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

  // A new rig needs its own skeleton; none survives the mascot.
  useEffect(
    () => () => {
      skeleton.current?.removeFromParent()
      skeleton.current?.dispose()
      skeleton.current = null
    },
    [rig],
  )

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
    // The bite's snap: the jaw slams shut on the viewer.
    if (live.snaps !== lastSnaps.current) {
      lastSnaps.current = live.snaps
      rig.bite()
    }
    const { sample } = live
    const frame = behaviour.step(dt, rig, {
      camera: state.camera,
      size: state.size,
      bootPhase: scene.boot.phase,
      reducedMotion: scene.reducedMotion,
      gazeEnabled: scene.gazeEnabled,
    })
    const out = frame.director
    // Mirror the director into the store: edge-triggered, so the debug panel can override.
    if (out.expression !== lastExpression.current) {
      lastExpression.current = out.expression
      scene.setExpression(out.expression)
    }
    scene.setDirector(out.attention, out.state)
    scene.setClip(rig.currentClip)

    const body = frame.body
    if (pivot.current && offset.current && shape.current && root.current) {
      pivot.current.position.set(body.x, body.y + body.grabY, 0)
      pivot.current.rotation.set(body.lean.angle, 0, body.swing.angle)
      offset.current.position.set(0, -body.grabY, 0)
      // Squashed or stretched, he keeps his volume.
      const squash = body.squash.angle
      const wide = 1 / Math.sqrt(squash)
      shape.current.scale.set(wide, squash, wide)
      const hatch = beforeHatch(scene.boot.phase) ? 0 : scene.boot.hatchProgress
      root.current.visible = !beforeHatch(scene.boot.phase)
      const reveal = scene.reducedMotion ? 1 : easeOutBack(smoothstep(0, 0.6, hatch))
      root.current.scale.setScalar((0.55 + 0.45 * reveal) * sample.scale)
      // His three-quarter turn (the bite turns him to you), less while carried, plus the turntable.
      root.current.rotation.y =
        degToRad(sample.bodyYawDeg) * (1 - CARRIED_FACING * frame.carried) + live.view.spin
      // Pixel art: the model shrinks away as the blocks sweep up from his feet, and back.
      const form = live.form.pixel
      if (model.current) {
        const shown = 1 - smoothstep(0, 0.55, form)
        model.current.visible = shown > 0
        model.current.scale.setScalar(Math.max(shown, 1e-4))
      }
      pixel.update(Math.min(delta, 0.1), {
        amount: form,
        state: live.kelo.state,
        acts: live.kelo.acts,
        x: body.x,
        xray: showcase().xray,
        reducedMotion: scene.reducedMotion,
      })
      rig.mouthWorld(live.mouth)
      // Where he is, for the overlays, the keyboard button and the tests.
      const size = H * sample.scale * squash
      live.kelo.feet.set(body.x, body.y, 0)
      live.kelo.top.set(body.x, body.y + size, 0)
      live.kelo.centre.set(body.x, body.y + size * 0.5, 0)
    }

    if (scene.clipRequest && scene.clipRequest.id !== lastRequest.current) {
      lastRequest.current = scene.clipRequest.id
      rig.play(scene.clipRequest.name)
    }

    // The sandbox's x-ray: a wireframe body with the skeleton drawn over it.
    const xray = showcase().xray
    rig.setXray(xray)
    // The skeleton belongs to the 3D model: none over the blocks.
    if (xray && live.form.pixel < 1 && !skeleton.current) {
      const helper = new SkeletonHelper(rig.scene)
      helper.setColors(BONE_COLORS[0]!, BONE_COLORS[1]!)
      const material = helper.material as { depthTest: boolean; toneMapped: boolean }
      material.depthTest = false
      material.toneMapped = false
      helper.renderOrder = 10
      state.scene.add(helper)
      skeleton.current = helper
    } else if ((!xray || live.form.pixel >= 1) && skeleton.current) {
      skeleton.current.removeFromParent()
      skeleton.current.dispose()
      skeleton.current = null
    }

    rig.setExpression(scene.expression)
    const breathe = scene.reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(time.current * 2.2)
    rig.setPlateGlow(scene.tweaks.plateGlow * breathe * sample.plateGlow)
    rig.setFinish(scene.tweaks)
  })

  return (
    <>
      <group ref={pivot}>
        <group ref={offset}>
          <group ref={shape}>
            <group ref={root} visible={false}>
              <group ref={model}>
                <primitive object={rig.scene} />
              </group>
              <primitive object={pixel.group} />
            </group>
          </group>
        </group>
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
