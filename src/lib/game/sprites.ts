/**
 * Kelo Run's pixel art, built from a few shapes rather than drawn by hand:
 * each sprite fills ellipses and boxes on a small grid of palette indices,
 * shades its lower half, and gets a one-pixel dark outline wherever an empty
 * pixel touches a filled one. Old-school, and consistent between frames.
 */

/** Palette indices: 0 is transparent. */
export const PALETTE = [
  '', // 0 transparent
  '#231433', // 1 outline
  '#7a3fe4', // 2 purple (mascot-500)
  '#5b2bb8', // 3 shade
  '#a67cf5', // 4 highlight
  '#d9c7ff', // 5 belly (mascot-glow)
  '#f7f7f7', // 6 eye white, teeth
  '#151515', // 7 pupil
  '#b794ff', // 8 plates (mascot-300)
  '#ff5c7a', // 9 bug shell
  '#c9304f', // 10 bug shade
  '#36e0ff', // 11 moth wing
  '#f4eee2', // 12 claws
] as const

const OUTLINE = 1
const PURPLE = 2
const SHADE = 3
const HIGHLIGHT = 4
const BELLY = 5
const WHITE = 6
const PUPIL = 7
const PLATE = 8
const SHELL = 9
const SHELL_SHADE = 10
const WING = 11
const CLAW = 12

export interface Sprite {
  width: number
  height: number
  /** Palette indices, row by row. */
  pixels: Uint8Array
}

class Grid {
  readonly pixels: Uint8Array
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.pixels = new Uint8Array(width * height)
  }

  get(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0
    return this.pixels[y * this.width + x]!
  }

  set(x: number, y: number, color: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    this.pixels[y * this.width + x] = color
  }

  /** Fill an ellipse of centre (cx, cy) and radii (rx, ry), in pixel centres. */
  ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: number,
    only?: (c: number) => boolean,
  ) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const dx = (x + 0.5 - cx) / rx
        const dy = (y + 0.5 - cy) / ry
        if (dx * dx + dy * dy <= 1 && (!only || only(this.get(x, y)))) this.set(x, y, color)
      }
    }
  }

  box(x0: number, y0: number, width: number, height: number, color: number) {
    for (let y = y0; y < y0 + height; y++)
      for (let x = x0; x < x0 + width; x++) this.set(x, y, color)
  }

  /** The purple parts' lower rows darken, their upper-left pixels light up. */
  shade(fromY: number, highlightTo: number) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) !== PURPLE) continue
        const above = this.get(x, y - 1)
        if (y >= fromY) this.set(x, y, SHADE)
        else if (y <= highlightTo && (above === 0 || above === OUTLINE)) this.set(x, y, HIGHLIGHT)
      }
    }
  }

  /** A dark pixel wherever an empty one touches a filled one, left, right, up or down. */
  outline() {
    const filled = (x: number, y: number) => {
      const c = this.get(x, y)
      return c !== 0 && c !== OUTLINE
    }
    const edges: [number, number][] = []
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) !== 0) continue
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))
          edges.push([x, y])
      }
    }
    for (const [x, y] of edges) this.set(x, y, OUTLINE)
    return this
  }

  sprite(): Sprite {
    return { width: this.width, height: this.height, pixels: this.pixels }
  }
}

export type KeloFrame = 'runA' | 'runB' | 'jump' | 'hurt'

/**
 * Kelo facing right, 20 x 18: a big round head with a snout and one huge
 * eye, a round body with a lavender belly, a tail behind, glowing plates on
 * his back, and two stubby legs that swap as he runs.
 */
export function kelo(frame: KeloFrame): Sprite {
  const g = new Grid(20, 18)
  // Tail, then body, then head over them.
  for (let i = 0; i < 5; i++) g.box(1 + i, 10 - Math.floor(i / 2), 1, 2 + Math.floor(i / 2), PURPLE)
  g.ellipse(9, 11.5, 5.2, 4.6, PURPLE)
  g.ellipse(10.2, 12, 3, 3.2, BELLY, (c) => c === PURPLE)
  g.ellipse(13.4, 6, 5.6, 5, PURPLE)
  g.ellipse(16.4, 7.6, 3.1, 2.4, PURPLE)
  // Glowing plates along the back.
  for (const [x, y] of [
    [5, 7],
    [7, 5],
    [9, 3],
  ] as const)
    g.set(x, y, PLATE)

  // Legs: runA left forward, runB right forward, jump tucked, hurt splayed.
  const legs =
    frame === 'runA'
      ? [
          [6, 15, 3],
          [11, 15, 2],
        ]
      : frame === 'runB'
        ? [
            [6, 15, 2],
            [11, 15, 3],
          ]
        : frame === 'jump'
          ? [
              [7, 15, 1],
              [11, 15, 1],
            ]
          : [
              [5, 15, 2],
              [12, 15, 2],
            ]
  for (const [x, y, length] of legs) {
    g.box(x!, y!, 2, length!, PURPLE)
    g.set(x! + 1, y! + length! - 1, CLAW)
  }
  g.shade(12, 3)
  // Belly back over the shading.
  g.ellipse(10.2, 12, 3, 3.2, BELLY, (c) => c === SHADE || c === PURPLE)

  // The eye: white with a pupil looking ahead, crossed out when hurt.
  g.box(13, 4, 3, 3, WHITE)
  if (frame === 'hurt') {
    g.set(13, 4, PUPIL)
    g.set(15, 4, PUPIL)
    g.set(14, 5, PUPIL)
    g.set(13, 6, PUPIL)
    g.set(15, 6, PUPIL)
  } else {
    g.box(14, 5, 2, 2, PUPIL)
    g.set(14, 5, WHITE)
  }
  // The mouth line and a tooth; open in the hurt frame.
  g.box(15, 9, 4, 1, OUTLINE)
  g.set(16, frame === 'hurt' ? 10 : 8, WHITE)
  g.set(18, 8, WHITE)
  return g.outline().sprite()
}

export type BugFrame = 'a' | 'b'

/** A software bug, 12 x 9: a red shell, two antennae and legs that scuttle. */
export function bug(frame: BugFrame, width = 12, height = 9): Sprite {
  const g = new Grid(width, height)
  const cx = width / 2
  g.ellipse(cx, height - 3.5, width / 2 - 1, height / 2 - 1, SHELL)
  // Shell shading and the line down its back.
  for (let y = Math.ceil(height / 2); y < height; y++)
    for (let x = 0; x < width; x++) if (g.get(x, y) === SHELL) g.set(x, y, SHELL_SHADE)
  for (let y = 2; y < height - 2; y++)
    if (g.get(Math.floor(cx), y) !== 0) g.set(Math.floor(cx), y, OUTLINE)
  // Antennae.
  g.set(Math.floor(cx) - 2, 0, OUTLINE)
  g.set(Math.floor(cx) + 2, 0, OUTLINE)
  g.set(Math.floor(cx) - 1, 1, OUTLINE)
  g.set(Math.floor(cx) + 1, 1, OUTLINE)
  // Legs, swapping between frames.
  const shift = frame === 'a' ? 0 : 1
  for (const x of [2 + shift, cx - 1 + shift, width - 3 - shift])
    g.set(Math.floor(x), height - 1, OUTLINE)
  return g.outline().sprite()
}

/** Two bugs in a row, 24 x 9. */
export function bugPair(frame: BugFrame): Sprite {
  const one = bug(frame)
  const g = new Grid(24, 9)
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 12; x++) {
      const c = one.pixels[y * 12 + x]!
      g.set(x, y, c)
      g.set(x + 12, y, c)
    }
  }
  return g.sprite()
}

/** A glitch moth, 12 x 8, beating cyan wings. */
export function moth(frame: BugFrame): Sprite {
  const g = new Grid(12, 8)
  g.ellipse(6, 4.5, 2, 2.4, PURPLE)
  if (frame === 'a') {
    g.ellipse(2.8, 2.5, 2.6, 2, WING)
    g.ellipse(9.2, 2.5, 2.6, 2, WING)
  } else {
    g.ellipse(2.8, 6, 2.6, 1.6, WING)
    g.ellipse(9.2, 6, 2.6, 1.6, WING)
  }
  g.set(5, 3, WHITE)
  g.set(7, 3, WHITE)
  return g.outline().sprite()
}

/** A pixel cloud, 16 x 6, for the sky's parallax. */
export function cloud(): Sprite {
  const g = new Grid(16, 6)
  g.ellipse(5, 4, 4, 2.2, 5)
  g.ellipse(10, 3.2, 4.5, 2.8, 5)
  g.box(2, 4, 12, 2, 5)
  return g.sprite()
}

/** 3 x 5 digits for the score, as rows of bits from the left. */
const DIGITS: Record<string, readonly number[]> = {
  '0': [0b111, 0b101, 0b101, 0b101, 0b111],
  '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b111, 0b001, 0b111, 0b100, 0b111],
  '3': [0b111, 0b001, 0b011, 0b001, 0b111],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001],
  '5': [0b111, 0b100, 0b111, 0b001, 0b111],
  '6': [0b111, 0b100, 0b111, 0b101, 0b111],
  '7': [0b111, 0b001, 0b010, 0b010, 0b010],
  '8': [0b111, 0b101, 0b111, 0b101, 0b111],
  '9': [0b111, 0b101, 0b111, 0b001, 0b111],
  H: [0b101, 0b101, 0b111, 0b101, 0b101],
  I: [0b111, 0b010, 0b010, 0b010, 0b111],
  ' ': [0, 0, 0, 0, 0],
}

/** The pixels lit to write `text` (digits, H, I and spaces) at 3 x 5 with a 1 px gap. */
export function pixelText(text: string): [x: number, y: number][] {
  const lit: [number, number][] = []
  ;[...text].forEach((char, i) => {
    const rows = DIGITS[char] ?? DIGITS[' ']!
    rows.forEach((bits, y) => {
      for (let x = 0; x < 3; x++) if (bits & (0b100 >> x)) lit.push([i * 4 + x, y])
    })
  })
  return lit
}

export { CLAW, OUTLINE, PLATE }
