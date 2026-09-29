#!/usr/bin/env node
/**
 * Bundle report for the home page, read from the production build in .next:
 *
 *   initial      scripts in the prerendered HTML (every visitor, before interaction)
 *   deferred 3D  chunks of the page's dynamic import (the stage, fetched after hydration)
 *   on demand    other lazy chunks: the ?debug panel, and the KTX2 loader that
 *                only medium and high tiers fetch with the full model
 *   legacy       nomodule polyfills that modern browsers never download
 *
 * The mascot models are checked against character.json budgets, and the
 * Basis transcoder in public/basis is listed as the cost the full model adds.
 *
 * Sizes are gzip level 9, a conservative proxy for the Brotli Vercel serves.
 * Exits 1 when a budget is exceeded. Run after `next build`.
 *
 *   node scripts/review/bundle-report.mjs [--json]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Budgets in kB gzip. See CLAUDE.md and docs/decisions.md (D-019, D-021). */
export const BUDGETS = { initialKB: 150, deferred3dKB: 420 }

const gzipKB = (bytes) => gzipSync(bytes, { level: 9 }).length / 1024
const round = (n) => Math.round(n * 10) / 10

/**
 * Classify and measure the home page chunks of a build directory.
 * @param {string} nextDir path to .next
 */
export function measureBundle(nextDir) {
  const html = readFileSync(join(nextDir, 'server', 'app', 'index.html'), 'utf8')
  const chunkDir = join(nextDir, 'static', 'chunks')
  const scripts = [
    ...html.matchAll(/<script\b[^>]*\bsrc="\/_next\/static\/chunks\/([^"]+\.js)"[^>]*>/g),
  ]
  const initial = new Set(scripts.filter((m) => !/nomodule/i.test(m[0])).map((m) => m[1]))
  const legacy = new Set(scripts.filter((m) => /nomodule/i.test(m[0])).map((m) => m[1]))

  const manifestPath = join(nextDir, 'server', 'app', 'page', 'react-loadable-manifest.json')
  const deferred = new Set()
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    for (const entry of Object.values(manifest)) {
      for (const file of entry.files ?? []) {
        if (file.endsWith('.js')) deferred.add(file.replace(/^static\/chunks\//, ''))
      }
    }
  }

  const chunks = readdirSync(chunkDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => {
      const bytes = readFileSync(join(chunkDir, file))
      const kind = initial.has(file)
        ? 'initial'
        : legacy.has(file)
          ? 'legacy'
          : deferred.has(file)
            ? 'deferred 3D'
            : 'on demand'
      return { file, kind, gzipKB: round(gzipKB(bytes)) }
    })
    .sort((a, b) => b.gzipKB - a.gzipKB)

  const total = (kind) =>
    round(chunks.filter((c) => c.kind === kind).reduce((n, c) => n + c.gzipKB, 0))
  const totals = {
    initial: total('initial'),
    deferred3d: total('deferred 3D'),
    onDemand: total('on demand'),
    legacy: total('legacy'),
  }
  const checks = [
    { id: 'initial JS', actual: totals.initial, budget: BUDGETS.initialKB },
    { id: 'deferred 3D JS', actual: totals.deferred3d, budget: BUDGETS.deferred3dKB },
  ].map((check) => ({ ...check, ok: check.actual <= check.budget }))
  return { chunks, totals, checks, ok: checks.every((c) => c.ok) }
}

/** Model files against their contract budgets. GLBs are already compressed, so raw bytes. */
function modelChecks() {
  const contract = JSON.parse(readFileSync(join(REPO_ROOT, 'character.json'), 'utf8'))
  return ['lite', 'full'].map((tier) => {
    const path = join(REPO_ROOT, contract.files[tier])
    const actual = existsSync(path) ? round(readFileSync(path).length / 1024) : null
    const budget = contract.budgets[tier].maxFileKB
    return {
      id: `model ${tier}`,
      file: contract.files[tier],
      actual,
      budget,
      ok: actual !== null && actual <= budget,
    }
  })
}

/** The Basis transcoder the full model needs, as served (gzip). */
function transcoderKB() {
  const dir = join(REPO_ROOT, 'public', 'basis')
  if (!existsSync(dir)) return null
  return round(readdirSync(dir).reduce((n, f) => n + gzipKB(readFileSync(join(dir, f))), 0))
}

export function main(argv, io = {}) {
  const log = io.log ?? ((s) => console.log(s))
  const nextDir = io.nextDir ?? join(REPO_ROOT, '.next')
  if (!existsSync(join(nextDir, 'server', 'app', 'index.html'))) {
    log('No production build found. Run "corepack pnpm build" first.')
    return 2
  }
  const bundle = measureBundle(nextDir)
  const models = modelChecks()
  const report = {
    ...bundle,
    models,
    transcoderKB: transcoderKB(),
    ok: bundle.ok && models.every((m) => m.ok),
  }

  if (argv.includes('--json')) {
    log(JSON.stringify(report, null, 2))
  } else {
    log('Home page bundle (gzip)\n')
    for (const c of report.chunks)
      log(`  ${c.kind.padEnd(12)} ${String(c.gzipKB).padStart(7)} kB  ${c.file}`)
    log('')
    for (const c of report.checks) {
      log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(16)} ${c.actual} kB (budget ${c.budget} kB)`)
    }
    for (const m of report.models) {
      log(
        `  ${m.ok ? 'PASS' : 'FAIL'}  ${m.id.padEnd(16)} ${m.actual ?? 'missing'} kB (budget ${m.budget} kB)`,
      )
    }
    log(
      `  info  on demand        ${report.totals.onDemand} kB (?debug panel; KTX2 loader on medium and high)`,
    )
    if (report.transcoderKB !== null) {
      log(`  info  basis transcoder ${report.transcoderKB} kB (fetched with the full model)`)
    }
    log(
      `  info  legacy only      ${report.totals.legacy} kB (nomodule, skipped by modern browsers)`,
    )
  }
  return report.ok ? 0 : 1
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) process.exitCode = main(process.argv.slice(2))
