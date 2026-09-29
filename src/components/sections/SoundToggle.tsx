'use client'

import { useRef, useState } from 'react'
import { copy } from '@/lib/copy'
import type { Synth } from '@/lib/sound/synth'

/**
 * The sound switch, off by default, in the corner opposite the studio mark.
 * Nothing sound-related exists before the first press: that click creates
 * the AudioContext (Safari only starts one inside a gesture) and downloads
 * the synthesiser, a chunk of its own. Later presses fade it in and out.
 */
export function SoundToggle() {
  const [on, setOn] = useState(false)
  const synth = useRef<Promise<Synth> | null>(null)

  const toggle = () => {
    const next = !on
    setOn(next)
    if (!synth.current) {
      const context = new AudioContext()
      void context.resume()
      synth.current = import('@/lib/sound/synth').then((m) => m.createSynth(context))
    }
    void synth.current.then((s) => s.setEnabled(next))
  }

  return (
    <button
      type="button"
      aria-label={copy.sound.label}
      aria-pressed={on}
      onClick={toggle}
      className="live-control forced-plate top-4 right-4 z-30 min-h-11 min-w-11 items-center justify-center rounded-md text-ink-300 transition-colors duration-200 ease-out-quart hover:text-ink-50 aria-pressed:text-ink-50 sm:top-6 sm:right-6"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
        {on ? (
          <path
            d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M16 10l4 4M20 10l-4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        )}
      </svg>
    </button>
  )
}
