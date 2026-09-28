'use client'

/**
 * Loads the cinematic engine once Kelo's stage is drawing and the browser is
 * idle. Until then, and for good if WebGL is unavailable, the page stays a
 * short readable document. This component is the only cinematic code in the
 * initial bundle: a few lines and a dynamic import.
 */
import { useEffect } from 'react'

const DRAWING = new Set(['egg', 'hatching', 'ready'])

function whenIdle(run: () => void) {
  // Safari before 18 has no requestIdleCallback, whatever the DOM typings say.
  const idle = window.requestIdleCallback as typeof window.requestIdleCallback | undefined
  if (idle) {
    const id = window.requestIdleCallback(run, { timeout: 1500 })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(run, 200)
  return () => window.clearTimeout(id)
}

export function CinematicMount() {
  useEffect(() => {
    const stage = document.querySelector('[data-scene-state]')
    if (!stage) return
    let stop: (() => void) | null = null
    let cancelIdle: (() => void) | null = null
    let disposed = false

    const start = () => {
      if (cancelIdle || stop) return
      cancelIdle = whenIdle(() => {
        void import('./engine').then(({ startCinematic }) => {
          if (!disposed) stop = startCinematic()
        })
      })
    }
    const check = () => {
      if (DRAWING.has(stage.getAttribute('data-scene-state') ?? '')) {
        observer.disconnect()
        start()
      }
    }
    const observer = new MutationObserver(check)
    observer.observe(stage, { attributes: true, attributeFilter: ['data-scene-state'] })
    check()

    return () => {
      disposed = true
      observer.disconnect()
      cancelIdle?.()
      stop?.()
    }
  }, [])

  return null
}
