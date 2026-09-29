'use client'

import { PerformanceMonitor } from '@react-three/drei'
import { useEffect, useState } from 'react'
import { character } from '@/lib/character'
import { QUALITY_TIERS, stepDown, stepUp } from '@/lib/quality/detect'
import { useScene } from '../store'

/** Loading (hatch, model upgrade, shader compiles) is not the steady state: wait it out. */
const SETTLE_AFTER_READY_MS = 4000
/** A tier change rebuilds the effects and recompiles shaders; don't judge that stall. */
const SETTLE_AFTER_CHANGE_MS = 1500

/**
 * Adjusts the tier at runtime with drei's PerformanceMonitor, using the
 * contract's fps bounds. Never climbs above the boot tier, and locks after
 * too many flip-flops. Shadows and the model tier stay fixed to the boot tier.
 *
 * It only measures the steady state. Measuring from boot let the loading
 * stalls push the tier down, and every change then recompiled the effects,
 * which caused the next dip: on an integrated GPU it flip-flopped three
 * times and locked itself at low for the whole cinematic. So the monitor
 * starts a few seconds after the hatch, and restarts fresh, after a pause,
 * whenever the tier changes.
 */
export function QualityController() {
  const { lowerFps, upperFps, flipflops } = character.quality.performanceMonitor
  const ready = useScene((s) => s.boot.phase === 'ready')
  const tier = useScene((s) => s.tier)
  const locked = useScene((s) => s.tierLocked)
  const [measuring, setMeasuring] = useState<string | null>(null)
  const [changes, setChanges] = useState(0)

  useEffect(() => {
    if (!ready || locked) return
    const settle = measuring === null ? SETTLE_AFTER_READY_MS : SETTLE_AFTER_CHANGE_MS
    const id = window.setTimeout(() => setMeasuring(tier), settle)
    return () => window.clearTimeout(id)
    // Re-arm on every tier change; `measuring` is read only to pick the delay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, locked, tier])

  if (!ready || locked || measuring !== tier) return null

  const change = (next: typeof tier) => {
    const scene = useScene.getState()
    if (next === scene.tier) return
    // Too many changes means the device sits on a boundary: settle on the lower tier.
    if (changes + 1 >= flipflops) {
      const rank = (t: typeof tier) => QUALITY_TIERS.indexOf(t)
      scene.setTier(rank(next) < rank(scene.tier) ? next : scene.tier)
      scene.lockTier()
    } else {
      scene.setTier(next)
    }
    setChanges((n) => n + 1)
  }

  return (
    <PerformanceMonitor
      key={tier}
      bounds={() => [lowerFps, upperFps]}
      onDecline={() => change(stepDown(useScene.getState().tier))}
      onIncline={() => {
        const scene = useScene.getState()
        change(stepUp(scene.tier, scene.bootTier))
      }}
    />
  )
}
