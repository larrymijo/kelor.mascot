#!/usr/bin/env node
/**
 * Build the mascot from assets/model/fit.json, end to end:
 *
 *   1 normalize  Node     source -> build/model/normalized.glb
 *   2 rig        Node     landmarks + fitted skeleton -> build/model/rig.json
 *   3 body       Blender  retopology, UVs, bakes, weights -> build/model/<tier>/
 *   4 assemble   Node     contract GLBs -> public/models/mascot.<tier>.glb
 *   5 validate   Node     strict validator on both tiers
 *   6 review     Blender  renders -> assets/review/phase-3/*.png
 *
 *   node scripts/assets/model/run.mjs                  everything (Blender from $BLENDER or PATH)
 *   node scripts/assets/model/run.mjs --until rig      stop after a step; steps 1-2 need no Blender
 *
 * Output of every step is mirrored to assets/review/phase-3/pipeline.log and
 * a machine-readable summary.json, which CI commits back to the branch.
 */
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boneSegments, isProcedural } from '../assembly/skinning.mjs'
import { buildModel } from '../build-model.mjs'
import { validateGlb } from '../validate.mjs'
import { fitSkeleton, measureLandmarks } from './landmarks.mjs'
import { normalizeSource, readPositions } from './normalize.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const BUILD = join(ROOT, 'build', 'model')
const REVIEW = join(ROOT, 'assets', 'review', 'phase-3')
const LOG = join(REVIEW, 'pipeline.log')
const STEPS = ['normalize', 'rig', 'body', 'assemble', 'validate', 'review']
const TIERS = ['full', 'lite']

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const log = (line) => {
  console.log(line)
  appendFileSync(LOG, `${line}\n`)
}

function blender(script, args) {
  const bin = process.env.BLENDER ?? 'blender'
  const argv = ['-b', '--factory-startup', '--python-exit-code', '1', '-P', script, '--', ...args]
  log(`$ ${bin} ${argv.join(' ')}`)
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, argv, { cwd: ROOT })
    const forward = (chunk) => {
      process.stdout.write(chunk)
      appendFileSync(LOG, chunk)
    }
    child.stdout.on('data', forward)
    child.stderr.on('data', forward)
    child.on('error', (error) =>
      reject(new Error(`Could not start Blender (${bin}): ${error.message}. Set BLENDER.`)),
    )
    child.on('close', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${script} exited with ${code}`)),
    )
  })
}

async function main(argv) {
  const untilArg = argv.includes('--until') ? argv[argv.indexOf('--until') + 1] : 'review'
  if (!STEPS.includes(untilArg)) throw new Error(`--until must be one of ${STEPS.join(', ')}`)
  const until = STEPS.indexOf(untilArg)
  mkdirSync(BUILD, { recursive: true })
  mkdirSync(REVIEW, { recursive: true })
  writeFileSync(LOG, `Kelo model pipeline, ${new Date().toISOString()}\n`)

  const contract = readJson(join(ROOT, 'character.json'))
  const fit = readJson(join(ROOT, 'assets', 'model', 'fit.json'))
  const summary = { source: fit.source, steps: {} }
  const step = async (index, name, run) => {
    if (index > until) return
    const started = Date.now()
    log(`\n== ${index + 1}. ${name}`)
    summary.steps[name] = await run()
    log(`== ${name} done in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  }

  try {
    await step(0, 'normalize', async () => {
      const bytes = new Uint8Array(readFileSync(join(ROOT, fit.source)))
      const { bytes: out, report } = await normalizeSource({
        bytes,
        fit,
        heightM: contract.meta.heightM,
      })
      writeFileSync(join(BUILD, 'normalized.glb'), out)
      log(JSON.stringify(report))
      return report
    })

    await step(1, 'rig', async () => {
      const positions = await readPositions(readFileSync(join(BUILD, 'normalized.glb')))
      const landmarks = measureLandmarks(positions, contract.meta.heightM)
      const fitted = fitSkeleton(contract, landmarks, fit.rig.overrides)
      const segments = boneSegments(fitted)
      const bones = fitted.map((bone) => ({
        ...bone,
        tail: segments.get(bone.name)?.[1].toArray() ?? [
          bone.restHead[0],
          bone.restHead[1] + 0.03,
          bone.restHead[2],
        ],
        deform: bone.role !== 'root' && !isProcedural(bone),
      }))
      writeFileSync(join(BUILD, 'rig.json'), JSON.stringify({ bones, landmarks }, null, 2))
      log(JSON.stringify(landmarks))
      return { landmarks }
    })

    await step(2, 'body', async () => {
      await blender('scripts/blender/body.py', ['--root', ROOT, '--out', 'build/model'])
      return readJson(join(BUILD, 'body-report.json'))
    })

    await step(3, 'assemble', async () => {
      const rig = readJson(join(BUILD, 'rig.json'))
      const reports = {}
      for (const tier of TIERS) {
        const folder = join(BUILD, tier)
        const image = (file, mimeType) => ({
          data: new Uint8Array(readFileSync(join(folder, file))),
          mimeType,
        })
        const { bytes, report } = await buildModel({
          contract,
          fit,
          tier,
          body: new Uint8Array(readFileSync(join(folder, 'body.glb'))),
          rig,
          textures: {
            baseColor: image('basecolor.jpg', 'image/jpeg'),
            orm: image('orm.jpg', 'image/jpeg'),
            normal: existsSync(join(folder, 'normal.png'))
              ? image('normal.png', 'image/png')
              : undefined,
          },
        })
        writeFileSync(join(ROOT, contract.files[tier]), bytes)
        reports[tier] = { ...report, kB: Math.round(bytes.byteLength / 1024) }
        log(`${tier}: ${reports[tier].kB} kB, ${report.repairedVertices} repaired vertices`)
      }
      return reports
    })

    await step(4, 'validate', async () => {
      const results = {}
      for (const tier of TIERS) {
        const bytes = new Uint8Array(readFileSync(join(ROOT, contract.files[tier])))
        const report = validateGlb({ bytes, contract, tier })
        for (const r of report.results)
          log(`  ${r.status.toUpperCase().padEnd(4)} ${tier} ${r.id}: ${r.message}`)
        results[tier] = {
          ok: report.ok,
          notPassing: report.results.filter((r) => r.status !== 'pass'),
        }
      }
      if (!Object.values(results).every((r) => r.ok)) {
        summary.steps.validate = results
        throw new Error('The validator rejected the model')
      }
      return results
    })

    await step(5, 'review', async () => {
      await blender('scripts/blender/review.py', [
        '--root',
        ROOT,
        '--model',
        'public/models/mascot.full.glb',
        '--out',
        'assets/review/phase-3',
      ])
      return { folder: 'assets/review/phase-3' }
    })
    summary.ok = true
  } catch (error) {
    summary.ok = false
    summary.error = error.message
    log(`\nFAILED: ${error.message}`)
  } finally {
    writeFileSync(join(REVIEW, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  }
  return summary.ok ? 0 : 1
}

process.exitCode = await main(process.argv.slice(2))
