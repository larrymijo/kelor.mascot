'use client'

/**
 * Page-wide input for Kelo (docs/interaction-script.md). The stage is
 * pointer-events-none so the words stay selectable and the links clickable;
 * Kelo therefore listens on the window rather than on the canvas.
 *
 * - pointermove moves his attention to the pointer or finger, carries him
 *   while he is held, and shows the grab cursor over him;
 * - a press outside links and buttons is tested against his body: on him it
 *   becomes a tap or, on desktop, picks him up (no text selection while held);
 *   elsewhere a click sends him hopping to that spot;
 * - leaving the window hands his look back to the camera straight away;
 * - the Kelo button (#kelo-button) is the keyboard's way to him: Enter or
 *   Space taps him, the arrow keys make him hop;
 * - any element marked data-gaze-target draws his look on hover and on
 *   keyboard focus, so keyboard users get the same reaction;
 * - on desktop every press on him (or on the Kelo button) wakes the audio
 *   engine inside that press, since browsers only start audio there: the
 *   sixth in a row bites, and the bite is heard before the sound is on.
 *
 * The HTML never imports the 3D chunk: the markers are plain attributes.
 */
import { useEffect } from 'react'
import { wakeAudio } from '@/lib/sound/control'
import type { BehaviourController } from './BehaviourController'

const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"], [contenteditable]'

export function useBehaviourInput(controller: BehaviourController) {
  useEffect(() => {
    const root = document.documentElement
    const coarse = window.matchMedia('(pointer: coarse)')
    const fine = window.matchMedia('(pointer: fine)')
    const hover = window.matchMedia('(hover: hover)')
    const updateDevice = () => {
      controller.setTouchFirst(coarse.matches)
      controller.setDevice({
        finePointer: fine.matches,
        canHover: hover.matches,
        widthPx: window.innerWidth,
      })
    }
    updateDevice()
    for (const query of [coarse, fine, hover]) query.addEventListener('change', updateDevice)
    window.addEventListener('resize', updateDevice, { passive: true })

    let captured: { element: Element; pointerId: number } | null = null
    const letGo = () => {
      if (captured?.element.hasPointerCapture(captured.pointerId))
        captured.element.releasePointerCapture(captured.pointerId)
      captured = null
      root.removeAttribute('data-kelo-held')
    }

    const move = (event: PointerEvent) => {
      controller.pointerAt(event.clientX, event.clientY, event.pointerType)
      if (!event.isPrimary) return
      controller.dragTo(event.clientX, event.clientY)
      root.toggleAttribute('data-kelo-held', controller.held)
      if (event.pointerType === 'mouse')
        root.toggleAttribute('data-kelo-hover', controller.hovers(event.clientX, event.clientY))
    }
    const down = (event: PointerEvent) => {
      controller.pointerAt(event.clientX, event.clientY, event.pointerType)
      if (!event.isPrimary || event.button > 0) return
      const target = event.target as Element | null
      if (target?.closest(INTERACTIVE)) return
      if (!controller.pressAt(event.clientX, event.clientY)) return
      if (controller.canBite) wakeAudio()
      // On Kelo: no text selection or native drag, and keep the pointer if it leaves the window.
      event.preventDefault()
      const element = target ?? root
      try {
        element.setPointerCapture(event.pointerId)
        captured = { element, pointerId: event.pointerId }
      } catch {
        captured = null
      }
    }
    const up = (event: PointerEvent) => {
      if (!event.isPrimary) return
      if (controller.pressing && controller.canBite) wakeAudio()
      controller.lift(event.clientX, event.clientY)
      letGo()
    }
    const out = (event: MouseEvent) => {
      if (!event.relatedTarget) {
        controller.pointerLeft()
        root.removeAttribute('data-kelo-hover')
      }
    }
    window.addEventListener('pointermove', move, { passive: true })
    // Not passive: a press on Kelo prevents text selection.
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('mouseout', out)

    const button = document.getElementById('kelo-button')
    const tap = () => {
      if (controller.canBite) wakeAudio()
      controller.key('tap')
    }
    const arrows = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      controller.key(event.key === 'ArrowLeft' ? 'left' : 'right')
    }
    button?.addEventListener('click', tap)
    button?.addEventListener('keydown', arrows)

    const targets = [...document.querySelectorAll<HTMLElement>('[data-gaze-target]')]
    const handlers = targets.map((element) => {
      const rect = () => element.getBoundingClientRect()
      const on = {
        pointerenter: () => controller.attend('hover', rect()),
        pointerleave: () => controller.release('hover'),
        focus: () => controller.attend('focus', rect()),
        blur: () => controller.release('focus'),
      }
      for (const [type, handler] of Object.entries(on)) element.addEventListener(type, handler)
      return { element, on }
    })

    return () => {
      for (const query of [coarse, fine, hover]) query.removeEventListener('change', updateDevice)
      window.removeEventListener('resize', updateDevice)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('mouseout', out)
      button?.removeEventListener('click', tap)
      button?.removeEventListener('keydown', arrows)
      letGo()
      root.removeAttribute('data-kelo-hover')
      for (const { element, on } of handlers) {
        for (const [type, handler] of Object.entries(on)) element.removeEventListener(type, handler)
      }
    }
  }, [controller])
}
