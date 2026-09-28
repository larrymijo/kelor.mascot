'use client'

import { useFrame, useThree } from '@react-three/fiber'
import {
  Bloom,
  EffectComposer,
  N8AO,
  Noise,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import {
  DepthOfFieldEffect,
  EffectPass,
  FXAAEffect,
  ToneMappingMode,
  type BloomEffect,
  type VignetteEffect,
} from 'postprocessing'
import { useEffect, useMemo, useRef, type ReactElement } from 'react'
import { Vector3, type Camera, type WebGLRenderer, type WebGLRenderTarget } from 'three'
import { character } from '@/lib/character'
import { smoothstep } from '@/lib/math/damp'
import type { QualityTier } from '@/lib/quality/detect'
import { cinematic } from './cinematic/CinematicDriver'
import { useScene } from './store'

/** Strongest bokeh, at the peak of the close-ups. */
const BOKEH = 4
/** Strength over which depth of field fades in, so its half-resolution layers never pop. */
const DOF_FADE = 0.25
/** How much brighter bloom flares when the shell bursts. */
const HATCH_FLASH = 2.2

/**
 * Depth of field that costs nothing while the scroll script keeps it off.
 * The effect renders its circle-of-confusion and bokeh passes every frame
 * even with no blur, and its half-resolution far layer then replaces the
 * sharp image wherever the scene is out of focus. So at zero strength it
 * skips that work and blends at zero opacity; the close-ups fade it in.
 */
class ScriptedDepthOfField extends DepthOfFieldEffect {
  private strength = 0
  private readonly focus = new Vector3()

  constructor(camera: Camera, resolutionScale: number) {
    super(camera, { focusRange: 0.08, bokehScale: 0, resolutionScale })
    this.target = this.focus
    this.blendMode.opacity.value = 0
  }

  /** Follows the script: blur strength from 0 to 1, and the point kept sharp. */
  drive(strength: number, focus: Vector3) {
    this.strength = strength
    this.focus.copy(focus)
    this.bokehScale = BOKEH * strength
    this.blendMode.opacity.value = Math.min(1, strength / DOF_FADE)
  }

  override update(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget, deltaTime?: number) {
    if (this.strength > 0) super.update(renderer, inputBuffer, deltaTime)
  }
}

/**
 * Post-processing per quality tier (character.json quality.tiers). The low
 * tier skips the composer entirely and relies on renderer tone mapping; the
 * others finish with an AgX tone-mapping pass so every tier looks alike.
 *
 * Antialiasing is MSAA 4x on high and FXAA on medium. MSAA 2x cost medium a
 * fifth of its frame rate on integrated graphics, and SMAA embeds its lookup
 * texture as a 67 kB base64 image, which broke the deferred 3D budget on its
 * own. FXAA runs in its own pass after tone mapping, where it expects its
 * input: merged into the effects pass it would read the scene before them.
 *
 * The cinematic drives the effects each frame, never through React:
 * vignette darkness per act, a bloom flare when the egg bursts, and, where
 * the tier allows it, depth of field that focuses on the eyes and then the
 * plates in the close-ups. It stays mounted, so reaching the close-ups never
 * recompiles the composer. There is no chromatic aberration: postprocessing
 * merges it into the same pass as depth of field, and a pass can hold only
 * one convolution effect, so it silently broke the blur.
 */
export function Effects({ tier }: { tier: QualityTier }) {
  const tweaks = useScene((s) => s.tweaks)
  const reducedMotion = useScene((s) => s.reducedMotion)
  const camera = useThree((s) => s.camera)
  const settings = character.quality.tiers[tier]
  const vignette = useRef<VignetteEffect>(null)
  const bloom = useRef<BloomEffect>(null)
  const focus = useRef(new Vector3())

  const dof = useMemo(
    () => (settings.depthOfField ? new ScriptedDepthOfField(camera, 0.75) : null),
    [camera, settings.depthOfField],
  )
  // The composer disposes every pass it holds when it is rebuilt, and it is
  // rebuilt when the tier changes its multisampling: a new tier, a new pass.
  const fxaa = useMemo(
    () => (tier === 'medium' ? new EffectPass(camera, new FXAAEffect()) : null),
    [camera, tier],
  )
  useEffect(() => () => dof?.dispose(), [dof])
  useEffect(() => () => fxaa?.dispose(), [fxaa])

  useFrame(() => {
    const { sample } = cinematic
    const scene = useScene.getState()
    if (vignette.current) vignette.current.darkness = sample.vignette
    if (bloom.current) {
      const { phase, hatchProgress } = scene.boot
      const flash =
        phase === 'hatching' && !scene.reducedMotion
          ? smoothstep(0.25, 0.35, hatchProgress) * (1 - smoothstep(0.35, 0.7, hatchProgress))
          : 0
      bloom.current.intensity = scene.tweaks.bloomIntensity * (1 + HATCH_FLASH * flash)
    }
    if (dof) {
      focus.current.lerpVectors(cinematic.focus.eyes, cinematic.focus.plates, sample.dofTarget)
      dof.drive(sample.dof, focus.current)
    }
  })

  if (tier === 'low') return null

  const effects: ReactElement[] = []
  if (settings.ao !== 'off') {
    effects.push(
      <N8AO
        key="ao"
        halfRes={settings.ao === 'half'}
        quality={settings.ao === 'full' ? 'medium' : 'performance'}
        aoRadius={0.4}
        distanceFalloff={1}
        intensity={2.2}
      />,
    )
  }
  // Before tone mapping, so the blur works on scene light, like a lens.
  if (dof) effects.push(<primitive key="dof" object={dof} />)
  if (settings.bloom) {
    effects.push(
      <Bloom
        key="bloom"
        ref={bloom}
        mipmapBlur
        intensity={tweaks.bloomIntensity}
        luminanceThreshold={0.9}
        luminanceSmoothing={0.2}
      />,
    )
  }
  effects.push(<ToneMapping key="tone" mode={ToneMappingMode.AGX} />)
  effects.push(<Vignette key="vignette" ref={vignette} offset={0.3} darkness={0.6} />)
  if (settings.filmGrain && !reducedMotion) {
    effects.push(<Noise key="grain" premultiply opacity={tweaks.grain} />)
  }
  if (fxaa) effects.push(<primitive key="fxaa" object={fxaa} />)

  return (
    <EffectComposer multisampling={tier === 'high' ? 4 : 0} enableNormalPass={false}>
      {effects}
    </EffectComposer>
  )
}
