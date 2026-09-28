import { copy } from '@/lib/copy'

/**
 * The words and the screen-space layers of the cinematic. The frame loop
 * writes CSS variables on this element only (not on <html>), so each frame
 * restyles just these few nodes: --letterbox, --iris-*, --fade, --cue, --meet
 * and --contact.
 *
 * Without cinematic mode, the overlays are hidden and the words read as a
 * short document after the first screen, so nothing depends on WebGL or on
 * the lazy engine. The contact link is the one gaze target left on the page.
 */
export function CinematicUI() {
  const { hero, meet, contact } = copy

  return (
    <div id="cinematic-ui" className="relative z-20">
      <div aria-hidden="true" className="cinematic-overlay letterbox top-0 z-10" />
      <div aria-hidden="true" className="cinematic-overlay letterbox bottom-0 z-10" />
      <div aria-hidden="true" className="cinematic-overlay iris z-10" />
      <div aria-hidden="true" className="cinematic-overlay fade z-10" />

      <p
        aria-hidden="true"
        className="cinematic-cue bottom-[calc(var(--letterbox,0)*100svh+1.25rem)] left-1/2 z-20 -translate-x-1/2 font-display text-[0.7rem] font-semibold tracking-[0.4em] text-ink-300 uppercase"
      >
        {hero.cue}
      </p>

      <section
        id="meet"
        aria-labelledby="meet-title"
        className="cinematic-text cinematic-meet z-20 flex flex-col items-center px-6 py-24 text-center [html.cinematic_&]:inset-x-0 [html.cinematic_&]:bottom-[18svh] [html.cinematic_&]:py-0 sm:[html.cinematic_&]:inset-x-auto sm:[html.cinematic_&]:top-1/2 sm:[html.cinematic_&]:bottom-auto sm:[html.cinematic_&]:left-[8vw] sm:[html.cinematic_&]:-translate-y-1/2 sm:[html.cinematic_&]:items-start sm:[html.cinematic_&]:text-left"
      >
        <h1
          id="meet-title"
          className="font-display text-5xl font-extrabold tracking-tight text-ink-50 sm:text-7xl"
        >
          {meet.title}
        </h1>
        <p className="mt-3 font-display text-sm font-medium tracking-[0.18em] text-mascot-300 uppercase sm:text-base">
          {meet.line}
        </p>
      </section>

      <section
        id="contact"
        aria-label={contact.question}
        className="cinematic-text cinematic-contact z-20 flex flex-col items-center gap-1 px-4 pt-8 pb-10 text-center text-[0.72rem] text-ink-300 [html.cinematic_&]:inset-x-0 [html.cinematic_&]:bottom-[calc(var(--letterbox,0)*100svh+0.75rem)] [html.cinematic_&]:pb-0"
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
        <p className="text-[0.65rem] text-ink-400">
          © {new Date().getFullYear()} {copy.footer.owner}
        </p>
      </section>
    </div>
  )
}
