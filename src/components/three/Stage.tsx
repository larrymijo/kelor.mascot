'use client'

import { useProgress } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AgXToneMapping } from 'three'
import { character } from '@/lib/character'
import { detectQualityTier, type QualityTier } from '@/lib/quality/detect'
import { bootTimings, stepBoot, type BootPhase } from '@/lib/scene/boot'
import { CameraRig, FOV } from './CameraRig'
import { LiveDriver } from './live/LiveDriver'
import { OverlayDriver } from './live/OverlayDriver'
import { Effects } from './Effects'
import { Backdrop } from './Backdrop'
import { Floor } from './Floor'
import { disposeKtx2Loader } from './loaders'
import { QualityController, qualityLadder } from './quality/QualityController'
import { readDeviceSignals } from './quality/signals'
import { useScene } from './store'
import { StudioLights } from './StudioLights'

export interface StageProps {
  /** Called on every boot phase change (egg, hatching, ready). */
  onPhaseChange?: (phase: BootPhase) => void
  /** Called when the live model changes: lite paints first, full may replace it. */
  onModelChange?: (model: 'lite' | 'full') => void
  /** Called once with the quality tier detected at boot. */
  onBootTier?: (tier: QualityTier) => void
  /** Called when the director moves Kelo's attention (camera, pointer, cta, glance). */
  onAttentionChange?: (attention: string) => void
  /** Called when the clip playing on the rig changes. */
  onClipChange?: (clip: string | null) => void
  /** Called once the first frame has been drawn, to fade the canvas in. */
  onFirstFrame?: () => void
  /** Called when WebGL 2 is not available; the HTML fallback stays. */
  onUnavailable?: () => void
  /** Called when the browser takes the GPU context away (phones do, in the background). */
  onContextLost?: () => void
  /** Called when the context comes back; three rebuilds its GPU state by itself. */
  onContextRestored?: () => void
  /** Scene content (egg, mascot); kept as children so the stage stays generic. */
  children?: ReactNode
}

/** A tier pinned with ?tier= on local and preview builds, never on production. */
function forcedTier(): QualityTier | null {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'production') return null
  const value = new URLSearchParams(window.location.search).get('tier')
  return value === 'low' || value === 'medium' || value === 'high' ? value : null
}

/** Advances the pure boot machine with accumulated frame time (pauses with the loop). */
function BootDriver() {
  const elapsed = useRef(0)
  const timings = useMemo(() => bootTimings(character), [])
  useFrame((_, delta) => {
    elapsed.current += Math.min(delta, 0.1)
    const scene = useScene.getState()
    const next = stepBoot(
      scene.boot,
      {
        elapsedS: elapsed.current,
        modelReady: scene.modelReady,
        reducedMotion: scene.reducedMotion,
      },
      timings,
    )
    if (next !== scene.boot) scene.setBoot(next)
  })
  return null
}

/** Mirrors the three.js loading manager into the store (drives the egg cracks). */
function LoadingTracker() {
  const progress = useProgress((s) => s.progress)
  useEffect(() => useScene.getState().setLoadProgress(progress / 100), [progress])
  return null
}

/** The KTX2 loader keeps a pool of transcoder workers alive; end them with the canvas. */
function LoaderLifetime() {
  const gl = useThree((s) => s.gl)
  useEffect(() => () => disposeKtx2Loader(gl), [gl])
  return null
}

function FirstFrame({ onFirstFrame }: { onFirstFrame?: () => void }) {
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    done.current = true
    requestAnimationFrame(() => onFirstFrame?.())
  })
  return null
}

/**
 * The only place that creates the WebGL canvas. Picks the quality tier from
 * device signals, pauses rendering when the hero is off screen or the tab is
 * hidden, and reports boot phases to the HTML around it.
 */
export default function Stage({
  onPhaseChange,
  onModelChange,
  onBootTier,
  onAttentionChange,
  onClipChange,
  onFirstFrame,
  onUnavailable,
  onContextLost,
  onContextRestored,
  children,
}: StageProps) {
  const wrapper = useRef<HTMLDivElement>(null)
  // The stage only renders on the client (next/dynamic with ssr: false), so the
  // device can be probed while initialising state. initTier is idempotent.
  const [bootTier] = useState<QualityTier | 'unavailable'>(() => {
    const signals = readDeviceSignals()
    if (!signals.webgl2) return 'unavailable'
    // ?tier=low|medium|high pins the tier on local and preview builds, for measuring.
    const forced = forcedTier()
    const detected = forced ?? detectQualityTier(signals)
    // The best step of the quality ladder for this tier and screen.
    useScene.getState().initTier(detected, qualityLadder(detected)[0]!.dpr)
    if (forced) useScene.getState().lockTier()
    return detected
  })
  const [inView, setInView] = useState(true)
  const [pageVisible, setPageVisible] = useState(true)
  const tier = useScene((s) => s.tier)
  const dpr = useScene((s) => s.dpr)

  useEffect(() => {
    if (bootTier === 'unavailable') onUnavailable?.()
    else onBootTier?.(bootTier)
  }, [bootTier, onUnavailable, onBootTier])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => useScene.getState().setReducedMotion(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const element = wrapper.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      {
        rootMargin: '120px',
      },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [bootTier])

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useEffect(
    () =>
      useScene.subscribe((state, previous) => {
        if (state.boot.phase !== previous.boot.phase) onPhaseChange?.(state.boot.phase)
        if (state.modelQuality !== previous.modelQuality) onModelChange?.(state.modelQuality)
        if (state.attention !== previous.attention) onAttentionChange?.(state.attention)
        if (state.clip !== previous.clip) onClipChange?.(state.clip)
      }),
    [onPhaseChange, onModelChange, onAttentionChange, onClipChange],
  )

  if (bootTier === 'unavailable') return null

  const boot = character.quality.tiers[bootTier]

  return (
    <div ref={wrapper} className="absolute inset-0" data-quality={tier}>
      <Canvas
        shadows={boot.shadows ? 'percentage' : false}
        dpr={dpr}
        frameloop={inView && pageVisible ? 'always' : 'never'}
        gl={{ antialias: bootTier === 'low', powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: FOV, near: 0.1, far: 40, position: [0, 1, 4] }}
        onCreated={({ gl }) => {
          gl.toneMapping = AgXToneMapping
          // three stops drawing while the context is lost and restores it; the
          // HTML around the stage only has to cover the gap.
          gl.domElement.addEventListener('webglcontextlost', () => onContextLost?.())
          gl.domElement.addEventListener('webglcontextrestored', () => onContextRestored?.())
        }}
      >
        <color attach="background" args={[character.colors.brandMono.ink900]} />
        <Backdrop />
        <LiveDriver />
        <CameraRig />
        <StudioLights shadows={boot.shadows} shadowMapSize={bootTier === 'high' ? 2048 : 1024} />
        <Floor shadows={boot.shadows} />
        {children}
        <Effects tier={tier} />
        <QualityController />
        <LoadingTracker />
        <LoaderLifetime />
        <BootDriver />
        <OverlayDriver />
        <FirstFrame onFirstFrame={onFirstFrame} />
      </Canvas>
    </div>
  )
}
