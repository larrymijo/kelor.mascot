'use client'

import { useSyncExternalStore } from 'react'
import { copy } from '@/lib/copy'
import { onSoundMode, setSoundMode, soundMode, wakeAudio } from '@/lib/sound/control'

/**
 * The sound switch, in the top bar opposite the studio mark. It shows off
 * until pressed: the page starts silent, except for the bite
 * (src/lib/sound/control.ts). Pressing it turns everything on, creating the
 * audio engine inside the click if a press on Kelo has not yet; pressing it
 * again turns everything off, the bite too.
 */
export function SoundToggle() {
  const mode = useSyncExternalStore(onSoundMode, soundMode, () => 'auto' as const)
  const on = mode === 'on'

  const toggle = () => {
    if (on) {
      setSoundMode('off')
      return
    }
    setSoundMode('on')
    wakeAudio()
  }

  return (
    <button
      type="button"
      aria-label={copy.sound.label}
      aria-pressed={on}
      data-sound={mode}
      onClick={toggle}
      className="live-control forced-plate min-h-11 min-w-11 items-center justify-center rounded-md text-ink-300 transition-colors duration-200 ease-out-quart hover:text-ink-50 aria-pressed:text-ink-50"
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
