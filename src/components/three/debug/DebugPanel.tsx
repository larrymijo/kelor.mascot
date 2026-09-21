'use client'

import { button, Leva, useControls } from 'leva'
import { createPortal } from 'react-dom'
import { character } from '@/lib/character'
import { QUALITY_TIERS, type QualityTier } from '@/lib/quality/detect'
import { useScene, type ExpressionName, type Tweaks } from '../store'

const range = (key: keyof Tweaks, min: number, max: number, step = 0.05) => ({
  value: useScene.getState().tweaks[key],
  min,
  max,
  step,
  onChange: (value: number) => useScene.getState().setTweaks({ [key]: value }),
})

/**
 * Preview-only tuning panel (?debug on local and preview deployments, never
 * on production). Loaded as its own chunk, so leva never ships to visitors.
 */
export default function DebugPanel() {
  useControls('Lights and post', {
    keyIntensity: range('keyIntensity', 0, 6),
    rimIntensity: range('rimIntensity', 0, 8),
    fillIntensity: range('fillIntensity', 0, 3),
    envIntensity: range('envIntensity', 0, 3),
    bloomIntensity: range('bloomIntensity', 0, 3),
    grain: range('grain', 0, 0.15, 0.005),
  })

  useControls('Quality', {
    tier: {
      value: useScene.getState().tier,
      options: [...QUALITY_TIERS],
      onChange: (tier: QualityTier) => useScene.getState().setTier(tier),
    },
  })

  useControls('Mascot', {
    expression: {
      value: useScene.getState().expression,
      options: Object.keys(character.expressions.cells),
      onChange: (expression: ExpressionName) => useScene.getState().setExpression(expression),
    },
    plateGlow: range('plateGlow', 0, 5),
    ...Object.fromEntries(
      character.clips.required.map((clip) => [
        `play ${clip.name}`,
        button(() => useScene.getState().playClip(clip.name)),
      ]),
    ),
  })

  // Portal to <body>: the stage wrapper is pointer-events-none and sits under the hero text.
  return createPortal(<Leva collapsed={false} titleBar={{ title: 'KELOR debug' }} />, document.body)
}
