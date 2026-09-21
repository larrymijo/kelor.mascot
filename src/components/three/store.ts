/**
 * Scene state shared by the stage components. Lives in the lazily loaded 3D
 * chunk only; the HTML side talks to the stage through callbacks. This is the
 * seed of the phase 5 director.
 */
import { create } from 'zustand'
import type { QualityTier } from '@/lib/quality/detect'
import { initialBootState, type BootState } from '@/lib/scene/boot'

export type ExpressionName = 'neutral' | 'happy' | 'surprised' | 'roar'

/** Live-tunable values; the preview debug panel writes them. */
export interface Tweaks {
  keyIntensity: number
  rimIntensity: number
  fillIntensity: number
  envIntensity: number
  bloomIntensity: number
  plateGlow: number
  grain: number
}

export const defaultTweaks: Tweaks = {
  keyIntensity: 2.4,
  rimIntensity: 3.2,
  fillIntensity: 0.6,
  envIntensity: 0.8,
  bloomIntensity: 0.9,
  plateGlow: 1.6,
  grain: 0.035,
}

interface SceneState {
  /** Tier chosen at boot; shadows and the model tier stay fixed to it. */
  bootTier: QualityTier
  /** Current tier after PerformanceMonitor steps (drives DPR and post). */
  tier: QualityTier
  tierLocked: boolean
  reducedMotion: boolean
  modelReady: boolean
  /** 0 to 1 while the GLB downloads. */
  loadProgress: number
  boot: BootState
  expression: ExpressionName
  /** Clip requested from outside the boot sequence (debug panel, later the director). */
  clipRequest: { name: string; id: number } | null
  tweaks: Tweaks

  initTier: (tier: QualityTier) => void
  setTier: (tier: QualityTier) => void
  lockTier: () => void
  setReducedMotion: (value: boolean) => void
  setModelReady: (value: boolean) => void
  setLoadProgress: (value: number) => void
  setBoot: (boot: BootState) => void
  setExpression: (expression: ExpressionName) => void
  playClip: (name: string) => void
  setTweaks: (tweaks: Partial<Tweaks>) => void
}

export const useScene = create<SceneState>()((set) => ({
  bootTier: 'medium',
  tier: 'medium',
  tierLocked: false,
  reducedMotion: false,
  modelReady: false,
  loadProgress: 0,
  boot: initialBootState,
  expression: 'neutral',
  clipRequest: null,
  tweaks: defaultTweaks,

  initTier: (tier) => set({ bootTier: tier, tier, tierLocked: false }),
  setTier: (tier) => set((s) => (s.tierLocked ? s : { tier })),
  lockTier: () => set({ tierLocked: true }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setModelReady: (modelReady) => set({ modelReady }),
  setLoadProgress: (loadProgress) => set({ loadProgress }),
  setBoot: (boot) => set({ boot }),
  setExpression: (expression) => set({ expression }),
  playClip: (name) => set((s) => ({ clipRequest: { name, id: (s.clipRequest?.id ?? 0) + 1 } })),
  setTweaks: (tweaks) => set((s) => ({ tweaks: { ...s.tweaks, ...tweaks } })),
}))
