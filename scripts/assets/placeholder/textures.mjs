/**
 * Body textures of the placeholder, painted with the tiny rasteriser in
 * ../png.mjs. Eyes and the expression atlas live in ../assembly/textures.mjs.
 */
import { Canvas, hexToRgb } from '../png.mjs'

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

/**
 * Body tone ramp. Vertex UV.v picks the tone: 0 = shadow side (mascot-700),
 * 0.5 = main skin (mascot-500), 1 = belly (mascot-300).
 */
export function bodyBaseColor(colors, size) {
  const deep = hexToRgb(colors.mascot['700'])
  const base = hexToRgb(colors.mascot['500'])
  const light = hexToRgb(colors.mascot['300'])
  const canvas = new Canvas(size, size)
  canvas.shade((_u, v) => [
    ...(v < 0.5 ? mix(deep, base, v * 2) : mix(base, light, (v - 0.5) * 2)),
    1,
  ])
  return canvas.toPng()
}

/** Occlusion 1, roughness 0.6, metalness 0 (glTF ORM packing: R, G, B). */
export function bodyOrm(size) {
  const canvas = new Canvas(size, size, [255, 153, 0, 1])
  return canvas.toPng()
}

/** Flat tangent-space normal map. */
export function bodyNormal(size) {
  return new Canvas(size, size, [128, 128, 255, 1]).toPng()
}
