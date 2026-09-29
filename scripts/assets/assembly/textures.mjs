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
 * and converted to pixels per axis. The blush was designed around y 0.85;
 * `offsetY` moves it and `scale` resizes it for another head. The mouth is
 * the T-rex jaw's lip line (layout.lip), drawn exactly where the lips are cut
 * (assembly/mouth.mjs), so at rest it reads as a wide smile and, as the jaw
 * opens, it splits into a dark edge on each lip.
 * @param {{ patch: { xMin: number, xMax: number, yMin: number, yMax: number }, offsetY?: number, scale?: number, lip: { y: number, halfWidth: number, smile: number } }} layout
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
  const { lip } = layout
  /** Lip line thickness in metres. */
  const LIP_WIDTH = 0.0032
  // A soft rose: lavender blush on violet skin read as a pale smudge, like tears.
  const blush = [240, 150, 205]

  const draw = (cellXY, paintCell) => {
    const [cx, cy] = cellXY
    const px = (x) => cx * cell + (x - xMin) * sx
    const py = (y) => cy * cell + (yMax - y) * sy
    const bounds = [cx * cell, cy * cell, (cx + 1) * cell, (cy + 1) * cell]
    paintCell({
      // The lip line, in real metres like the cut; `curl` lifts the corners into a smile.
      lip: (curl = 0) => {
        const points = Array.from({ length: 49 }, (_, i) => {
          const u = -1 + (2 * i) / 48
          const x = u * lip.halfWidth
          const corner = Math.max(0, Math.abs(u) - 0.7) / 0.3
          return [px(x), py(lip.y + lip.smile * u * u + curl * corner * corner)]
        })
        const ys = points.map((p) => p[1])
        const pad = 6
        canvas.paint(sdf.polyline(points, LIP_WIDTH * sy), mouth, 1, [
          Math.max(bounds[0], points[0][0] - pad),
          Math.max(bounds[1], Math.min(...ys) - pad),
          Math.min(bounds[2], points.at(-1)[0] + pad),
          Math.min(bounds[3], Math.max(...ys) + pad),
        ])
      },
      // Out on the cheeks at mouth height, clear of the eyes, as one soft spot
      // that fades to nothing: stacked ellipses showed their rings up close.
      blush: (alpha) => {
        for (const side of [-1, 1]) {
          canvas.paint(
            sdf.softEllipse(px(0.15 * side * k), py(0.874 + oy), 0.03 * k * sx, 0.018 * k * sy),
            blush,
            alpha,
            bounds,
          )
        }
      },
    })
  }

  const cells = expressions.cells
  // The real jaw opens the mouth; the atlas only carries the lip line and blush.
  draw(cells.neutral, (p) => {
    p.blush(0.5)
    p.lip()
  })
  draw(cells.happy, (p) => {
    p.blush(0.7)
    p.lip(0.012)
  })
  draw(cells.surprised, (p) => {
    p.blush(0.35)
    p.lip()
  })
  draw(cells.roar, (p) => {
    p.blush(0.25)
    p.lip()
  })
  return canvas.toPng()
}
