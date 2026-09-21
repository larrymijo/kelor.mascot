import { LogoMark } from '@/components/ui/LogoMark'
import { copy } from '@/lib/copy'

/**
 * Phase 1 placeholder: brand mark, one message and the CTA. No 3D yet; the
 * phase 2 canvas mounts on top of this layout without changing its tokens.
 */
export default function Home() {
  const { placeholder, footer } = copy

  return (
    <div className="flex min-h-dvh flex-col">
      <main
        id="main"
        className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center"
      >
        <div className="relative mb-10 grid place-items-center">
          <div
            aria-hidden="true"
            data-testid="logo-glow"
            className="absolute size-44 rounded-full bg-mascot-500/40 opacity-60 blur-3xl motion-safe:animate-glow-pulse"
          />
          <LogoMark size={120} title={copy.meta.title} className="relative" />
        </div>

        <p className="font-display text-xs font-semibold tracking-[0.32em] text-ink-300 uppercase">
          {placeholder.eyebrow}
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-extrabold tracking-tight text-balance text-ink-50 sm:text-6xl">
          {placeholder.title}
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-pretty text-ink-300 sm:text-lg">
          {placeholder.body}
        </p>

        <a
          href={placeholder.cta.href}
          className="mt-10 inline-flex min-h-12 items-center justify-center rounded-md bg-mascot-500 px-7 font-display text-base font-semibold text-white transition-colors duration-200 ease-out-quart hover:bg-mascot-300 hover:text-ink-950"
        >
          {placeholder.cta.label}
        </a>
      </main>

      <footer className="px-4 py-6 text-center text-sm text-ink-300">
        © {new Date().getFullYear()} {footer.owner}
      </footer>
    </div>
  )
}
