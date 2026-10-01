'use client'

import { useEffect, useRef, useState } from 'react'
import { copy } from '@/lib/copy'
import {
  createRunner,
  GROUND_Y,
  HEIGHT,
  press,
  release,
  stepRunner,
  WIDTH,
  type Obstacle,
  type Phase,
  type RunnerState,
} from '@/lib/game/runner'
import {
  bug,
  bugPair,
  cloud,
  kelo,
  moth,
  PALETTE,
  pixelText,
  type Sprite,
} from '@/lib/game/sprites'
import { playSound } from '@/lib/sound/bus'
import { wakeAudio } from '@/lib/sound/control'
import { ConsoleShell } from './ConsoleShell'

const STEP_S = 1 / 120
const BEST_KEY = 'kelo-run-best'
const { game } = copy

/** A sprite painted once onto its own small canvas, to be stamped every frame. */
function bake(sprite: Sprite) {
  const canvas = document.createElement('canvas')
  canvas.width = sprite.width
  canvas.height = sprite.height
  const context = canvas.getContext('2d')!
  sprite.pixels.forEach((index, i) => {
    if (!index) return
    context.fillStyle = PALETTE[index]!
    context.fillRect(i % sprite.width, Math.floor(i / sprite.width), 1, 1)
  })
  return canvas
}

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

function saveBest(best: number) {
  try {
    localStorage.setItem(BEST_KEY, String(best))
  } catch {
    // Private mode or storage blocked: the record lasts this visit only.
  }
}

/** Fixed pixels: a few stars and the moon in the night sky, clear of the score. */
const STARS = [
  [14, 8],
  [37, 18],
  [58, 6],
  [83, 22],
  [104, 11],
  [131, 5],
  [150, 19],
  [176, 34],
  [199, 15],
  [221, 30],
  [230, 24],
  [66, 30],
  [120, 28],
] as const

/**
 * Kelo Run: the pixel runner a phone opens on the ninth tap in a row, and
 * the dock's button on desktop (docs/interaction-script.md). A dialog over
 * the page with the game on the screen of a KELOR handheld (ConsoleShell):
 * Kelo runs, a press anywhere (or Space, or the arrow up) jumps over the
 * bugs, the score climbs and the record is kept on the device. The game's
 * rules live in src/lib/game/runner.ts; this draws them on a 240 x 100
 * canvas scaled up with crisp pixels, at a fixed 120 steps a second. Esc or
 * the close button returns to Kelo.
 */
export default function RunnerGame({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<Phase>('ready')

  useEffect(() => {
    const element = dialog.current
    const context = canvas.current?.getContext('2d')
    if (!element || !context) return
    const returnFocus = document.activeElement as HTMLElement | null
    element.focus()

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const sprites = {
      runA: bake(kelo('runA')),
      runB: bake(kelo('runB')),
      jump: bake(kelo('jump')),
      hurt: bake(kelo('hurt')),
      bug: [bake(bug('a')), bake(bug('b'))],
      bigBug: [bake(bug('a', 14, 12)), bake(bug('b', 14, 12))],
      bugPair: [bake(bugPair('a')), bake(bugPair('b'))],
      moth: [bake(moth('a')), bake(moth('b'))],
      cloud: bake(cloud()),
    }
    const state: RunnerState = createRunner(readBest())
    let shownPhase: Phase = 'ready'
    let frame = 0
    let last = performance.now()
    let accumulator = 0
    let clock = 0

    const events = (list: string[]) => {
      for (const event of list) {
        if (event === 'jump') playSound('blip')
        else if (event === 'point') playSound('coin')
        else if (event === 'crash') {
          playSound('crash')
          saveBest(state.best)
        }
      }
    }

    const draw = () => {
      context.imageSmoothingEnabled = false
      // Sky, stars and moon.
      const sky = context.createLinearGradient(0, 0, 0, GROUND_Y)
      sky.addColorStop(0, '#120a22')
      sky.addColorStop(1, '#2b1a4d')
      context.fillStyle = sky
      context.fillRect(0, 0, WIDTH, HEIGHT)
      context.fillStyle = '#d9c7ff'
      for (const [x, y] of STARS) {
        const twinkle = reduced ? 1 : Math.sin(clock * 2 + x) > -0.6 ? 1 : 0
        if (twinkle) context.fillRect(x, y, 1, 1)
      }
      context.fillStyle = '#f4eee2'
      context.fillRect(196, 12, 7, 7)
      context.fillStyle = '#2b1a4d'
      context.fillRect(199, 11, 5, 6)

      // Clouds and hills scroll slower than the ground: parallax.
      for (const [offset, y] of [
        [0, 20],
        [110, 30],
        [190, 14],
      ] as const) {
        const x = WIDTH - ((state.scroll * 0.15 + offset) % (WIDTH + 20))
        context.globalAlpha = 0.35
        context.drawImage(sprites.cloud, Math.round(x), y)
        context.globalAlpha = 1
      }
      context.fillStyle = '#23163f'
      const hills = state.scroll * 0.35
      for (let x = 0; x < WIDTH; x++) {
        const h = 10 + Math.round(6 * Math.sin((x + hills) / 23) + 4 * Math.sin((x + hills) / 9))
        context.fillRect(x, GROUND_Y - h, 1, h)
      }

      // The ground: a bright line, dark earth and pebbles running by.
      context.fillStyle = '#b794ff'
      context.fillRect(0, GROUND_Y, WIDTH, 1)
      context.fillStyle = '#170f2b'
      context.fillRect(0, GROUND_Y + 1, WIDTH, HEIGHT - GROUND_Y - 1)
      context.fillStyle = '#7a3fe4'
      for (let i = 0; i < 24; i++) {
        const x = Math.round((WIDTH - ((state.scroll + i * 37) % WIDTH) + WIDTH) % WIDTH)
        context.fillRect(x, GROUND_Y + 3 + ((i * 7) % 9), i % 3 === 0 ? 2 : 1, 1)
      }

      // Bugs and moths, their legs and wings flicking.
      const flick = Math.floor(clock * 8) % 2
      for (const obstacle of state.obstacles as Obstacle[]) {
        const art = sprites[obstacle.kind][flick]!
        context.drawImage(art, Math.round(obstacle.x), Math.round(obstacle.y))
      }

      // Kelo: running legs, tucked in the air, crossed eyes after a crash.
      const art =
        state.phase === 'over'
          ? sprites.hurt
          : !state.grounded
            ? sprites.jump
            : state.phase === 'running'
              ? Math.floor(clock * 10) % 2
                ? sprites.runA
                : sprites.runB
              : Math.floor(clock * 2) % 2
                ? sprites.runA
                : sprites.runB
      context.drawImage(art, 21, Math.round(state.y) - 2)

      // The score, and the record in dimmer pixels.
      const score = String(Math.floor(state.score)).padStart(5, '0')
      const best = `HI ${String(state.best).padStart(5, '0')}`
      context.fillStyle = '#8f7fb8'
      for (const [x, y] of pixelText(best))
        context.fillRect(WIDTH - 60 - best.length * 4 + x, 5 + y, 1, 1)
      context.fillStyle = '#f7f7f7'
      for (const [x, y] of pixelText(score))
        context.fillRect(WIDTH - 4 - score.length * 4 + x, 5 + y, 1, 1)
    }

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      clock += dt
      accumulator += dt
      while (accumulator >= STEP_S) {
        events(stepRunner(state, STEP_S))
        accumulator -= STEP_S
      }
      if (state.phase !== shownPhase) {
        shownPhase = state.phase
        setPhase(state.phase)
      }
      element.dataset.gameScore = String(Math.floor(state.score))
      draw()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    // Taps and keys: a press jumps (or starts, or restarts), letting go shortens
    // the jump. The handheld's A button and D-pad show it (data-pressed).
    // Heard from the start, like the bite: every press keeps the audio awake
    // (iOS may have stopped it), and the lift too, since iOS counts only that.
    playSound('gameStart')
    const jump = () => {
      wakeAudio()
      element.dataset.pressed = ''
      events(press(state))
    }
    const land = () => {
      wakeAudio()
      delete element.dataset.pressed
      release(state)
    }
    const down = (event: PointerEvent) => {
      if ((event.target as Element).closest('button')) return
      event.preventDefault()
      jump()
    }
    const up = () => land()
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== ' ' && event.key !== 'ArrowUp') return
      event.preventDefault()
      if (!event.repeat) jump()
    }
    const keyUp = (event: KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'ArrowUp') land()
    }
    // Paused while the tab is hidden: no catching up afterwards.
    const visibility = () => {
      last = performance.now()
      accumulator = 0
    }
    element.addEventListener('pointerdown', down)
    element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', up)
    element.addEventListener('keydown', keyDown)
    element.addEventListener('keyup', keyUp)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      cancelAnimationFrame(frame)
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', up)
      element.removeEventListener('keydown', keyDown)
      element.removeEventListener('keyup', keyUp)
      document.removeEventListener('visibilitychange', visibility)
      playSound('gameEnd')
      saveBest(state.best)
      returnFocus?.focus?.()
    }
  }, [onClose])

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={game.label}
      aria-describedby="runner-help"
      tabIndex={-1}
      data-game-phase={phase}
      className="group fixed inset-0 z-50 flex touch-none flex-col items-center justify-center overflow-y-auto bg-[#07040d]/94 px-3 py-16 outline-none select-none"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={game.close}
        className="absolute top-4 right-4 inline-flex size-11 items-center justify-center rounded-full border border-white/15 text-ink-100 transition-colors hover:border-mascot-300"
      >
        <svg
          viewBox="0 0 16 16"
          className="size-4"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>

      <ConsoleShell>
        <canvas
          ref={canvas}
          width={WIDTH}
          height={HEIGHT}
          className="block aspect-[240/100] w-full [image-rendering:pixelated]"
        />
        {phase !== 'running' && (
          <div
            aria-live="polite"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#120a22]/45 text-center"
          >
            <p className="font-display text-xl font-extrabold tracking-[0.2em] text-mascot-glow handheld-wide:text-4xl">
              {phase === 'over' ? game.over : game.title}
            </p>
            <p className="font-display text-[0.6rem] font-semibold tracking-[0.25em] text-ink-100 uppercase handheld-wide:text-xs">
              <span className="hint-pointer">
                {phase === 'over' ? game.again.pointer : game.start.pointer}
              </span>
              <span className="hint-touch">
                {phase === 'over' ? game.again.touch : game.start.touch}
              </span>
            </p>
          </div>
        )}
      </ConsoleShell>
      <p id="runner-help" className="mt-6 max-w-sm text-center text-[0.75rem] text-ink-300">
        <span className="hint-pointer">{game.help.pointer}</span>
        <span className="hint-touch">{game.help.touch}</span>
      </p>
    </div>
  )
}
