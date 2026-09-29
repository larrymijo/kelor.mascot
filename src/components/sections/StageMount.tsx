'use client'

import dynamic from 'next/dynamic'
import { useCallback, useRef, useState } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { logoMarkDataUri, logoMarkWidth } from '@/components/ui/LogoMark'
import { copy } from '@/lib/copy'
import type { BootPhase } from '@/lib/scene/boot'

/** Marks when the 3D chunk is requested, so load measurements can tell the page from the 3D boot. */
export const STAGE_IMPORT_MARK = 'kelor:3d-import'

/** The whole 3D experience is a separate chunk, fetched after hydration. */
const Experience = dynamic(
  () => {
    performance.mark(STAGE_IMPORT_MARK)
    return import('@/components/three/Experience')
  },
  {
    ssr: false,
    loading: () => null,
  },
)

type SceneState = 'loading' | BootPhase | 'unavailable'

const BRAND_MARK = logoMarkDataUri()

/** How long a lost GPU context may take to come back before the scene gives up. */
const CONTEXT_GRACE_MS = 5_000

/**
 * Client boundary of the hero scene. Shows the static brand mark until the
 * canvas draws its first frame, then cross-fades to it. Without WebGL, or
 * when the 3D chunk or the model fails to load, the mark simply stays; it
 * also covers a lost GPU context until the context comes back.
 * `data-scene-state`, `data-model`, `data-tier`, `data-attention` and
 * `data-clip` expose the boot phase, the live model, the detected quality
 * tier, where Kelo looks and what he plays to tests.
 */
export function StageMount() {
  const [state, setState] = useState<SceneState>('loading')
  const [shown, setShown] = useState(false)
  const [model, setModel] = useState<'lite' | 'full'>('lite')
  const [tier, setTier] = useState<string>('')
  const [attention, setAttention] = useState('camera')
  const [clip, setClip] = useState<string | null>(null)

  const onFirstFrame = useCallback(() => {
    setShown(true)
    setState((current) => (current === 'loading' ? 'egg' : current))
  }, [])
  const onPhaseChange = useCallback((phase: BootPhase) => setState(phase), [])
  // No WebGL, a chunk or model that failed to load, or a lost context that
  // never came back: the brand mark returns and the page stays a document.
  const onUnavailable = useCallback(() => {
    setState('unavailable')
    setShown(false)
  }, [])
  // A lost GPU context shows the brand mark until it comes back, and gives
  // up on the scene if it has not come back within a few seconds.
  const lostTimer = useRef<number | null>(null)
  const onContextLost = useCallback(() => {
    setShown(false)
    lostTimer.current = window.setTimeout(onUnavailable, CONTEXT_GRACE_MS)
  }, [onUnavailable])
  const onContextRestored = useCallback(() => {
    if (lostTimer.current !== null) window.clearTimeout(lostTimer.current)
    lostTimer.current = null
    setShown(true)
  }, [])

  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-scene-state={state}
      data-model={model}
      data-tier={tier}
      data-attention={attention}
      data-clip={clip ?? ''}
      role="img"
      aria-label={copy.hero.sceneLabel}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-x-0 top-0 grid h-[60%] place-items-center transition-opacity duration-700 ${shown ? 'opacity-0' : 'opacity-100'}`}
      >
        <div className="relative grid place-items-center">
          <div
            data-testid="logo-glow"
            className="absolute size-44 rounded-full bg-mascot-500/40 opacity-60 blur-3xl motion-safe:animate-glow-pulse"
          />
          {/* An image, not inline SVG, so the first screen has a contentful
              paint to report as LCP before the canvas takes over. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- an inline data URI needs no optimisation */}
          <img
            src={BRAND_MARK}
            width={logoMarkWidth(120)}
            height={120}
            alt=""
            decoding="sync"
            className="relative"
          />
        </div>
      </div>

      {state !== 'unavailable' && (
        <div
          className={`absolute inset-0 transition-opacity duration-700 ${shown ? 'opacity-100' : 'opacity-0'}`}
        >
          <ErrorBoundary onError={onUnavailable}>
            <Experience
              onFirstFrame={onFirstFrame}
              onPhaseChange={onPhaseChange}
              onModelChange={setModel}
              onBootTier={setTier}
              onAttentionChange={setAttention}
              onClipChange={setClip}
              onUnavailable={onUnavailable}
              onContextLost={onContextLost}
              onContextRestored={onContextRestored}
            />
          </ErrorBoundary>
        </div>
      )}
    </div>
  )
}
