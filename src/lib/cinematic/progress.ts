/**
 * The page's scroll progress, 0 at the top to 1 at the bottom. The lazy
 * cinematic engine writes it; the stage reads it every frame. A plain object
 * rather than state: it changes on every scroll event and nothing should
 * re-render because of it.
 */
import { clamp } from '@/lib/math/damp'

export const scrollProgress = { value: 0 }

export function setScrollProgress(value: number) {
  scrollProgress.value = clamp(value, 0, 1)
}
