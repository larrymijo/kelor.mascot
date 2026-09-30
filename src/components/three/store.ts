/**
 * Scene state shared by the stage components. Lives in the lazily loaded 3D
 * chunk only; the HTML side talks to the stage through callbacks. The
 * director's decisions are mirrored here for the debug panel and the tests.
 */
import { create } from 'zustand'
import type { Attention, DirectorState } from '@/lib/behaviour/director'
import type { QualityTier } from '@/lib/quality/detect'
import { initialBootState, type BootState } from '@/lib/scene/boot'
import { DEFAULT_FINISH } from './mascot/finish'
import type { ExpressionName } from './mascot/MascotRig'

export type { ExpressionName }

/** Live-tunable values; the preview debug panel writes them. */
export interface Tweaks {
  keyIntensity: number
  rimIntensity: number
  fillIntensity: number
  envIntensity: number
  bloomIntensity: number
  plateGlow: number
  grain: number
  /** Vinyl finish on the skin (medium and high tiers). */
  skinCoat: number
  skinSheen: number
  /** Soft-skin shading: how far light wraps, and the skin colour's saturation. */
  skinWrap: number
  skinSaturation: number
}

export const defaultTweaks: Tweaks = {
  keyIntensity: 2.4,
  rimIntensity: 3.2,
  fillIntensity: 0.6,
  envIntensity: 0.8,
  bloomIntensity: 0.9,
  plateGlow: 1.6,
  grain: 0.025,
  skinCoat: DEFAULT_FINISH.skinCoat,
  skinSheen: DEFAULT_FINISH.skinSheen,
  skinWrap: DEFAULT_FINISH.skinWrap,
  skinSaturation: DEFAULT_FINISH.skinSaturation,
}

interface SceneState {
  /** Tier chosen at boot; shadows and the model tier stay fixed to it. */
  bootTier: QualityTier
  /** Current tier after PerformanceMonitor steps (drives post). */
  tier: QualityTier
  /** Current render pixel ratio: the quality ladder steps it down before the tier. */
  dpr: number
  tierLocked: boolean
  reducedMotion: boolean
  modelReady: boolean
  /** Which model is on screen: lite paints first, full may replace it after the hatch. */
  modelQuality: 'lite' | 'full'
  /** 0 to 1 while the GLB downloads. */
  loadProgress: number
  boot: BootState
  expression: ExpressionName
  /** Clip requested from outside the boot sequence (the debug panel). */
  clipRequest: { name: string; id: number } | null
  tweaks: Tweaks
  /** Mirror of the director: where Kelo looks and which state it is in. */
  attention: Attention
  directorState: DirectorState
  /** Clip currently playing on the rig. */
  clip: string | null
  /** Debug switch for the gaze layer. */
  gazeEnabled: boolean
  /** Bumped by the debug panel to ask for a blink. */
  blinkRequest: number

  initTier: (tier: QualityTier, dpr: number) => void
  setTier: (tier: QualityTier) => void
  /** One step of the quality ladder: a tier and a pixel ratio, ignored once locked. */
  setQuality: (rung: { tier: QualityTier; dpr: number }) => void
  lockTier: () => void
  setReducedMotion: (value: boolean) => void
  setModelReady: (value: boolean) => void
  setModelQuality: (value: 'lite' | 'full') => void
  setLoadProgress: (value: number) => void
  setBoot: (boot: BootState) => void
  setExpression: (expression: ExpressionName) => void
  playClip: (name: string) => void
  setTweaks: (tweaks: Partial<Tweaks>) => void
  setDirector: (attention: Attention, directorState: DirectorState) => void
  setClip: (clip: string | null) => void
  setGazeEnabled: (value: boolean) => void
  requestBlink: () => void
}

export const useScene = create<SceneState>()((set) => ({
  bootTier: 'medium',
  tier: 'medium',
  dpr: 1,
  tierLocked: false,
  reducedMotion: false,
  modelReady: false,
  modelQuality: 'lite',
  loadProgress: 0,
  boot: initialBootState,
  expression: 'neutral',
  clipRequest: null,
  tweaks: defaultTweaks,
  attention: 'camera',
  directorState: 'egg',
  clip: null,
  gazeEnabled: true,
  blinkRequest: 0,

  initTier: (tier, dpr) => set({ bootTier: tier, tier, dpr, tierLocked: false }),
  setTier: (tier) => set((s) => (s.tierLocked ? s : { tier })),
  setQuality: ({ tier, dpr }) => set((s) => (s.tierLocked ? s : { tier, dpr })),
  lockTier: () => set({ tierLocked: true }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setModelReady: (modelReady) => set({ modelReady }),
  setModelQuality: (modelQuality) => set({ modelQuality }),
  setLoadProgress: (loadProgress) => set({ loadProgress }),
  setBoot: (boot) => set({ boot }),
  setExpression: (expression) => set({ expression }),
  playClip: (name) => set((s) => ({ clipRequest: { name, id: (s.clipRequest?.id ?? 0) + 1 } })),
  setTweaks: (tweaks) => set((s) => ({ tweaks: { ...s.tweaks, ...tweaks } })),
  setDirector: (attention, directorState) =>
    set((s) =>
      s.attention === attention && s.directorState === directorState
        ? s
        : { attention, directorState },
    ),
  setClip: (clip) => set((s) => (s.clip === clip ? s : { clip })),
  setGazeEnabled: (gazeEnabled) => set({ gazeEnabled }),
  requestBlink: () => set((s) => ({ blinkRequest: s.blinkRequest + 1 })),
}))
