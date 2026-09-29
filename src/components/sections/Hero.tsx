import { LogoMark } from '@/components/ui/LogoMark'
import { copy } from '@/lib/copy'

/**
 * The first screen. The fixed stage behind it carries the moment, so the
 * only thing here is the studio's mark in the corner, linking to its site.
 * The screen's height is what places the words after it when the page is
 * read without the cinematic.
 */
export function Hero() {
  return (
    <header className="relative z-20 h-svh">
      <a
        href={copy.studioHref}
        className="absolute top-4 left-4 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-300 transition-colors duration-200 ease-out-quart hover:text-ink-50 sm:top-6 sm:left-6"
      >
        <LogoMark size={26} tone="mono" title={copy.brand} />
      </a>
    </header>
  )
}
