'use client'

import Link from 'next/link'
import { Notice, noticeAction } from '@/components/sections/Notice'
import { copy } from '@/lib/copy'
import './globals.css'

/**
 * The last resort, when even the root layout fails. It replaces the layout,
 * so it brings its own document and styles (system fonts only).
 */
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <html lang="es">
      <body>
        <title>{`${copy.error.title} · ${copy.brand}`}</title>
        <Notice title={copy.error.title} body={copy.error.body}>
          <button type="button" onClick={() => retry()} className={noticeAction}>
            {copy.error.retry}
          </button>
          <Link href="/" className={noticeAction}>
            {copy.error.back}
          </Link>
        </Notice>
      </body>
    </html>
  )
}
