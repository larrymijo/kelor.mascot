'use client'

import { useProgress } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AgXToneMapping } from 'three'
import { character } from '@/lib/character'
import { detectQualityTier, type QualityTier } from '@/lib/quality/detect'
import { bootTimings, stepBoot, type BootPhase } from '@/lib/scene/boot'
import { CameraRig, FOV } from './CameraRig'
import { Effects } from './Effects'
import { Floor } from './Floor'
import { QualityController } from './quality/QualityController'
import { readDeviceSignals } from './quality/signals'
import { useScene } from './store'
import { StudioLights } from './StudioLights'

export interface StageProps {
  /** Called on every boot phase change (egg, hatching, ready). */
  onPhaseChange?: (phase: BootPhase) => void
  /** Called once the first frame has been drawn, to fade the canvas in. */
  onFirstFrame?: () => void
  /** Called when WebGL 2 is not available; the HTML fallback stays. */
  onUnavailable?: () => void
  /** Scene content (egg, mascot); kept as children so the stage stays generic. */
  children?: ReactNode
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
  onFirstFrame,
  onUnavailable,
  children,
}: StageProps) {
  const wrapper = useRef<HTMLDivElement>(null)
  // The stage only renders on the client (next/dynamic with ssr: false), so the
  // device can be probed while initialising state. initTier is idempotent.
  const [bootTier] = useState<QualityTier | 'unavailable'>(() => {
    const signals = readDeviceSignals()
    if (!signals.webgl2) return 'unavailable'
    const detected = detectQualityTier(signals)
    useScene.getState().initTier(detected)
    return detected
  })
  const [inView, setInView] = useState(true)
  const [pageVisible, setPageVisible] = useState(true)
  const tier = useScene((s) => s.tier)

  useEffect(() => {
    if (bootTier === 'unavailable') onUnavailable?.()
  }, [bootTier, onUnavailable])

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
      }),
    [onPhaseChange],
  )

  if (bootTier === 'unavailable') return null

  const boot = character.quality.tiers[bootTier]
  const current = character.quality.tiers[tier]

  return (
    <div ref={wrapper} className="absolute inset-0">
      <Canvas
        shadows={boot.shadows ? 'percentage' : false}
        dpr={[1, current.dprMax]}
        frameloop={inView && pageVisible ? 'always' : 'never'}
        gl={{ antialias: bootTier === 'low', powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: FOV, near: 0.1, far: 40, position: [0, 1, 4] }}
        onCreated={({ gl }) => {
          gl.toneMapping = AgXToneMapping
        }}
      >
        <color attach="background" args={[character.colors.brandMono.ink900]} />
        <CameraRig />
        <StudioLights shadows={boot.shadows} shadowMapSize={bootTier === 'high' ? 1024 : 512} />
        <Floor shadows={boot.shadows} />
        {children}
        <Effects tier={tier} />
        <QualityController />
        <LoadingTracker />
        <BootDriver />
        <FirstFrame onFirstFrame={onFirstFrame} />
      </Canvas>
    </div>
  )
}
