#!/usr/bin/env node
/**
 * Export Kelo Run's pixel-art Kelo as an SVG, for the studio's site
 * (KELOR_Interactive), where he waits in a corner and links to this sandbox.
 * The sprite is the game's own (src/lib/game/sprites.ts), so both stay the
 * same character: regenerate the SVG whenever the sprite changes.
 *
 *   node --experimental-transform-types scripts/review/export-pixel-kelo.mjs <out.svg>
 *
 * The SVG holds two frames as groups, standing (.kelo-stand) and jumping
 * (.kelo-jump), each one path per colour, and crisp edges at any size. It is
 * decorative (aria-hidden): the link around it carries the name.
 */
import { writeFileSync } from 'node:fs'
import { kelo, PALETTE } from '../../src/lib/game/sprites.ts'

const FRAMES = [
  ['kelo-stand', 'runA'],
  ['kelo-jump', 'jump'],
]

/** One path per colour: each row's runs of that colour as rectangles. */
function paths(sprite) {
  const byColour = new Map()
  for (let y = 0; y < sprite.height; y++) {
    let x = 0
    while (x < sprite.width) {
      const colour = sprite.pixels[y * sprite.width + x]
      let end = x + 1
      while (end < sprite.width && sprite.pixels[y * sprite.width + end] === colour) end++
      if (colour) {
        const d = byColour.get(colour) ?? []
        d.push(`M${x} ${y}h${end - x}v1h${x - end}z`)
        byColour.set(colour, d)
      }
      x = end
    }
  }
  return [...byColour]
    .sort(([a], [b]) => a - b)
    .map(([colour, d]) => `<path fill="${PALETTE[colour]}" d="${d.join('')}"/>`)
    .join('')
}

const [out] = process.argv.slice(2)
if (!out) throw new Error('usage: export-pixel-kelo.mjs <out.svg>')
const { width, height } = kelo('runA')
const groups = FRAMES.map(([name, frame]) => `<g class="${name}">${paths(kelo(frame))}</g>`)
const svg =
  `<!-- Kelo Run's Kelo, exported from kelor.mascot src/lib/game/sprites.ts by scripts/review/export-pixel-kelo.mjs -->\n` +
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges" class="kelo-pixel" aria-hidden="true" focusable="false">` +
  groups.join('') +
  `</svg>\n`
writeFileSync(out, svg)
console.log(`${out}: ${width} x ${height} pixels, ${FRAMES.length} frames, ${svg.length} bytes`)
