/**
 * The desktop sandbox's three lighting looks (docs/interaction-script.md):
 * the colours of the key, rim and fill lights, the backdrop's halo and the
 * stage ring, with the lights' strength as a multiple of the studio's.
 * ShowcaseDriver eases live.look between them; blend() mixes a field by it.
 */
import { Color } from 'three'
import { character } from '@/lib/character'
import type { Lighting } from '@/lib/showcase/state'
import { live } from './live/LiveDriver'

interface Look {
  key: string
  keyScale: number
  rim: string
  rimScale: number
  fill: string
  fillScale: number
  /** Tint of the backdrop's halo, mixed into the page's ink. */
  halo: string
  /** The stage ring under Kelo. */
  ring: string
}

const { mascot } = character.colors

const LOOKS: Record<Lighting, Look> = {
  // Warm key, violet rim, cool fill: the studio of phases 7 and 8.
  studio: {
    key: '#fff4ea',
    keyScale: 1,
    rim: mascot['300'],
    rimScale: 1,
    fill: '#dfe3ff',
    fillScale: 1,
    halo: '#3a3448',
    ring: mascot['500'],
  },
  // Low golden sun, a pink rim, a blue-violet fill from the sky.
  sunset: {
    key: '#ffb27a',
    keyScale: 1.05,
    rim: '#ff5c9d',
    rimScale: 1.25,
    fill: '#7d6bff',
    fillScale: 0.8,
    halo: '#4d3040',
    ring: '#ff7a59',
  },
  // Cool white key, a strong violet rim and a cyan fill, like a lit stage.
  neon: {
    key: '#c9f4ff',
    keyScale: 0.85,
    rim: mascot['500'],
    rimScale: 1.9,
    fill: '#34d8ff',
    fillScale: 1.2,
    halo: '#1d2c4d',
    ring: '#36e0ff',
  },
}

type ColorField = 'key' | 'rim' | 'fill' | 'halo' | 'ring'
type ScaleField = 'keyScale' | 'rimScale' | 'fillScale'

const COLORS = Object.fromEntries(
  Object.entries(LOOKS).map(([name, look]) => [
    name,
    {
      key: new Color(look.key),
      rim: new Color(look.rim),
      fill: new Color(look.fill),
      halo: new Color(look.halo),
      ring: new Color(look.ring),
    },
  ]),
) as Record<Lighting, Record<ColorField, Color>>

const NAMES = Object.keys(LOOKS) as Lighting[]

/** A colour field mixed by how much each look shows now, written into `out`. */
export function blendColor(field: ColorField, out: Color) {
  out.setRGB(0, 0, 0)
  for (const name of NAMES) {
    const weight = live.look[name]
    const color = COLORS[name][field]
    out.r += color.r * weight
    out.g += color.g * weight
    out.b += color.b * weight
  }
  return out
}

/** A light's strength, as a multiple of the studio's, mixed the same way. */
export function blendScale(field: ScaleField) {
  let total = 0
  for (const name of NAMES) total += LOOKS[name][field] * live.look[name]
  return total
}
