/**
 * Pure helpers of the performance probe (scripts/review/perf.mjs), kept apart
 * so they are unit tested without a browser.
 */

/** Which bucket a resource path belongs to. */
export function resourceKind(pathname) {
  if (pathname.startsWith('/_next/static/media/')) return 'fonts'
  if (pathname.startsWith('/_next/static/')) return 'js'
  if (pathname.startsWith('/models/')) return 'models'
  if (pathname.startsWith('/basis/')) return 'basis'
  return 'other'
}

/**
 * Lighthouse-style blocking time: the part of each long task beyond 50 ms,
 * for tasks starting inside [from, to]. Tasks are [start, duration] in ms.
 * @param {[number, number][]} longTasks
 */
export function blockingTime(longTasks, from, to) {
  return longTasks
    .filter(([start]) => start >= from && start <= to)
    .reduce((sum, [, duration]) => sum + Math.max(0, duration - 50), 0)
}

/** Median of the numbers in a list, ignoring anything else; null when empty. */
export function median(values) {
  const sorted = values.filter((v) => typeof v === 'number').sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
}
