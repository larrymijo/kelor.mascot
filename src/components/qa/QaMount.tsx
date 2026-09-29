'use client'

import dynamic from 'next/dynamic'
import { useSyncExternalStore } from 'react'

/** The QA panel is a chunk of its own, fetched only with ?qa. */
const QaPanel = dynamic(() => import('./QaPanel'), { ssr: false })

/** Vercel exposes NEXT_PUBLIC_VERCEL_ENV; the panel never exists on production. */
const qaAllowed = process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production'

const noSubscription = () => () => {}
const qaRequested = () => qaAllowed && new URLSearchParams(window.location.search).has('qa')
// The server never sees the query; hydration starts without the panel and adds it after.
const onServer = () => false

/**
 * Mounts the performance QA panel when the page is opened with ?qa, on local
 * and preview builds only. The owner runs it on real devices and pastes the
 * report back (docs/qa.md).
 */
export function QaMount() {
  const enabled = useSyncExternalStore(noSubscription, qaRequested, onServer)
  return enabled ? <QaPanel /> : null
}
