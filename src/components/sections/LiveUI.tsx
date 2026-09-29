import { copy } from '@/lib/copy'
import { SoundToggle } from './SoundToggle'

/**
 * The words and the screen-space layers around Kelo (docs/interaction-script.md).
 * The frame loop writes CSS variables on this element only (not on <html>),
 * so each frame restyles just these few nodes: --letterbox, --iris-*, --text,
 * --hint and Kelo's place on screen (--kelo-*).
 *
 * Without live mode, the overlays, the hint and the Kelo button are hidden
 * and the words read as a short document after the first screen, so nothing
 * depends on WebGL. The contact link is the one gaze target on the page. The
 * Kelo button is the keyboard's way to him: Enter or Space taps him, the
 * arrow keys make him hop.
 */
export function LiveUI() {
  const { meet, contact, hint, kelo } = copy

  return (
    <div id="live-ui" className="relative z-20">
      <div aria-hidden="true" className="live-overlay letterbox top-0 z-10" />
      <div aria-hidden="true" className="live-overlay letterbox bottom-0 z-10" />
      <div aria-hidden="true" className="live-overlay iris z-10" />

      <SoundToggle />

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
        className="live-hint bottom-[calc(var(--letterbox,0)*100svh+4.25rem)] left-1/2 z-20 -translate-x-1/2 font-display text-[0.7rem] font-semibold tracking-[0.35em] whitespace-nowrap text-ink-300 uppercase"
      >
        <span className="hint-pointer">{hint.pointer}</span>
        <span className="hint-touch">{hint.touch}</span>
      </p>

      <section
        id="meet"
        aria-labelledby="meet-title"
        className="live-text z-20 flex flex-col items-center px-6 py-24 text-center [html.live_&]:inset-x-0 [html.live_&]:bottom-[calc(var(--letterbox,0)*100svh+6.5rem)] [html.live_&]:py-0 sm:[html.live_&]:inset-x-auto sm:[html.live_&]:top-1/2 sm:[html.live_&]:bottom-auto sm:[html.live_&]:left-[6vw] sm:[html.live_&]:-translate-y-1/2 sm:[html.live_&]:items-start sm:[html.live_&]:text-left"
      >
        <h1
          id="meet-title"
          className="font-display text-[2.1rem] leading-tight font-extrabold tracking-tight text-ink-50 sm:text-5xl"
        >
          {meet.title}
        </h1>
        <p className="mt-2 font-display text-[0.8rem] font-medium tracking-[0.18em] text-mascot-300 uppercase sm:mt-3 sm:text-sm">
          {meet.line}
        </p>
      </section>

      <section
        id="contact"
        aria-label={contact.question}
        className="live-text z-20 flex flex-col items-center gap-1 px-4 pt-8 pb-10 text-center text-[0.72rem] text-ink-300 [html.live_&]:inset-x-0 [html.live_&]:bottom-[calc(var(--letterbox,0)*100svh+0.75rem)] [html.live_&]:pb-0"
      >
        <p>
          {contact.question}{' '}
          <a
            href={contact.href}
            data-gaze-target="cta"
            className="inline-flex min-h-11 items-center px-1 font-semibold text-mascot-300 underline decoration-mascot-300/50 underline-offset-4 transition-colors duration-200 ease-out-quart hover:text-mascot-glow"
          >
            {contact.link}
          </a>
        </p>
        <p className="text-[0.65rem] text-ink-300">
          © {new Date().getFullYear()} {copy.footer.owner}
        </p>
      </section>
    </div>
  )
}
