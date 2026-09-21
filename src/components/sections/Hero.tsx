import { copy } from '@/lib/copy'
import { StageMount } from './StageMount'

/**
 * First act: the 3D stage fills the viewport and the message sits at the
 * bottom, in real HTML so it is the LCP element, readable and indexable
 * without WebGL. The camera framing leaves this band free.
 */
export function Hero() {
  const { hero } = copy

  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-svh flex-col overflow-hidden"
    >
      <StageMount />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-linear-to-t from-ink-900 via-ink-900/85 to-transparent"
      />

      <div className="relative mt-auto flex flex-col items-center px-4 pb-12 text-center sm:pb-14">
        <p className="font-display text-xs font-semibold tracking-[0.32em] text-ink-300 uppercase">
          {hero.eyebrow}
        </p>
        <h1
          id="hero-title"
          className="mt-3 max-w-3xl font-display text-4xl font-extrabold tracking-tight text-balance text-ink-50 sm:text-5xl"
        >
          {hero.title}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-pretty text-ink-300 sm:text-lg">
          {hero.body}
        </p>
        <a
          href={hero.cta.href}
          className="mt-7 inline-flex min-h-12 items-center justify-center rounded-md bg-mascot-500 px-7 font-display text-base font-semibold text-white transition-colors duration-200 ease-out-quart hover:bg-mascot-300 hover:text-ink-950"
        >
          {hero.cta.label}
        </a>
      </div>
    </section>
  )
}
