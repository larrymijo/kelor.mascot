/**
 * The performance QA report the ?qa panel builds on a real device, and the
 * plain text the owner pastes back. Pure, so it is unit tested.
 */

export interface QaFrames {
  /** Frames per second over the window. */
  fps: number
  /** 95th percentile frame time, ms. */
  p95Ms: number
  /** Frames that took longer than two 60 Hz frames. */
  slowFrames: number
}

export interface QaShot extends QaFrames {
  id: string
  /** The quality tier live at the shot. */
  quality: string
  /** The canvas size in device pixels, which shows the resolution step. */
  canvas: string
}

export interface QaReport {
  at: string
  userAgent: string
  gpu: string
  screen: string
  viewport: string
  bootTier: string
  model: string
  load: { fcpMs: number | null; lcpMs: number | null; modelsKB: number; scriptsKB: number }
  shots: QaShot[]
}

/** A frame slower than this missed at least one 60 Hz refresh. */
const SLOW_MS = 1000 / 60 + 1000 / 60 + 1

export function summariseFrames(deltas: readonly number[]): QaFrames {
  if (deltas.length === 0) return { fps: 0, p95Ms: 0, slowFrames: 0 }
  const total = deltas.reduce((sum, d) => sum + d, 0)
  const sorted = [...deltas].sort((a, b) => a - b)
  return {
    fps: Math.round((deltas.length / total) * 1000),
    p95Ms:
      Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]! * 10) / 10,
    slowFrames: deltas.filter((d) => d > SLOW_MS).length,
  }
}

/** Safari reports no LCP, and a metric can be missing after a restore. */
const ms = (value: number | null) => (value === null ? 'n/a' : `${value} ms`)

export function formatQaReport(report: QaReport) {
  const lines = [
    `KELOR QA ${report.at}`,
    `device: ${report.userAgent}`,
    `gpu: ${report.gpu}`,
    `screen ${report.screen}, viewport ${report.viewport}`,
    `boot tier ${report.bootTier}, model ${report.model}`,
    `load: FCP ${ms(report.load.fcpMs)}, LCP ${ms(report.load.lcpMs)}, models ${report.load.modelsKB} kB, scripts ${report.load.scriptsKB} kB`,
    'shot     fps  p95ms  slow  quality',
    ...report.shots.map(
      (s) =>
        `${s.id.padEnd(8)} ${String(s.fps).padStart(3)}  ${String(s.p95Ms).padStart(5)}  ${String(s.slowFrames).padStart(4)}  ${s.quality} ${s.canvas}`,
    ),
  ]
  return lines.join('\n')
}
