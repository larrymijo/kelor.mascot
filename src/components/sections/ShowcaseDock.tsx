'use client'

import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { copy } from '@/lib/copy'
import {
  ACTIONS,
  DEFAULT_SHOWCASE,
  LIGHTINGS,
  onShowcase,
  requestGame,
  sendCommand,
  setShowcase,
  showcase,
  type ActionName,
} from '@/lib/showcase/state'
import { isPixel, parseSize } from '@/lib/showcase/size'
import { wakeAudio } from '@/lib/sound/control'

/** The size the visitor chose stays: for the bite, Centrar and the next visit. */
const SIZE_KEY = 'kelo-size'

function readSize() {
  try {
    return parseSize(localStorage.getItem(SIZE_KEY))
  } catch {
    return null
  }
}

function saveSize(size: number) {
  try {
    localStorage.setItem(SIZE_KEY, size.toFixed(3))
  } catch {
    // Private mode or storage blocked: the size lasts this visit only.
  }
}

/** Kelo Run is heard from the start: wake the audio inside the click that opens it. */
function play() {
  wakeAudio()
  requestGame()
}

const { dock } = copy.showcase

/** Thin-stroke icons, 24 px grid. */
const ICONS: Record<ActionName | 'bite' | 'light' | 'spin' | 'xray' | 'reset' | 'game', ReactNode> =
  {
    wave: (
      <path d="M8 12.5V6.5a1.5 1.5 0 0 1 3 0V11m0-.5V4.5a1.5 1.5 0 0 1 3 0V11m0-.5v-4a1.5 1.5 0 0 1 3 0v7A6.5 6.5 0 0 1 10.5 20h-.3a5 5 0 0 1-4.1-2.1L3.8 14.6a1.5 1.5 0 0 1 2.4-1.8L8 14.5" />
    ),
    jump: <path d="M12 16V4.5M7.5 9 12 4.5 16.5 9M5 20h14" />,
    roar: (
      <path d="M4 10v4h3l4.5 3.5v-11L7 10H4Zm11.5-1a4 4 0 0 1 0 6m2.5-8.5a7.5 7.5 0 0 1 0 11" />
    ),
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
    game: (
      <>
        <path d="M7.2 7.5h9.6a4.2 4.2 0 0 1 4.1 3.4l.8 4.3a2.6 2.6 0 0 1-4.5 2.2L15.3 15H8.7l-1.9 2.4a2.6 2.6 0 0 1-4.5-2.2l.8-4.3a4.2 4.2 0 0 1 4.1-3.4Z" />
        <path d="M8 9.7v3.4M6.3 11.4h3.4" />
        <circle cx="15.4" cy="12.4" r="0.5" fill="currentColor" />
        <circle cx="17.2" cy="10.6" r="0.5" fill="currentColor" />
      </>
    ),
  }

function IconButton({
  icon,
  label,
  pressed,
  accent,
  disabled,
  onClick,
}: {
  icon: keyof typeof ICONS
  label: string
  pressed?: boolean
  accent?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      data-tip={label}
      disabled={disabled}
      onClick={onClick}
      className={`tip relative inline-flex size-10 items-center justify-center rounded-full transition-colors duration-300 ease-out-quart disabled:cursor-default disabled:opacity-35 ${
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
 * The size slider: a pixel-art Kelo at the small end, a smooth one at the
 * large end. Its value is the slider's position on a log scale (size.ts);
 * screen readers hear a percentage, and "pixel art" at the small end.
 */
function SizeSlider({ size, onChange }: { size: number; onChange: (size: number) => void }) {
  const percent = Math.round(size * 100)
  const pixel = isPixel(size)
  return (
    <label data-tip={dock.size} className="tip relative flex items-center gap-2 px-2.5">
      {/* A pixel-art Kelo head: blocks. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="size-3.5 text-ink-300"
        fill="currentColor"
      >
        <path d="M4 2h5v1h1v3H8v1H6v3H3V8H2V5h2V2Zm3 2v1h1V4H7Z" />
      </svg>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={size}
        aria-label={dock.size}
        aria-valuetext={pixel ? `${percent} %, ${dock.pixel}` : `${percent} %`}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{
          background: `linear-gradient(to right, var(--color-mascot-300) ${percent}%, rgb(255 255 255 / 0.15) ${percent}%)`,
        }}
        className="h-1 w-24 cursor-pointer appearance-none rounded-full outline-offset-4 [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_3px_rgb(122_63_228/0.45)]"
      />
      {/* A smooth Kelo head, larger. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5 text-ink-300"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      >
        <path d="M6 18.5c-1.5-1.3-2.5-3.4-2.5-5.8C3.5 8 7 4.5 11.5 4.5c3.4 0 6 2 7 4.6 1.4.3 2.5 1.5 2.5 3 0 1.7-1.4 3-3.1 3H17v3.4" />
        <circle cx="13" cy="9.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    </label>
  )
}

/**
 * The desktop sandbox's dock (docs/interaction-script.md): one slim row of
 * icons under Kelo, named by tooltips and for screen readers. Actions play
 * a clip with its face and sound, and the bite (its press starts the audio,
 * as the sixth tap's does); the light cycles the studio's looks; the view
 * spins him on a turntable, shows him in x-ray and centres the camera
 * again; the size slider makes him smaller (pixel art at the small end) or
 * larger, and keeps it; the last button opens Kelo Run in its KELOR
 * handheld (phones get it on the ninth tap). Desktop only, like the whole
 * dock. It talks to the 3D chunk only through src/lib/showcase/state.ts.
 */
export function ShowcaseDock() {
  const state = useSyncExternalStore(onShowcase, showcase, () => DEFAULT_SHOWCASE)
  const nextLight = LIGHTINGS[(LIGHTINGS.indexOf(state.lighting) + 1) % LIGHTINGS.length]!
  const pixel = isPixel(state.size)

  // The size the visitor chose last time, before he hatches.
  useEffect(() => {
    const stored = readSize()
    if (stored !== null) setShowcase({ size: stored })
  }, [])

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
        // Pixel art has no jaws to bite with.
        disabled={pixel}
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
      <Divider />
      <SizeSlider
        size={state.size}
        onChange={(size) => {
          setShowcase({ size })
          saveSize(size)
        }}
      />
      <Divider />
      <IconButton icon="game" accent label={dock.game} onClick={play} />
    </div>
  )
}
