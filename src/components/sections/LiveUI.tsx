import { copy } from '@/lib/copy'
import { DropPrompt } from './DropPrompt'
import { GameMount } from './GameMount'
import { ShowcaseDock } from './ShowcaseDock'
import { SoundToggle } from './SoundToggle'

/**
 * Everything on the page besides Kelo (docs/interaction-script.md), kept to
 * a minimum so the dark stage and the small mascot carry the design: the
 * studio's mark (Hero), the sound switch and "Hablemos" in the top corner, a
 * small title and the © line at the bottom, the prompt to drop the egg, and
 * on desktop a slim dock of icons.
 *
 * The frame loop writes CSS variables on this element only (not on <html>),
 * so each frame restyles just these few nodes: --letterbox, --iris-*, --text,
 * --hint and Kelo's place on screen (--kelo-*).
 *
 * The words have their places from the first paint, so nothing moves when
 * the stage starts; without live mode the overlays, the dock, the prompt and
 * the Kelo button are hidden and the page is the words alone, so nothing
 * depends on WebGL. The Kelo button is the keyboard's way to him: Enter or
 * Space taps him, the arrow keys make him hop.
 */
export function LiveUI() {
  const { meet, contact, hint, kelo, cta } = copy

  return (
    <div id="live-ui" className="relative z-20">
      <div aria-hidden="true" className="live-overlay letterbox top-0 z-10" />
      <div aria-hidden="true" className="live-overlay letterbox bottom-0 z-10" />
      <div aria-hidden="true" className="live-overlay iris z-10" />

      <div className="fixed top-4 right-4 z-30 flex items-center gap-2 sm:top-6 sm:right-6">
        <SoundToggle />
        <a
          href={contact.href}
          data-gaze-target="cta"
          className="forced-plate inline-flex min-h-11 items-center px-3 font-display text-[0.7rem] font-semibold tracking-[0.3em] text-ink-200 uppercase transition-colors duration-300 ease-out-quart hover:text-white"
        >
          {cta.nav}
        </a>
      </div>

      <DropPrompt />

      <button
        id="kelo-button"
        type="button"
        aria-label={kelo.label}
        aria-describedby="kelo-keys"
        className="live-kelo z-30 outline-offset-4 focus-visible:outline-2 focus-visible:outline-ink-300 focus-visible:outline-dashed"
      />
      <p id="kelo-keys" className="sr-only">
        {kelo.keys}
      </p>

      <p
        aria-hidden="true"
        className="live-hint bottom-[calc(var(--letterbox,0)*100svh+5.5rem)] left-1/2 z-20 -translate-x-1/2 font-display text-[0.62rem] font-semibold tracking-[0.35em] whitespace-nowrap text-ink-400 uppercase sandbox:bottom-[calc(var(--letterbox,0)*100svh+6.25rem)]"
      >
        <span className="hint-pointer">{hint.pointer}</span>
        <span className="hint-touch">{hint.touch}</span>
      </p>

      <section
        id="meet"
        aria-labelledby="meet-title"
        className="live-text inset-x-0 bottom-[calc(var(--letterbox,0)*100svh+2.75rem)] z-20 flex flex-col items-center px-6 text-center sandbox:inset-x-auto sandbox:bottom-7 sandbox:left-8 sandbox:items-start sandbox:px-0 sandbox:text-left"
      >
        <h1
          id="meet-title"
          className="font-display text-[0.72rem] font-semibold tracking-[0.42em] text-ink-100 uppercase"
        >
          {meet.title}
        </h1>
        <p className="mt-1.5 text-[0.68rem] tracking-[0.08em] text-ink-400">{meet.line}</p>
      </section>

      <ShowcaseDock />

      <section
        id="contact"
        aria-label={contact.question}
        className="live-text inset-x-0 bottom-[calc(var(--letterbox,0)*100svh+1rem)] z-20 flex justify-center px-6 text-center sandbox:inset-x-auto sandbox:right-8 sandbox:bottom-7 sandbox:px-0"
      >
        <p className="text-[0.62rem] tracking-[0.08em] text-ink-500">
          © {new Date().getFullYear()} {copy.footer.owner}
        </p>
      </section>

      <GameMount />
    </div>
  )
}
