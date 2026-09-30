'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { copy } from '@/lib/copy'
import {
  ACTIONS,
  DEFAULT_SHOWCASE,
  LIGHTINGS,
  onShowcase,
  sendCommand,
  setShowcase,
  showcase,
  type ActionName,
} from '@/lib/showcase/state'
import { wakeAudio } from '@/lib/sound/control'

const { dock } = copy.showcase

/** Thin-stroke icons, 24 px grid. */
const ICONS: Record<ActionName | 'bite' | 'light' | 'spin' | 'xray' | 'reset', ReactNode> = {
  wave: (
    <path d="M8 12.5V6.5a1.5 1.5 0 0 1 3 0V11m0-.5V4.5a1.5 1.5 0 0 1 3 0V11m0-.5v-4a1.5 1.5 0 0 1 3 0v7A6.5 6.5 0 0 1 10.5 20h-.3a5 5 0 0 1-4.1-2.1L3.8 14.6a1.5 1.5 0 0 1 2.4-1.8L8 14.5" />
  ),
  jump: <path d="M12 16V4.5M7.5 9 12 4.5 16.5 9M5 20h14" />,
  roar: <path d="M4 10v4h3l4.5 3.5v-11L7 10H4Zm11.5-1a4 4 0 0 1 0 6m2.5-8.5a7.5 7.5 0 0 1 0 11" />,
  look: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </>
  ),
  bite: (
    <path d="M3.5 7h17M3.5 17h17M5 7l2.1 4.5L9.2 7l2.1 4.5L13.4 7l2.1 4.5L17.6 7M6.2 17l2.1-4 2.1 4 2.1-4 2.1 4 2.1-4" />
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="3.75" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  spin: <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4.5h-4.5" />,
  xray: (
    <>
      <path d="M12 2.5 20.5 7.25v9.5L12 21.5l-8.5-4.75v-9.5Z" />
      <path d="M12 2.5v19M3.5 7.25l17 9.5M20.5 7.25l-17 9.5" opacity="0.5" />
    </>
  ),
  reset: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2.5V6M12 18v3.5M2.5 12H6M18 12h3.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
}

function IconButton({
  icon,
  label,
  pressed,
  accent,
  onClick,
}: {
  icon: keyof typeof ICONS
  label: string
  pressed?: boolean
  accent?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      data-tip={label}
      onClick={onClick}
      className={`tip relative inline-flex size-10 items-center justify-center rounded-full transition-colors duration-300 ease-out-quart ${
        accent
          ? 'text-mascot-300 hover:bg-mascot-500/20 hover:text-mascot-glow'
          : 'text-ink-300 hover:bg-white/8 hover:text-white aria-pressed:bg-white/12 aria-pressed:text-white'
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-[1.15rem]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ICONS[icon]}
      </svg>
    </button>
  )
}

const Divider = () => <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-white/10" />

/**
 * The desktop sandbox's dock (docs/interaction-script.md): one slim row of
 * icons under Kelo, named by tooltips and for screen readers. Actions play
 * a clip with its face and sound, and the bite (its press starts the audio,
 * as the sixth tap's does); the light cycles the studio's looks; the view
 * spins him on a turntable, shows him in x-ray and centres the camera
 * again. It talks to the 3D chunk only through src/lib/showcase/state.ts.
 */
export function ShowcaseDock() {
  const state = useSyncExternalStore(onShowcase, showcase, () => DEFAULT_SHOWCASE)
  const nextLight = LIGHTINGS[(LIGHTINGS.indexOf(state.lighting) + 1) % LIGHTINGS.length]!

  return (
    <div
      role="group"
      aria-label={dock.label}
      style={{ '--panel-display': 'flex' } as React.CSSProperties}
      className="live-panel glass fixed bottom-6 left-1/2 z-30 -translate-x-1/2 items-center rounded-full p-1"
    >
      {ACTIONS.map((name) => (
        <IconButton
          key={name}
          icon={name}
          label={dock.actions[name]}
          onClick={() => sendCommand({ kind: 'action', name })}
        />
      ))}
      <IconButton
        icon="bite"
        accent
        label={dock.actions.bite}
        onClick={() => {
          // Inside the click, so the bite is heard before the sound is on.
          wakeAudio()
          sendCommand({ kind: 'bite' })
        }}
      />
      <Divider />
      <IconButton
        icon="light"
        label={`${dock.light}: ${dock.lights[state.lighting]}`}
        onClick={() => setShowcase({ lighting: nextLight })}
      />
      <Divider />
      <IconButton
        icon="spin"
        label={dock.view.spin}
        pressed={state.spin}
        onClick={() => setShowcase({ spin: !state.spin })}
      />
      <IconButton
        icon="xray"
        label={dock.view.xray}
        pressed={state.xray}
        onClick={() => setShowcase({ xray: !state.xray })}
      />
      <IconButton
        icon="reset"
        label={dock.view.reset}
        onClick={() => sendCommand({ kind: 'resetView' })}
      />
    </div>
  )
}
