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

/**
 * The TBT budgets on the throttled phone (D-094), split at the moment the 3D
 * chunk is requested: the page before it, and the 3D boot after it.
 */
export const TBT_BUDGETS = { pageMs: 200, bootMs: 2000 }

/**
 * Checks a load result against the TBT budgets.
 * @param {{ tbtMs: number, shellTbtMs: number | null }} result
 */
export function checkTbt(result, budgets = TBT_BUDGETS) {
  if (result.shellTbtMs === null)
    return [{ name: 'page TBT', value: null, budget: budgets.pageMs, ok: false }]
  const boot = result.tbtMs - result.shellTbtMs
  return [
    {
      name: 'page TBT',
      value: result.shellTbtMs,
      budget: budgets.pageMs,
      ok: result.shellTbtMs <= budgets.pageMs,
    },
    { name: '3D boot TBT', value: boot, budget: budgets.bootMs, ok: boot <= budgets.bootMs },
  ]
}
