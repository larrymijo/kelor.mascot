'use client'

import {
  Bloom,
  EffectComposer,
  N8AO,
  Noise,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import type { ReactElement } from 'react'
import { character } from '@/lib/character'
import type { QualityTier } from '@/lib/quality/detect'
import { useScene } from './store'

/**
 * Post-processing per quality tier (character.json quality.tiers). The low
 * tier skips the composer entirely and relies on renderer tone mapping; the
 * others finish with an AgX tone-mapping pass so every tier looks alike.
 */
export function Effects({ tier }: { tier: QualityTier }) {
  const tweaks = useScene((s) => s.tweaks)
  const reducedMotion = useScene((s) => s.reducedMotion)
  const settings = character.quality.tiers[tier]
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
        mipmapBlur
        intensity={tweaks.bloomIntensity}
        luminanceThreshold={0.9}
        luminanceSmoothing={0.2}
      />,
    )
  }
  effects.push(<ToneMapping key="tone" mode={ToneMappingMode.AGX} />)
  effects.push(<Vignette key="vignette" offset={0.3} darkness={0.6} />)
  if (settings.filmGrain && !reducedMotion) {
    effects.push(<Noise key="grain" premultiply opacity={tweaks.grain} />)
  }

  return (
    <EffectComposer multisampling={tier === 'high' ? 4 : 0} enableNormalPass={false}>
      {effects}
    </EffectComposer>
  )
}
