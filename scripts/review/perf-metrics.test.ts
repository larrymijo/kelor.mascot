import { describe, expect, it } from 'vitest'
import { blockingTime, checkTbt, median, resourceKind } from './perf-metrics.mjs'

describe('perf metrics', () => {
  it('splits TBT into the page and the 3D boot and checks each budget', () => {
    const budgets = { pageMs: 200, bootMs: 2000 }
    expect(checkTbt({ tbtMs: 1900, shellTbtMs: 190 }, budgets)).toEqual([
      { name: 'page TBT', value: 190, budget: 200, ok: true },
      { name: '3D boot TBT', value: 1710, budget: 2000, ok: true },
    ])
    const over = checkTbt({ tbtMs: 2600, shellTbtMs: 250 }, budgets)
    expect(over.map((c) => c.ok)).toEqual([false, false])
    // Without the 3D import mark the split is unknown, which fails.
    expect(checkTbt({ tbtMs: 100, shellTbtMs: null }, budgets)[0]!.ok).toBe(false)
  })

  it('sorts resources into fonts, JS, models, the transcoder and the rest', () => {
    expect(resourceKind('/_next/static/media/abc-s.p.woff2')).toBe('fonts')
    expect(resourceKind('/_next/static/chunks/0abc.js')).toBe('js')
    expect(resourceKind('/models/mascot.lite.glb')).toBe('models')
    expect(resourceKind('/basis/basis_transcoder.wasm')).toBe('basis')
    expect(resourceKind('/icon.svg')).toBe('other')
  })

  it('counts only the part of each long task beyond 50 ms, inside the window', () => {
    const tasks: [number, number][] = [
      [100, 40], // under the threshold
      [200, 120], // 70 ms blocking
      [900, 250], // 200 ms blocking
      [5_000, 300], // after the window
    ]
    expect(blockingTime(tasks, 150, 1_000)).toBe(270)
  })

  it('takes the median of the numbers only', () => {
    expect(median([30, 10, 20])).toBe(20)
    expect(median([null, 5, undefined])).toBe(5)
    expect(median([])).toBeNull()
  })
})
