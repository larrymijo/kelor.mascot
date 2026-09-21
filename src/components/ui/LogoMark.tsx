interface LogoMarkProps {
  /** Rendered height in px; the width follows the mark's aspect ratio. */
  size?: number
  /** Accessible name. Omit when the mark sits next to visible brand text. */
  title?: string
  /** `brand` uses the logo greys, `mono` inherits the text colour. */
  tone?: 'brand' | 'mono'
  className?: string
}

/**
 * KELOR isometric hexagon mark: two point-symmetric halves of a hexagon
 * (side 100), reconstructed as SVG from the original logo.
 */
export function LogoMark({ size = 36, title, tone = 'brand', className }: LogoMarkProps) {
  const width = Math.round((size * 173.2) / 250)
  const dark = tone === 'brand' ? 'fill-ink-500' : 'fill-current'
  const light = tone === 'brand' ? 'fill-ink-300' : 'fill-current'

  return (
    <svg
      width={width}
      height={size}
      viewBox="-86.6 -100 173.2 250"
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <polygon
        className={dark}
        points="0,-100 -86.6,-50 -86.6,50 0,100 0,50 -43.3,25 -43.3,-25 0,-50"
      />
      <polygon className={dark} points="29,-85 60,-67 60,-31 29,-49" />
      <polygon className={light} points="0,-50 86.6,0 86.6,100 0,150 0,100 43.3,75 43.3,25 0,0" />
    </svg>
  )
}
