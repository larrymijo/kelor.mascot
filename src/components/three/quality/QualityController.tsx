'use client'

import { PerformanceMonitor } from '@react-three/drei'
import { character } from '@/lib/character'
import { stepDown, stepUp } from '@/lib/quality/detect'
import { useScene } from '../store'

/**
 * Adjusts the tier at runtime with drei's PerformanceMonitor, using the
 * contract's fps bounds. Never climbs above the boot tier, and locks after
 * too many flip-flops. Shadows and the model tier stay fixed to the boot tier.
 */
export function QualityController() {
  const { lowerFps, upperFps, flipflops } = character.quality.performanceMonitor

  return (
    <PerformanceMonitor
      bounds={() => [lowerFps, upperFps]}
      flipflops={flipflops}
      onDecline={() => {
        const scene = useScene.getState()
        scene.setTier(stepDown(scene.tier))
      }}
      onIncline={() => {
        const scene = useScene.getState()
        scene.setTier(stepUp(scene.tier, scene.bootTier))
      }}
      onFallback={() => {
        const scene = useScene.getState()
        scene.setTier('low')
        scene.lockTier()
      }}
    />
  )
}
