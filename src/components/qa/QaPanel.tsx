'use client'

import { useState } from 'react'
import { formatQaReport, summariseFrames, type QaReport, type QaShot } from '@/lib/qa/report'

const SETTLE_MS = 1_800
const MEASURE_MS = 3_000

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Frame-to-frame times over a window, from requestAnimationFrame. */
function frameTimes(ms: number) {
  return new Promise<number[]>((resolve) => {
    const deltas: number[] = []
    let last = performance.now()
    const start = last
    const tick = (now: number) => {
      deltas.push(now - last)
      last = now
      if (now - start < ms) requestAnimationFrame(tick)
      else resolve(deltas.slice(1))
    }
    requestAnimationFrame(tick)
  })
}

function gpuName() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    const info = gl?.getExtension('WEBGL_debug_renderer_info')
    return info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown'
  } catch {
    return 'unknown'
  }
}

/** LCP entries only reach observers; buffered, they include the ones before the panel loaded. */
function lastLcp() {
  return new Promise<number | null>((resolve) => {
    if (!PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint')) {
      resolve(null)
      return
    }
    const observer = new PerformanceObserver((list) => {
      observer.disconnect()
      resolve(Math.round(list.getEntries().at(-1)!.startTime))
    })
    observer.observe({ type: 'largest-contentful-paint', buffered: true })
    setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, 500)
  })
}

async function loadMetrics() {
  const paint = performance.getEntriesByName('first-contentful-paint')[0]
  const kB = (prefix: string) =>
    Math.round(
      performance
        .getEntriesByType('resource')
        .filter((r) => new URL(r.name).pathname.startsWith(prefix))
        .reduce((sum, r) => sum + ((r as PerformanceResourceTiming).transferSize || 0), 0) / 1024,
    )
  return {
    fcpMs: paint ? Math.round(paint.startTime) : null,
    lcpMs: await lastLcp(),
    modelsKB: kB('/models/'),
    scriptsKB: kB('/_next/static/'),
  }
}

const stage = () => document.querySelector<HTMLElement>('[data-scene-state]')
const kelo = () => {
  const ui = document.getElementById('live-ui')
  return { x: Number(ui?.dataset.keloX ?? 0), y: Number(ui?.dataset.keloY ?? 0) }
}

/**
 * A pointer event as a mouse or finger would send it, on whatever is under
 * the point; Kelo listens on the window, so it bubbles up to him.
 */
function pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number) {
  const target = document.elementFromPoint(x, y) ?? document.body
  target.dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      isPrimary: true,
      pointerType: 'mouse',
      button: 0,
      bubbles: true,
    }),
  )
}

async function tapKelo() {
  const { x, y } = kelo()
  pointer('pointerdown', x, y)
  pointer('pointerup', x, y)
}

/** A fine pointer that hovers, on a wide screen: where dragging and the bite exist. */
const desktop = () =>
  matchMedia('(pointer: fine)').matches && matchMedia('(hover: hover)').matches && innerWidth >= 768
const quality = () => document.querySelector<HTMLElement>('[data-quality]')?.dataset.quality ?? '?'
const canvasSize = () => {
  const canvas = document.querySelector('canvas')
  return canvas ? `${canvas.width}x${canvas.height}` : 'none'
}

/**
 * Performance QA on a real device: plays the live moments (Kelo idle; on
 * desktop carried in circles and the bite, on touch screens a run of taps),
 * measures frames through each, and gathers the device, the quality the page
 * chose, and the load timings into a report to copy. Not in the production
 * build.
 */
export default function QaPanel() {
  const [status, setStatus] = useState<'idle' | 'running' | 'done'>('idle')
  const [report, setReport] = useState<QaReport | null>(null)
  const [copied, setCopied] = useState(false)

  const run = async () => {
    setStatus('running')
    setCopied(false)
    // The stage waits for the egg: drop it, as a visitor would.
    while (stage()?.dataset.sceneState !== 'ready') {
      if (stage()?.dataset.sceneState === 'waiting') document.getElementById('drop-button')?.click()
      await wait(250)
    }
    await wait(SETTLE_MS)
    const shots: QaShot[] = []
    const measure = async (id: string, during?: Promise<void>) => {
      const [deltas] = await Promise.all([frameTimes(MEASURE_MS), during])
      shots.push({ id, quality: quality(), canvas: canvasSize(), ...summariseFrames(deltas) })
    }
    await measure('idle')
    if (desktop()) {
      // Carried in circles: the physics, the carried pose and his shadow.
      const start = kelo()
      pointer('pointerdown', start.x, start.y - 40)
      const circles = (async () => {
        for (let i = 0; i < 70; i++) {
          const a = (i / 35) * Math.PI * 2
          pointer('pointermove', start.x - 160 + 140 * Math.cos(a), start.y - 60 + 40 * Math.sin(a))
          await wait(40)
        }
      })()
      await measure('drag', circles)
      const end = kelo()
      pointer('pointerup', end.x, end.y)
      await wait(SETTLE_MS + 700)
      // Six taps: the lunge and the snap.
      for (let i = 0; i < 6; i++) {
        await tapKelo()
        await wait(250)
      }
      await measure('bite')
    } else {
      const taps = (async () => {
        for (let i = 0; i < 5; i++) {
          await tapKelo()
          await wait(550)
        }
      })()
      await measure('taps', taps)
    }
    setReport({
      at: new Date().toISOString(),
      userAgent: navigator.userAgent,
      gpu: gpuName(),
      screen: `${screen.width}x${screen.height} @${window.devicePixelRatio}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      bootTier: stage()?.dataset.tier ?? '?',
      model: stage()?.dataset.model ?? '?',
      load: await loadMetrics(),
      shots,
    })
    setStatus('done')
  }

  const copy = async () => {
    if (!report) return
    await navigator.clipboard.writeText(formatQaReport(report))
    setCopied(true)
  }

  return (
    <aside
      aria-label="Performance QA"
      className="fixed bottom-4 left-4 z-50 max-w-[calc(100vw-2rem)] rounded-md border border-ink-600 bg-ink-950/95 p-3 font-mono text-[11px] text-ink-100 shadow-lg"
    >
      <div className="mb-2 flex items-center gap-2">
        <strong className="text-ink-50">QA</strong>
        <button
          type="button"
          onClick={run}
          disabled={status === 'running'}
          className="min-h-9 rounded border border-ink-500 px-3 disabled:opacity-50"
        >
          {status === 'running' ? 'Measuring…' : status === 'done' ? 'Run again' : 'Start'}
        </button>
        {report && (
          <button
            type="button"
            onClick={copy}
            className="min-h-9 rounded border border-ink-500 px-3"
          >
            {copied ? 'Copied' : 'Copy report'}
          </button>
        )}
      </div>
      {status === 'running' && <p>Playing with Kelo; keep the tab in front and the mouse still.</p>}
      {report && (
        <table className="border-separate border-spacing-x-2">
          <thead>
            <tr>
              <th className="text-left">shot</th>
              <th>fps</th>
              <th>p95 ms</th>
              <th>slow</th>
              <th className="text-left">quality</th>
            </tr>
          </thead>
          <tbody>
            {report.shots.map((s) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td className="text-right">{s.fps}</td>
                <td className="text-right">{s.p95Ms}</td>
                <td className="text-right">{s.slowFrames}</td>
                <td>
                  {s.quality} {s.canvas}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </aside>
  )
}
