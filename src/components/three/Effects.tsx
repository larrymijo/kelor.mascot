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
  EffectPass,
  FXAAEffect,
  ToneMappingMode,
  type BloomEffect,
  type VignetteEffect,
} from 'postprocessing'
import { useEffect, useMemo, useRef, type ReactElement } from 'react'
import { character } from '@/lib/character'
import { smoothstep } from '@/lib/math/damp'
import { beforeHatch } from '@/lib/scene/boot'
import type { QualityTier } from '@/lib/quality/detect'
import { live } from './live/LiveDriver'
import { useScene } from './store'

/** How much brighter bloom flares when the shell bursts. */
const HATCH_FLASH = 2.2
/** Extra vignette while the egg waits: a spotlight on it, opening as the shell bursts. */
const EGG_SPOT = 0.3

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
 * The live pose drives the effects each frame, never through React: the
 * vignette (closing in on the egg like a spotlight until it hatches, and in
 * the bite) and a bloom flare when the shell bursts. There is no depth of
 * field: with one still shot there are no close-ups to focus.
 */
export function Effects({ tier }: { tier: QualityTier }) {
  const tweaks = useScene((s) => s.tweaks)
  const reducedMotion = useScene((s) => s.reducedMotion)
  const camera = useThree((s) => s.camera)
  const settings = character.quality.tiers[tier]
  const vignette = useRef<VignetteEffect>(null)
  const bloom = useRef<BloomEffect>(null)
  // The composer disposes every pass it holds when it is rebuilt, and it is
  // rebuilt when the tier changes its multisampling: a new tier, a new pass.
  const fxaa = useMemo(
    () => (tier === 'medium' ? new EffectPass(camera, new FXAAEffect()) : null),
    [camera, tier],
  )
  useEffect(() => () => fxaa?.dispose(), [fxaa])

  useFrame(() => {
    const { sample } = live
    const scene = useScene.getState()
    if (vignette.current) {
      const { phase, hatchProgress } = scene.boot
      const spot = beforeHatch(phase)
        ? 1
        : phase === 'hatching'
          ? 1 - smoothstep(0.3, 0.8, hatchProgress)
          : 0
      vignette.current.darkness = sample.vignette + EGG_SPOT * spot
    }
    if (bloom.current) {
      const { phase, hatchProgress } = scene.boot
      const flash =
        phase === 'hatching' && !scene.reducedMotion
          ? smoothstep(0.25, 0.35, hatchProgress) * (1 - smoothstep(0.35, 0.7, hatchProgress))
          : 0
      bloom.current.intensity = scene.tweaks.bloomIntensity * (1 + HATCH_FLASH * flash)
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
