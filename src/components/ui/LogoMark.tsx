interface LogoMarkProps {
  /** Rendered height in px; the width follows the mark's aspect ratio. */
  size?: number
  /** Accessible name. Omit when the mark sits next to visible brand text. */
  title?: string
  /** `brand` uses the logo greys, `mono` inherits the text colour. */
  tone?: 'brand' | 'mono'
  className?: string
}

const VIEW_BOX = '-86.6 -100 173.2 250'
const DARK = [
  '0,-100 -86.6,-50 -86.6,50 0,100 0,50 -43.3,25 -43.3,-25 0,-50',
  '29,-85 60,-67 60,-31 29,-49',
]
const LIGHT = '0,-50 86.6,0 86.6,100 0,150 0,100 43.3,75 43.3,25 0,0'

/** The mark's width for a given height, in px. */
export const logoMarkWidth = (height: number) => Math.round((height * 173.2) / 250)

/**
 * The logo greys, the ink-500 and ink-300 tokens of globals.css (and
 * brandMono in character.json), for places where classes cannot reach.
 */
const LOGO_GREYS = { dark: '#545454', light: '#a6a6a6' }

/**
 * The mark in the logo greys as an SVG data URI, for an <img>: unlike inline
 * SVG, an image counts as the page's largest contentful paint.
 */
export function logoMarkDataUri(dark = LOGO_GREYS.dark, light = LOGO_GREYS.light) {
  const polygons = [
    ...DARK.map((points) => `<polygon fill="${dark}" points="${points}"/>`),
    `<polygon fill="${light}" points="${LIGHT}"/>`,
  ].join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}">${polygons}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/**
 * KELOR isometric hexagon mark: two point-symmetric halves of a hexagon
 * (side 100), reconstructed as SVG from the original logo.
 */
export function LogoMark({ size = 36, title, tone = 'brand', className }: LogoMarkProps) {
  const width = logoMarkWidth(size)
  const dark = tone === 'brand' ? 'fill-ink-500' : 'fill-current'
  const light = tone === 'brand' ? 'fill-ink-300' : 'fill-current'

  return (
    <svg
      width={width}
      height={size}
      viewBox={VIEW_BOX}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {DARK.map((points) => (
        <polygon key={points} className={dark} points={points} />
      ))}
      <polygon className={light} points={LIGHT} />
    </svg>
  )
}
