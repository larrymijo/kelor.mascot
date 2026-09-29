import { describe, expect, it } from 'vitest'
import { formatQaReport, summariseFrames, type QaReport } from './report'

describe('QA report', () => {
  it('summarises frame times into fps, the 95th percentile and slow frames', () => {
    const deltas = [...Array(95).fill(16.7), 40, 40, 40, 40, 40]
    const frames = summariseFrames(deltas)
    expect(frames.fps).toBe(Math.round((100 / (95 * 16.7 + 200)) * 1000))
    expect(frames.p95Ms).toBe(40)
    expect(frames.slowFrames).toBe(5)
  })

  it('handles an empty window', () => {
    expect(summariseFrames([])).toEqual({ fps: 0, p95Ms: 0, slowFrames: 0 })
  })

  it('formats a report the owner can paste back', () => {
    const report: QaReport = {
      at: '2026-09-29T12:00:00.000Z',
      userAgent: 'Chrome',
      gpu: 'Intel Iris Xe',
      screen: '1920x1080 @1.5',
      viewport: '1280x650',
      bootTier: 'medium',
      model: 'full',
      load: { fcpMs: 200, lcpMs: 200, modelsKB: 1500, scriptsKB: 650 },
      shots: [
        { id: 'hero', fps: 60, p95Ms: 17.2, slowFrames: 0, quality: 'medium', canvas: '1920x975' },
      ],
    }
    const text = formatQaReport(report)
    expect(text).toContain('gpu: Intel Iris Xe')
    expect(text).toContain('LCP 200 ms')
    expect(text).toMatch(/hero\s+60\s+17\.2\s+0\s+medium 1920x975/)
    const safari = formatQaReport({ ...report, load: { ...report.load, lcpMs: null } })
    expect(safari).toContain('LCP n/a')
  })
})
