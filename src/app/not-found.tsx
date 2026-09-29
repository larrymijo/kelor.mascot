import type { Metadata } from 'next'
import Link from 'next/link'
import { Notice, noticeAction } from '@/components/sections/Notice'
import { copy } from '@/lib/copy'

export const metadata: Metadata = { title: copy.notFound.title }

/** Every unmatched URL: a Spanish 404 on the brand, back to the start. */
export default function NotFound() {
  return (
    <Notice title={copy.notFound.title} body={copy.notFound.body}>
      <Link href="/" className={noticeAction}>
        {copy.notFound.back}
      </Link>
    </Notice>
  )
}
