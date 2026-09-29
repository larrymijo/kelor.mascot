#!/usr/bin/env node
/**
 * Performance probe for the production build, with the Playwright and Chrome
 * already installed for the e2e suite (nothing is downloaded).
 *
 *   fps profiles   pin a quality tier with ?tier=, scroll to each checkpoint
 *                  of the scroll script and count animation frames, uncapped
 *                  (headless Chrome has no vsync), so headroom above 60 shows
 *   load profiles  record FCP, LCP and its element, CLS, an estimate of TBT
 *                  (long tasks from FCP until 3 s after Kelo is ready), when
 *                  the egg and Kelo appear, and the bytes by kind
 *
 * The laptop profiles match the owner's screen (1920x1080 at 150%, so a
 * 1280x650 page at DPR 1.5); the phone profile uses Lighthouse's mobile
 * throttling. GPU numbers depend on power and heat: compare runs made
 * back to back, not across days.
 *
 *   node scripts/review/perf.mjs [--profile a,b] [--runs 3] [--url http://localhost:3000]
 *                                [--tasks] [--assert]
 *
 * TBT is split where StageMount requests the 3D chunk: the page before it
 * and the 3D boot after it, each with its own budget (D-094). --assert fails
 * when the phone profile misses either; --tasks lists the page's long tasks
 * and the scripts that ran in them.
 *
 * Without --url it builds nothing: it serves the existing .next build with
 * `next start` on a spare port. Results also go to scripts/review/out/perf.json.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from '@playwright/test'
import { blockingTime, checkTbt, median, resourceKind } from './perf-metrics.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT_DIR = join(REPO_ROOT, 'scripts', 'review', 'out')

/** Checkpoints of docs/scroll-script.md reachable by scrolling, with their act. */
export const CHECKPOINTS = [
  { id: 'hero', act: 'hero', progress: 0 },
  { id: 'gulp', act: 'gulp', progress: 0.15 },
  { id: 'meet', act: 'meet', progress: 0.42 },
  { id: 'eyes', act: 'detail', progress: 0.61 },
  { id: 'plates', act: 'detail', progress: 0.74 },
  { id: 'finale', act: 'finale', progress: 0.95 },
]

const LAPTOP = { viewport: { width: 1280, height: 650 }, deviceScaleFactor: 1.5 }
const PHONE = {
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 1.75,
  isMobile: true,
  hasTouch: true,
  userAgent: devices['Pixel 7'].userAgent,
}
/** Lighthouse's mobile throttling: 150 ms RTT, 1.6 Mbps down, 675 kbps up. */
const SLOW_4G = {
  offline: false,
  latency: 150,
  downloadThroughput: (1638.4 * 1024) / 8,
  uploadThroughput: (675 * 1024) / 8,
}

export const PROFILES = {
  'laptop-medium': { kind: 'fps', context: LAPTOP, query: '?tier=medium' },
  'laptop-high': { kind: 'fps', context: LAPTOP, query: '?tier=high' },
  'laptop-load': { kind: 'load', context: LAPTOP },
  'phone-load': { kind: 'load', context: PHONE, cpuSlowdown: 4, network: SLOW_4G },
}

function parseArgs(argv) {
  const args = { profiles: Object.keys(PROFILES), runs: 1, url: null, tasks: false, assert: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--profile') args.profiles = argv[++i].split(',')
    else if (argv[i] === '--runs') args.runs = Number(argv[++i])
    else if (argv[i] === '--url') args.url = argv[++i]
    else if (argv[i] === '--tasks') args.tasks = true
    else if (argv[i] === '--assert') args.assert = true
  }
  for (const name of args.profiles)
    if (!PROFILES[name]) throw new Error(`Unknown profile ${name}: ${Object.keys(PROFILES)}`)
  return args
}

async function serve() {
  const port = 3200 + Math.floor(Math.random() * 500)
  const server = spawn(
    process.execPath,
    [join(REPO_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port)],
    { cwd: REPO_ROOT, stdio: 'ignore' },
  )
  const url = `http://localhost:${port}`
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop: () => server.kill() }
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  server.kill()
  throw new Error('next start did not answer; run `corepack pnpm build` first')
}

/** Frames per second and 95th percentile frame time over a window, in the page. */
function sampleFrames(windowMs) {
  return new Promise((resolve) => {
    const deltas = []
    let last = performance.now()
    const start = last
    const tick = (now) => {
      deltas.push(now - last)
      last = now
      if (now - start < windowMs) requestAnimationFrame(tick)
      else {
        const sorted = deltas.slice(1).sort((a, b) => a - b)
        resolve({
          fps: Math.round((sorted.length / (now - start)) * 1000),
          p95ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10,
        })
      }
    }
    requestAnimationFrame(tick)
  })
}

async function runFps(browser, baseUrl, profile) {
  const context = await browser.newContext(profile.context)
  const page = await context.newPage()
  await page.goto(baseUrl + profile.query)
  await page.waitForSelector('[data-scene-state="ready"]', { timeout: 60_000 })
  await page.waitForSelector('html.cinematic', { timeout: 30_000 })
  // Let the full model stream in and the monitor's settle window pass.
  await page.waitForSelector('[data-model="full"]', { timeout: 60_000 }).catch(() => {})
  await page.waitForTimeout(3_000)
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    return c ? `${c.width}x${c.height}` : 'none'
  })
  const shots = []
  for (const checkpoint of CHECKPOINTS) {
    await page.evaluate(
      (p) => window.scrollTo(0, p * (document.documentElement.scrollHeight - window.innerHeight)),
      checkpoint.progress,
    )
    await page
      .waitForSelector(`#cinematic-ui[data-act="${checkpoint.act}"]`, { timeout: 10_000 })
      .catch(() => {})
    await page.waitForTimeout(1_800)
    shots.push({ id: checkpoint.id, ...(await page.evaluate(sampleFrames, 2_500)) })
  }
  const quality = await page.getAttribute('[data-quality]', 'data-quality')
  await context.close()
  return { canvas, quality, shots }
}

async function runLoad(browser, baseUrl, profile) {
  const context = await browser.newContext(profile.context)
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  if (profile.cpuSlowdown)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown })
  if (profile.network) await cdp.send('Network.emulateNetworkConditions', profile.network)
  await page.addInitScript(() => {
    const m = { fcp: null, lcp: null, cls: 0, longTasks: [], frames: [], states: {} }
    Object.assign(window, { __perf: m })
    const watch = (type, onEntry) =>
      new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({
        type,
        buffered: true,
      })
    watch('paint', (e) => {
      if (e.name === 'first-contentful-paint') m.fcp = e.startTime
    })
    watch('largest-contentful-paint', (e) => {
      const el = e.element
      m.lcp = {
        at: e.startTime,
        element: el
          ? `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('alt') || '').trim().slice(0, 24)}"`
          : null,
      }
    })
    watch('layout-shift', (e) => {
      if (!e.hadRecentInput) m.cls += e.value
    })
    watch('longtask', (e) => m.longTasks.push([e.startTime, e.duration]))
    // Long animation frames name the scripts that ran in them (Chrome 123+), for --tasks.
    if (PerformanceObserver.supportedEntryTypes.includes('long-animation-frame'))
      watch('long-animation-frame', (e) =>
        m.frames.push({
          start: Math.round(e.startTime),
          duration: Math.round(e.duration),
          scripts: e.scripts.map((sc) => ({
            source: (sc.sourceURL || sc.invoker || '').split('/').pop(),
            invoker: sc.invokerType,
            ms: Math.round(sc.duration),
            layout: Math.round(sc.forcedStyleAndLayoutDuration),
          })),
        }),
      )
    new MutationObserver(() => {
      const state = document.querySelector('[data-scene-state]')?.getAttribute('data-scene-state')
      if (state && m.states[state] === undefined) m.states[state] = performance.now()
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-scene-state'] })
  })
  await page.goto(baseUrl, { timeout: 120_000 })
  await page
    .waitForSelector('[data-scene-state="ready"],[data-scene-state="unavailable"]', {
      timeout: 120_000,
    })
    .catch(() => {})
  await page.waitForTimeout(3_000)
  const m = await page.evaluate(() => window.__perf)
  // StageMount marks when it requests the 3D chunk (STAGE_IMPORT_MARK).
  const stageImport = await page.evaluate(
    () => performance.getEntriesByName('kelor:3d-import')[0]?.startTime ?? null,
  )
  const resources = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((r) => [new URL(r.name).pathname, r.transferSize || r.encodedBodySize]),
  )
  await context.close()

  const bytes = {}
  for (const [pathname, size] of resources) {
    const kind = resourceKind(pathname)
    bytes[kind] = (bytes[kind] ?? 0) + size
  }
  const drawing = m.states.egg ?? m.states.hatching ?? m.states.ready ?? null
  const ready = m.states.ready ?? null
  return {
    fcpMs: m.fcp && Math.round(m.fcp),
    lcpMs: m.lcp && Math.round(m.lcp.at),
    lcpElement: m.lcp?.element ?? null,
    cls: Math.round(m.cls * 1000) / 1000,
    tbtMs: Math.round(blockingTime(m.longTasks, m.fcp ?? 0, (ready ?? m.fcp ?? 0) + 3_000)),
    // The page itself: blocking time from first paint until the 3D chunk is requested.
    shellTbtMs:
      stageImport === null ? null : Math.round(blockingTime(m.longTasks, m.fcp ?? 0, stageImport)),
    // The page's long tasks, [start, duration] in ms, for --tasks.
    pageTasks: m.longTasks
      .filter(([start]) => start >= (m.fcp ?? 0) && start <= (stageImport ?? Infinity))
      .map(([start, duration]) => [Math.round(start), Math.round(duration)]),
    stageImportMs: stageImport && Math.round(stageImport),
    pageFrames: m.frames.filter(
      (fr) => fr.start >= (m.fcp ?? 0) - 50 && fr.start <= (stageImport ?? Infinity),
    ),
    drawingMs: drawing && Math.round(drawing),
    readyMs: ready && Math.round(ready),
    kB: Object.fromEntries(Object.entries(bytes).map(([k, v]) => [k, Math.round(v / 1024)])),
  }
}

function summariseLoad(runs) {
  const pick = (key) => median(runs.map((r) => r[key]))
  return {
    fcpMs: pick('fcpMs'),
    lcpMs: pick('lcpMs'),
    lcpElement: runs.at(-1).lcpElement,
    cls: pick('cls'),
    tbtMs: pick('tbtMs'),
    shellTbtMs: pick('shellTbtMs'),
    drawingMs: pick('drawingMs'),
    readyMs: pick('readyMs'),
    kB: runs.at(-1).kB,
    runs: runs.length,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const server = args.url ? { url: args.url, stop: () => {} } : await serve()
  const browser = await chromium.launch({ channel: 'chrome' })
  const results = {}
  try {
    for (const name of args.profiles) {
      const profile = PROFILES[name]
      if (profile.kind === 'fps') {
        const r = await runFps(browser, server.url, profile)
        results[name] = r
        console.log(`\n${name}  canvas ${r.canvas}, quality ${r.quality}`)
        for (const s of r.shots)
          console.log(`  ${s.id.padEnd(7)} ${String(s.fps).padStart(4)} fps   p95 ${s.p95ms} ms`)
      } else {
        const runs = []
        for (let i = 0; i < args.runs; i++) runs.push(await runLoad(browser, server.url, profile))
        const r = summariseLoad(runs)
        results[name] = r
        if (args.tasks)
          for (const run of runs)
            console.log(
              `  page tasks until the 3D import at ${run.stageImportMs} ms: ${JSON.stringify(run.pageTasks)}\n` +
                run.pageFrames
                  .map(
                    (fr) =>
                      `    frame at ${fr.start} ms, ${fr.duration} ms: ` +
                      fr.scripts.map((sc) => `${sc.source} (${sc.invoker}) ${sc.ms} ms`).join(', '),
                  )
                  .join('\n'),
            )
        console.log(`\n${name}  (median of ${r.runs})`)
        console.log(`  FCP ${r.fcpMs} ms   LCP ${r.lcpMs} ms (${r.lcpElement})   CLS ${r.cls}`)
        console.log(
          `  TBT ~${r.tbtMs} ms (page ${r.shellTbtMs} ms, 3D boot ${r.tbtMs - r.shellTbtMs} ms)   egg ${r.drawingMs} ms   Kelo ready ${r.readyMs} ms`,
        )
        console.log(
          `  kB  ${Object.entries(r.kB)
            .map(([k, v]) => `${k} ${v}`)
            .join(', ')}`,
        )
      }
    }
  } finally {
    await browser.close()
    server.stop()
  }
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(join(OUT_DIR, 'perf.json'), JSON.stringify(results, null, 2))

  if (args.assert) {
    const phone = results['phone-load']
    if (!phone) throw new Error('--assert needs the phone-load profile')
    const checks = checkTbt(phone)
    console.log('')
    for (const c of checks)
      console.log(
        `  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(12)} ${c.value} ms (budget ${c.budget} ms)`,
      )
    if (checks.some((c) => !c.ok)) process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
