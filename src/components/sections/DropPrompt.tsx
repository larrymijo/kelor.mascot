'use client'

import { useEffect, type MouseEvent } from 'react'
import { copy } from '@/lib/copy'
import { dropEgg } from '@/lib/showcase/state'
import { onStage } from '@/lib/showcase/targets'

/**
 * A click or tap on the prompt drops the egg under it, like anywhere else on
 * the stage (on a phone the line spans most of the width); from the keyboard
 * it drops in the middle. Then the button disappears with the prompt and the
 * keyboard's focus would fall to the page: hand it to the Kelo button (next
 * in the tab order) as soon as he has hatched and it shows.
 */
function dropFrom(event: MouseEvent<HTMLButtonElement>) {
  const pointer = event.detail > 0
  dropEgg(pointer ? { clientX: event.clientX, clientY: event.clientY } : undefined)
  const keyboard = !pointer && document.activeElement === event.currentTarget
  if (!keyboard) return
  const root = document.documentElement
  const watch = new MutationObserver(() => {
    if (!root.classList.contains('hatched')) return
    watch.disconnect()
    const lost = document.activeElement === document.body || document.activeElement === null
    if (lost) document.getElementById('kelo-button')?.focus()
  })
  watch.observe(root, { attributes: true, attributeFilter: ['class'] })
}

/**
 * The first thing on the dark stage (docs/interaction-script.md): a quiet
 * line inviting the visitor to drop the egg, over a thin falling tick. A
 * click or tap anywhere on the stage, the prompt included, drops it there;
 * the button is also the keyboard's (and the screen reader's) way, dropping
 * it in the middle. It
 * only shows while the stage waits for the drop (html.waiting), and sits
 * just before the Kelo button in the tab order.
 */
export function DropPrompt() {
  const { drop } = copy

  // A press anywhere on the stage drops the egg under it (the scene keeps it
  // inside the screen), whether or not the model has arrived yet.
  useEffect(() => {
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button > 0) return
      if (!document.documentElement.classList.contains('waiting')) return
      if (!onStage(event.target as Element | null)) return
      dropEgg({ clientX: event.clientX, clientY: event.clientY })
    }
    window.addEventListener('pointerdown', down)
    return () => window.removeEventListener('pointerdown', down)
  }, [])

  return (
    <button
      id="drop-button"
      type="button"
      aria-label={drop.label}
      onClick={dropFrom}
      className="drop-prompt fixed top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-5 rounded-md px-6 py-4 text-center outline-offset-4"
    >
      <span
        aria-hidden="true"
        className="drop-tick block h-12 w-px bg-gradient-to-b from-transparent to-ink-300"
      />
      <span className="font-display text-[0.66rem] font-semibold tracking-[0.42em] whitespace-nowrap text-ink-300 uppercase">
        <span className="hint-pointer">{drop.pointer}</span>
        <span className="hint-touch">{drop.touch}</span>
      </span>
    </button>
  )
}
