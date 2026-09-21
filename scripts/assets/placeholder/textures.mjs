/**
 * Procedural textures for the placeholder, painted with the tiny rasteriser
 * in ../png.mjs. Colours come from character.json; nothing is downloaded.
 */
import { Canvas, hexToRgb, sdf } from '../png.mjs'
import { EYE, FACE_PATCH } from './shapes.mjs'

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

/** Sclera, violet iris ring and a big dark pupil, centred for a front projection. */
export function eyesBaseColor(colors, size) {
  const c = size / 2
  const canvas = new Canvas(size, size, [...hexToRgb(colors.eyes.sclera), 1])
  canvas.paint(sdf.circle(c, c, c * EYE.irisRatio), hexToRgb(colors.mascot['700']))
  canvas.paint(sdf.circle(c, c, c * EYE.irisRatio * 0.86), hexToRgb(colors.mascot['500']), 0.55)
  canvas.paint(sdf.circle(c, c, c * EYE.pupilRatio), hexToRgb(colors.eyes.iris))
  return canvas.toPng()
}

/**
 * 2x2 expression atlas on a transparent background. Each cell maps the front
 * projection of the face shell (FACE_PATCH), so shapes are drawn in metres
 * and converted to pixels per axis.
 */
export function faceAtlas(colors, expressions, size) {
  const cell = size / expressions.grid[0]
  const { xMin, xMax, yMin, yMax } = FACE_PATCH
  const sx = cell / (xMax - xMin)
  const sy = cell / (yMax - yMin)
  const canvas = new Canvas(size, size)
  const mouth = hexToRgb(colors.brandMono.ink900)
  const tongue = [233, 142, 196]
  const blush = hexToRgb(colors.mascot['300'])

  const draw = (cellXY, paintCell) => {
    const [cx, cy] = cellXY
    const px = (x) => cx * cell + (x - xMin) * sx
    const py = (y) => cy * cell + (yMax - y) * sy
    const bounds = [cx * cell, cy * cell, (cx + 1) * cell, (cy + 1) * cell]
    paintCell({
      ellipse: (x, y, rx, ry, rgb, alpha = 1) =>
        canvas.paint(sdf.ellipse(px(x), py(y), rx * sx, ry * sy), rgb, alpha, bounds),
      halfEllipse: (x, y, rx, ry, rgb) =>
        canvas.paint(
          sdf.intersect(sdf.ellipse(px(x), py(y), rx * sx, ry * sy), (_px, pyy) => py(y) - pyy),
          rgb,
          1,
          bounds,
        ),
      smile: (x, y, rx, ry, width) =>
        canvas.paint(
          sdf.arc(px(x), py(y), rx * sx, ry * sy, Math.PI * 0.12, Math.PI * 0.88, width * sy),
          mouth,
          1,
          bounds,
        ),
      blush: (alpha) => {
        for (const side of [-1, 1])
          canvas.paint(
            sdf.ellipse(px(0.105 * side), py(0.9), 0.032 * sx, 0.016 * sy),
            blush,
            alpha,
            bounds,
          )
      },
    })
  }

  const cells = expressions.cells
  draw(cells.neutral, (p) => {
    p.blush(0.45)
    p.smile(0, 0.862, 0.034, 0.018, 0.008)
  })
  draw(cells.happy, (p) => {
    p.blush(0.75)
    p.halfEllipse(0, 0.858, 0.042, 0.03, mouth)
    p.ellipse(0, 0.838, 0.02, 0.009, tongue)
  })
  draw(cells.surprised, (p) => {
    p.blush(0.3)
    p.ellipse(0, 0.845, 0.017, 0.022, mouth)
  })
  draw(cells.roar, (p) => {
    p.blush(0.2)
    p.ellipse(0, 0.848, 0.05, 0.042, mouth)
    p.ellipse(0, 0.822, 0.028, 0.012, tongue)
  })
  return canvas.toPng()
}
