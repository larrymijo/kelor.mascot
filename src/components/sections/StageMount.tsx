'use client'

import dynamic from 'next/dynamic'
import { useCallback, useState } from 'react'
import { LogoMark } from '@/components/ui/LogoMark'
import { copy } from '@/lib/copy'
import type { BootPhase } from '@/lib/scene/boot'

/** The whole 3D experience is a separate chunk, fetched after hydration. */
const Experience = dynamic(() => import('@/components/three/Experience'), {
  ssr: false,
  loading: () => null,
})

type SceneState = 'loading' | BootPhase | 'unavailable'

/**
 * Client boundary of the hero scene. Shows the static brand mark until the
 * canvas draws its first frame, then cross-fades to it. Without WebGL the
 * mark simply stays. `data-scene-state` exposes the boot phase to tests.
 */
export function StageMount() {
  const [state, setState] = useState<SceneState>('loading')
  const [shown, setShown] = useState(false)

  const onFirstFrame = useCallback(() => {
    setShown(true)
    setState((current) => (current === 'loading' ? 'egg' : current))
  }, [])
  const onPhaseChange = useCallback((phase: BootPhase) => setState(phase), [])
  const onUnavailable = useCallback(() => setState('unavailable'), [])

  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-scene-state={state}
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
          <LogoMark size={120} className="relative" />
        </div>
      </div>

      {state !== 'unavailable' && (
        <div
          className={`absolute inset-0 transition-opacity duration-700 ${shown ? 'opacity-100' : 'opacity-0'}`}
        >
          <Experience
            onFirstFrame={onFirstFrame}
            onPhaseChange={onPhaseChange}
            onUnavailable={onUnavailable}
          />
        </div>
      )}
    </div>
  )
}
