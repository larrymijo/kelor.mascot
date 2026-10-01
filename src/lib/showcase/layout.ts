/**
 * The page's two layouts (docs/interaction-script.md) and how the camera
 * frames Kelo in each. The page is minimal: a dark stage, the studio's mark,
 * a small title and, on desktop, a slim dock, so Kelo stands small in the
 * middle of the dark, like a precious object on a plinth.
 *
 * - The sandbox, on a wide screen with a fine pointer that hovers: the dock
 *   at the bottom.
 * - Everywhere else (phones, tablets, narrow windows): the title and the
 *   call to action at the bottom.
 */
import type { FramingInput } from '@/lib/scene/framing'
import { SIZE } from './size'

/** The CSS media query of the sandbox layout; globals.css uses the same one. */
export const SANDBOX_QUERY = '(min-width: 1024px) and (hover: hover) and (pointer: fine)'

export type Layout = Pick<FramingInput, 'fill' | 'topReserve' | 'bottomReserve'> & {
  /** Where Kelo stands across the screen, 0 left to 1 right. */
  centreX: number
}

/**
 * The share of the screen Kelo fills, the bands kept around him, and where
 * he stands. In the sandbox the fill is where the size slider starts
 * (size.ts); the camera applies the slider on top.
 */
export function layoutFraming(aspect: number, sandbox: boolean): Layout {
  if (sandbox)
    return { fill: SIZE.defaultFill, topReserve: 0.06, bottomReserve: 0.14, centreX: 0.5 }
  if (aspect < 1) return { fill: 0.5, topReserve: 0.1, bottomReserve: 0.16, centreX: 0.5 }
  return { fill: 0.45, topReserve: 0.1, bottomReserve: 0.14, centreX: 0.5 }
}

/**
 * The bite's framing: whatever the layout, it is played at the close hero
 * shot of phase 8, so his jaws still fill the screen.
 */
export const BITE_FRAMING: Layout = { fill: 0.72, topReserve: 0, bottomReserve: 0.12, centreX: 0.5 }
