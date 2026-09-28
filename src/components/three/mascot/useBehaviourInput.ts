'use client'

/**
 * Page-wide input for the behaviour layer. The stage is pointer-events-none
 * so the hero text stays selectable and the CTA clickable; Kelo therefore
 * listens on the window rather than on the canvas.
 *
 * - pointermove and pointerdown move his attention to the pointer or finger;
 * - leaving the window hands it back to the camera straight away;
 * - a click or tap outside links and buttons is tested against his body;
 * - any element marked data-gaze-target draws his look on hover and on
 *   keyboard focus, so keyboard users get the same reaction.
 *
 * The HTML never imports the 3D chunk: the markers are plain attributes.
 */
import { useEffect } from 'react'
import type { BehaviourController } from './BehaviourController'

const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"], [contenteditable]'

export function useBehaviourInput(controller: BehaviourController) {
  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)')
    const updateCoarse = () => controller.setTouchFirst(coarse.matches)
    updateCoarse()
    coarse.addEventListener('change', updateCoarse)

    const move = (event: PointerEvent) =>
      controller.pointerAt(event.clientX, event.clientY, event.pointerType)
    const down = (event: PointerEvent) => {
      controller.pointerAt(event.clientX, event.clientY, event.pointerType)
      const target = event.target as Element | null
      if (event.isPrimary && !target?.closest(INTERACTIVE))
        controller.tap(event.clientX, event.clientY)
    }
    const out = (event: MouseEvent) => {
      if (!event.relatedTarget) controller.pointerLeft()
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', down, { passive: true })
    window.addEventListener('mouseout', out)

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
      coarse.removeEventListener('change', updateCoarse)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('mouseout', out)
      for (const { element, on } of handlers) {
        for (const [type, handler] of Object.entries(on)) element.removeEventListener(type, handler)
      }
    }
  }, [controller])
}
