/**
 * Camera framing for the stage: how far the camera must be, and where it
 * must look, so the subject fills a share of the screen that is left free
 * by the text at the bottom. Works for portrait phones and wide desktops.
 */
import { degToRad } from '@/lib/math/damp'

export interface FramingInput {
  /** Viewport width / height. */
  aspect: number
  /** Vertical field of view in degrees. */
  fovDeg: number
  subjectHeightM: number
  subjectWidthM: number
  /** World-space vertical centre of the subject. */
  subjectCenterY: number
  /** Share of the free area the subject should fill, 0 to 1. */
  fill: number
  /** Share of the viewport height reserved for text at the bottom, 0 to 1. */
  bottomReserve: number
}

export interface Framing {
  distance: number
  /** Y the camera looks at; lower than the subject centre when text is reserved. */
  targetY: number
}

export function frameSubject(input: FramingInput): Framing {
  const { aspect, fovDeg, subjectHeightM, subjectWidthM, subjectCenterY, fill, bottomReserve } =
    input
  const tanHalf = Math.tan(degToRad(fovDeg) / 2)
  const free = 1 - bottomReserve

  // The visible height at distance d is 2·d·tan(fov/2); the subject gets fill·free of it.
  const byHeight = subjectHeightM / (2 * fill * free * tanHalf)
  const byWidth = subjectWidthM / (2 * fill * aspect * tanHalf)
  const distance = Math.max(byHeight, byWidth)

  // Shift the view down so the subject sits centred in the free (upper) area.
  const halfHeight = distance * tanHalf
  return { distance, targetY: subjectCenterY - bottomReserve * halfHeight }
}

/**
 * Vertical screen position (NDC, -1 bottom to 1 top) of a world height seen
 * by a camera at `distance` looking at `targetY`, for tests and debugging.
 */
export function projectY(worldY: number, framing: Framing, fovDeg: number) {
  return (worldY - framing.targetY) / (framing.distance * Math.tan(degToRad(fovDeg) / 2))
}
