/**
 * Dependency-free PNG encoder (8-bit RGBA, no filtering) and a tiny
 * anti-aliased rasteriser for procedural textures. Output is deterministic,
 * which keeps the generated placeholder GLBs byte-identical between runs.
 */
import { deflateSync } from 'node:zlib'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  const typeBytes = new TextEncoder().encode(type)
  out.set(typeBytes, 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/**
 * Encode RGBA pixels as a PNG.
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba width × height × 4 bytes, row-major, top row first
 */
export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) throw new Error('rgba size does not match dimensions')
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  header.set([8, 6, 0, 0, 0], 8) // 8-bit, RGBA, deflate, no filter, no interlace

  const raw = new Uint8Array((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0 // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  }

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** "#RRGGBB" to [r, g, b] bytes. */
export function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/**
 * A float RGBA canvas with signed-distance shapes composited "over" with a
 * one-pixel anti-aliased edge. Coordinates are in pixels, origin top-left.
 */
export class Canvas {
  constructor(width, height, fill = [0, 0, 0, 0]) {
    this.width = width
    this.height = height
    this.data = new Float32Array(width * height * 4)
    for (let i = 0; i < width * height; i++) this.data.set(fill.map((v, k) => (k < 3 ? v / 255 : v)), i * 4)
  }

  /** Composite a colour where `sdf(x, y) < 0`. colour is [r, g, b] bytes, alpha 0 to 1. */
  paint(sdf, rgb, alpha = 1, bounds = [0, 0, this.width, this.height]) {
    const [r, g, b] = rgb.map((v) => v / 255)
    const [x0, y0, x1, y1] = bounds.map((v, i) => Math.max(0, Math.min(i % 2 ? this.height : this.width, Math.round(v))))
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const coverage = Math.min(1, Math.max(0, 0.5 - sdf(x + 0.5, y + 0.5)))
        const a = coverage * alpha
        if (a <= 0) continue
        const i = (y * this.width + x) * 4
        const da = this.data[i + 3]
        const outA = a + da * (1 - a)
        this.data[i] = (r * a + this.data[i] * da * (1 - a)) / outA
        this.data[i + 1] = (g * a + this.data[i + 1] * da * (1 - a)) / outA
        this.data[i + 2] = (b * a + this.data[i + 2] * da * (1 - a)) / outA
        this.data[i + 3] = outA
      }
    }
  }

  /** Fill every pixel from a function of (u, v) in [0, 1] returning [r, g, b, a]. */
  shade(fn) {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const [r, g, b, a] = fn((x + 0.5) / this.width, (y + 0.5) / this.height)
        this.data.set([r / 255, g / 255, b / 255, a], (y * this.width + x) * 4)
      }
    }
  }

  toPng() {
    const rgba = new Uint8Array(this.width * this.height * 4)
    for (let i = 0; i < this.data.length; i++) {
      rgba[i] = Math.round(Math.min(1, Math.max(0, this.data[i])) * 255)
    }
    return encodePng(this.width, this.height, rgba)
  }
}

/** Signed distance helpers (pixels). */
export const sdf = {
  circle: (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r,
  /** Approximate ellipse distance, good enough for anti-aliased edges. */
  ellipse: (cx, cy, rx, ry) => (x, y) => {
    const k = Math.hypot((x - cx) / rx, (y - cy) / ry)
    return (k - 1) * Math.min(rx, ry)
  },
  /** Stroke of an elliptical arc between angles a0 and a1 (radians, y down). */
  arc: (cx, cy, rx, ry, a0, a1, width) => (x, y) => {
    let best = Infinity
    const steps = 64
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps
      best = Math.min(best, Math.hypot(x - (cx + rx * Math.cos(a)), y - (cy + ry * Math.sin(a))))
    }
    return best - width / 2
  },
  intersect: (a, b) => (x, y) => Math.max(a(x, y), b(x, y)),
  subtract: (a, b) => (x, y) => Math.max(a(x, y), -b(x, y)),
}
