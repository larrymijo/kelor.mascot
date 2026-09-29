'use client'

import { PerformanceMonitor } from '@react-three/drei'
import { useEffect, useMemo, useState } from 'react'
import { character } from '@/lib/character'
import type { QualityTier } from '@/lib/quality/detect'
import { buildLadder } from '@/lib/quality/ladder'
import { useScene } from '../store'

/** Loading (hatch, model upgrade, shader compiles) is not the steady state: wait it out. */
const SETTLE_AFTER_READY_MS = 4000
/** A step rebuilds the effects or resizes the canvas; don't judge that stall. */
const SETTLE_AFTER_CHANGE_MS = 1500

/** The quality ladder for a boot tier on this screen (src/lib/quality/ladder.ts). */
export function qualityLadder(bootTier: QualityTier) {
  const pixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  return buildLadder(bootTier, pixelRatio, {
    tiers: character.quality.tiers,
    dprSteps: character.quality.dprSteps,
  })
}

/**
 * Adjusts quality at runtime with drei's PerformanceMonitor, using the
 * contract's fps bounds, one step of the quality ladder at a time: within a
 * tier the render resolution steps down first (a cheap resize), and only at
 * the tier's floor does the tier change (which rebuilds the effects). It never
 * climbs above the boot tier and locks after too many flip-flops, on the lower
 * of the two steps. Shadows and the model stay fixed to the boot tier.
 *
 * It only measures the steady state. Measuring from boot let the loading
 * stalls push quality down, and every change caused the next dip: on an
 * integrated GPU it flip-flopped and locked itself at low for the whole
 * cinematic. So the monitor starts a few seconds after the hatch, and restarts
 * fresh, after a pause, whenever the step changes.
 */
export function QualityController() {
  const { lowerFps, upperFps, flipflops } = character.quality.performanceMonitor
  const ready = useScene((s) => s.boot.phase === 'ready')
  const bootTier = useScene((s) => s.bootTier)
  const locked = useScene((s) => s.tierLocked)
  const ladder = useMemo(() => qualityLadder(bootTier), [bootTier])
  const [step, setStep] = useState(0)
  const [measuring, setMeasuring] = useState<number | null>(null)
  const [changes, setChanges] = useState(0)

  useEffect(() => {
    if (!ready || locked) return
    const settle = measuring === null ? SETTLE_AFTER_READY_MS : SETTLE_AFTER_CHANGE_MS
    const id = window.setTimeout(() => setMeasuring(step), settle)
    return () => window.clearTimeout(id)
    // Re-arm on every step; \`measuring\` is read only to pick the delay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, locked, step])

  if (!ready || locked || measuring !== step) return null

  const move = (next: number) => {
    const target = Math.min(ladder.length - 1, Math.max(0, next))
    if (target === step) return
    const scene = useScene.getState()
    // Too many changes means the device sits on a boundary: settle on the lower step.
    if (changes + 1 >= flipflops) {
      const lower = Math.max(target, step)
      scene.setQuality(ladder[lower]!)
      setStep(lower)
      scene.lockTier()
    } else {
      scene.setQuality(ladder[target]!)
      setStep(target)
    }
    setChanges((n) => n + 1)
  }

  return (
    <PerformanceMonitor
      key={step}
      bounds={() => [lowerFps, upperFps]}
      onDecline={() => move(step + 1)}
      onIncline={() => move(step - 1)}
    />
  )
}
