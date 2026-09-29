/**
 * Whether to stream the full model in after the lite one has painted. Pure,
 * so the policy is unit tested; the stage feeds it what the browser reports.
 *
 * The low tier never upgrades, and neither does a phone or tablet (a coarse
 * pointer), a visitor who asked the browser to save data, or a 2G-class
 * connection: the lite model is the whole experience for them, not a
 * placeholder. Desktops get the full model's detail.
 */
export interface ConnectionHints {
  saveData?: boolean
  /** Network Information API effectiveType: 'slow-2g' | '2g' | '3g' | '4g'. */
  effectiveType?: string
  /** A touch-first device: phones and tablets keep the lite model. */
  coarsePointer?: boolean
}

const SLOW = new Set(['slow-2g', '2g'])

export function shouldUpgrade(url: string | null, connection: ConnectionHints = {}) {
  if (!url) return false
  if (connection.saveData || connection.coarsePointer) return false
  if (connection.effectiveType && SLOW.has(connection.effectiveType)) return false
  return true
}

/** What the current browser reports; empty where an API does not exist. */
export function readConnection(): ConnectionHints {
  if (typeof navigator === 'undefined') return {}
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const connection = (navigator as Navigator & { connection?: ConnectionHints }).connection
  return connection
    ? { saveData: connection.saveData, effectiveType: connection.effectiveType, coarsePointer }
    : { coarsePointer }
}
