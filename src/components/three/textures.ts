/**
 * Tiny procedural textures built in memory (no files, no canvas element).
 */
import { DataTexture, LinearFilter, RGBAFormat } from 'three'

/**
 * Square radial falloff: white RGB, alpha 1 at the centre fading to 0 at the
 * edge with the given exponent. Used for the fake contact shadow and glows.
 */
export function radialTexture(size = 64, exponent = 2) {
  const data = new Uint8Array(size * size * 4)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.min(1, Math.hypot(x - c, y - c) / c)
      const a = (1 - r * r * (3 - 2 * r)) ** exponent
      const i = (y * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 255
      data[i + 3] = Math.round(a * 255)
    }
  }
  const texture = new DataTexture(data, size, size, RGBAFormat)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}
