import type { ReactNode } from 'react'
import { LogoMark } from '@/components/ui/LogoMark'
import { copy } from '@/lib/copy'

/**
 * A quiet full-screen notice for the 404 and error pages: the brand mark, a
 * heading, one line, any extra action and the way back to the start.
 * Monochrome, like the rest of the UI.
 */
export function Notice({
  title,
  body,
  back,
  children,
}: {
  title: string
  body: string
  /** Label of the link back to the start. */
  back: string
  children?: ReactNode
}) {
  return (
    <main
      id="main"
      className="grid min-h-svh place-items-center bg-ink-900 px-6 py-16 text-center text-ink-100"
    >
      <div className="flex max-w-md flex-col items-center gap-6">
        <LogoMark size={64} title={copy.brand} />
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-50 sm:text-4xl">
          {title}
        </h1>
        <p className="text-ink-300">{body}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {children}
          {/* A full load is the right recovery after an error, and next/link would add
              about 4 kB to every boundary's chunk, all of them loaded up front. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className={noticeAction}>
            {back}
          </a>
        </div>
      </div>
    </main>
  )
}

/** The action style shared by the notice's link and buttons. */
export const noticeAction =
  'inline-flex min-h-11 items-center rounded-md border border-ink-500 px-5 font-semibold text-ink-50 transition-colors duration-200 ease-out-quart hover:border-ink-300'
