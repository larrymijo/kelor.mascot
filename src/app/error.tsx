'use client'

import Link from 'next/link'
import { Notice, noticeAction } from '@/components/sections/Notice'
import { copy } from '@/lib/copy'

/**
 * An error the page itself could not absorb (the 3D stage has its own
 * boundary and falls back to the brand mark). Spanish, on the brand, with a
 * retry that fetches and renders the page again.
 */
export default function Error({
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <Notice title={copy.error.title} body={copy.error.body}>
      <button type="button" onClick={() => retry()} className={noticeAction}>
        {copy.error.retry}
      </button>
      <Link href="/" className={noticeAction}>
        {copy.error.back}
      </Link>
    </Notice>
  )
}
