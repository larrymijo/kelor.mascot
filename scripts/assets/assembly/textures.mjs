/**
 * Procedural contract textures shared by every body: the eyes and the 2x2
 * expression atlas. Colours come from character.json; nothing is downloaded.
 */
import { Canvas, hexToRgb, sdf } from '../png.mjs'
import { EYE } from './features.mjs'

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
 * projection of the face shell (layout.patch), so shapes are drawn in metres
 * and converted to pixels per axis. The mouth and blush were designed around
 * y 0.85; `offsetY` moves them and `scale` resizes them for another head.
 * @param {{ patch: { xMin: number, xMax: number, yMin: number, yMax: number }, offsetY?: number, scale?: number }} layout
 */
export function faceAtlas(colors, expressions, size, layout) {
  const cell = size / expressions.grid[0]
  const { xMin, xMax, yMin, yMax } = layout.patch
  const oy = layout.offsetY ?? 0
  const k = layout.scale ?? 1
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
        canvas.paint(
          sdf.ellipse(px(x * k), py(y + oy), rx * k * sx, ry * k * sy),
          rgb,
          alpha,
          bounds,
        ),
      halfEllipse: (x, y, rx, ry, rgb) =>
        canvas.paint(
          sdf.intersect(
            sdf.ellipse(px(x * k), py(y + oy), rx * k * sx, ry * k * sy),
            (_px, pyy) => py(y + oy) - pyy,
          ),
          rgb,
          1,
          bounds,
        ),
      smile: (x, y, rx, ry, width) =>
        canvas.paint(
          sdf.arc(
            px(x * k),
            py(y + oy),
            rx * k * sx,
            ry * k * sy,
            Math.PI * 0.12,
            Math.PI * 0.88,
            width * k * sy,
          ),
          mouth,
          1,
          bounds,
        ),
      blush: (alpha) => {
        for (const side of [-1, 1])
          canvas.paint(
            sdf.ellipse(px(0.105 * side * k), py(0.9 + oy), 0.032 * k * sx, 0.016 * k * sy),
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
