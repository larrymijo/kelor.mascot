#!/usr/bin/env node
/**
 * Validate a mascot GLB against character.json.
 *
 *   node scripts/assets/validate.mjs                        every tier in character.json.files
 *   node scripts/assets/validate.mjs --file m.glb --tier lite
 *   node scripts/assets/validate.mjs --strict               fail when a tier file is missing
 *   node scripts/assets/validate.mjs --json                 machine-readable report
 *
 * Exit codes: 0 all good, 1 validation failed, 2 usage or contract error.
 * Zero dependencies on purpose, so CI can run it on plain Node.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getImageBytes, parseGlb, readImageSize } from './glb.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const TIERS = /** @type {const} */ (['lite', 'full'])

/** @typedef {'pass' | 'warn' | 'fail'} Status */
/** @typedef {{ id: string, status: Status, message: string, hint?: string }} RuleResult */
/** @typedef {{ tier: string, file?: string, sizeBytes?: number, ok: boolean, results: RuleResult[] }} Report */

const isPowerOfTwo = (n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0
const list = (items, max = 8) =>
  items.length > max
    ? `${items.slice(0, max).join(', ')} and ${items.length - max} more`
    : items.join(', ')
const kb = (bytes) => Math.round(bytes / 1024)
const round = (n) => Math.round(n * 1000) / 1000

/**
 * Validate a GLB buffer against the contract for one tier.
 * @param {{ bytes: Uint8Array, contract: any, tier: 'lite' | 'full', baseDir?: string }} input
 * @returns {Report}
 */
export function validateGlb({ bytes, contract, tier, baseDir = process.cwd() }) {
  /** @type {RuleResult[]} */
  const results = []
  const add = (id, status, message, hint) =>
    results.push(
      hint && status !== 'pass' ? { id, status, message, hint } : { id, status, message },
    )
  const done = () => ({ tier, ok: results.every((r) => r.status !== 'fail'), results })

  const budget = contract.budgets[tier]

  // Container ---------------------------------------------------------------
  let gltf
  let bin
  try {
    ;({ json: gltf, bin } = parseGlb(bytes))
  } catch (error) {
    add('glb.container', 'fail', error.message, 'Export as glTF 2.0 Binary (.glb).')
    return done()
  }
  if (gltf.asset?.version !== '2.0') {
    add('glb.container', 'fail', `asset.version is ${gltf.asset?.version}, expected 2.0`)
    return done()
  }
  add('glb.container', 'pass', `glTF 2.0 binary, generator: ${gltf.asset.generator ?? 'unknown'}`)

  // File size -----------------------------------------------------------------
  const sizeKB = kb(bytes.byteLength)
  add(
    'file.size',
    sizeKB <= budget.maxFileKB ? 'pass' : 'fail',
    `${sizeKB} kB (budget ${budget.maxFileKB} kB)`,
    'Compress with gltf-transform (Meshopt geometry, KTX2 textures) or lower texture sizes.',
  )

  // Extensions ----------------------------------------------------------------
  const allowed = new Set(contract.files.allowedExtensions)
  const used = gltf.extensionsUsed ?? []
  const disallowed = used.filter((e) => !allowed.has(e))
  add(
    'extensions',
    disallowed.length === 0 ? 'pass' : 'fail',
    disallowed.length === 0
      ? used.length
        ? `used: ${list(used)}`
        : 'no extensions'
      : `not allowed: ${list(disallowed)}`,
    disallowed.includes('KHR_draco_mesh_compression')
      ? 'Draco is not allowed: compress geometry with Meshopt (gltf-transform meshopt).'
      : `Allowed: ${list([...allowed], 20)}. Update character.json files.allowedExtensions if intended.`,
  )

  // Scene graph ---------------------------------------------------------------
  const nodes = gltf.nodes ?? []
  const meshes = gltf.meshes ?? []
  const accessors = gltf.accessors ?? []
  const parentOf = new Map()
  nodes.forEach((node, i) => (node.children ?? []).forEach((c) => parentOf.set(c, i)))

  const sceneRoots =
    gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? nodes.map((_, i) => i).filter((i) => !parentOf.has(i))
  const sceneNodes = []
  const stack = [...sceneRoots]
  const visited = new Set()
  while (stack.length) {
    const i = stack.pop()
    if (visited.has(i) || !nodes[i]) continue
    visited.add(i)
    sceneNodes.push(i)
    stack.push(...(nodes[i].children ?? []))
  }
  const meshInstances = sceneNodes.filter((i) => nodes[i].mesh !== undefined)

  // Geometry ------------------------------------------------------------------
  let triangles = 0
  let drawCalls = 0
  let morphTargets = 0
  let influenceSets = 0
  const nonTriangle = new Set()
  for (const nodeIndex of meshInstances) {
    const mesh = meshes[nodes[nodeIndex].mesh]
    for (const prim of mesh?.primitives ?? []) {
      drawCalls += 1
      const mode = prim.mode ?? 4
      const count =
        prim.indices !== undefined
          ? (accessors[prim.indices]?.count ?? 0)
          : (accessors[prim.attributes?.POSITION]?.count ?? 0)
      if (mode === 4) triangles += Math.floor(count / 3)
      else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2)
      else nonTriangle.add(mesh.name ?? `mesh ${nodes[nodeIndex].mesh}`)
      morphTargets = Math.max(morphTargets, prim.targets?.length ?? 0)
      const sets = Object.keys(prim.attributes ?? {}).filter((a) => /^JOINTS_\d+$/.test(a)).length
      influenceSets = Math.max(influenceSets, sets)
    }
  }
  add(
    'geometry.triangles',
    triangles <= budget.maxTriangles ? 'pass' : 'fail',
    `${triangles} triangles (budget ${budget.maxTriangles})`,
    'Decimate or remesh at a lower density for this tier.',
  )
  add(
    'geometry.drawCalls',
    drawCalls <= budget.maxDrawCalls ? 'pass' : 'fail',
    `${drawCalls} primitives rendered (budget ${budget.maxDrawCalls})`,
    'Join meshes that share a material and keep one primitive per mesh.',
  )
  if (nonTriangle.size) {
    add(
      'geometry.primitives',
      'warn',
      `points or lines in: ${list([...nonTriangle])}`,
      'Remove helper geometry before export.',
    )
  }
  add(
    'geometry.morphTargets',
    morphTargets <= budget.maxMorphTargets ? 'pass' : 'fail',
    `${morphTargets} morph targets (budget ${budget.maxMorphTargets})`,
    'Expressions use the face atlas, not shape keys: remove shape keys before export.',
  )
  const influences = influenceSets * 4
  add(
    'skin.influences',
    influences <= budget.maxInfluencesPerVertex ? 'pass' : 'fail',
    `up to ${influences} influences per vertex (budget ${budget.maxInfluencesPerVertex})`,
    'Limit total weights to 4 per vertex (Blender: Weights > Limit Total) before export.',
  )

  // Skeleton ------------------------------------------------------------------
  const skins = gltf.skins ?? []
  const expectedBones = contract.skeleton.bones
  if (skins.length === 0) {
    add(
      'skeleton.skin',
      'fail',
      'no skin found',
      'Parent the meshes to the armature with automatic weights.',
    )
  } else {
    const jointSets = skins.map((s) => [...s.joints].sort((a, b) => a - b).join(','))
    add(
      'skeleton.skin',
      new Set(jointSets).size === 1 ? 'pass' : 'warn',
      new Set(jointSets).size === 1
        ? `${skins.length} skin(s) sharing one skeleton`
        : `${skins.length} skins with different joint sets`,
      'Use a single armature for every mesh.',
    )
    const jointIndices = [...new Set(skins.flatMap((s) => s.joints))]
    const boneNodeByName = new Map(jointIndices.map((i) => [nodes[i]?.name ?? `node ${i}`, i]))
    add(
      'skeleton.boneCount',
      boneNodeByName.size <= budget.maxBones ? 'pass' : 'fail',
      `${boneNodeByName.size} bones (budget ${budget.maxBones})`,
      'Remove helper and IK bones from the exported deform set.',
    )

    const missingBones = expectedBones.map((b) => b.name).filter((n) => !boneNodeByName.has(n))
    const extraBones = [...boneNodeByName.keys()].filter(
      (n) => !expectedBones.some((b) => b.name === n),
    )
    add(
      'skeleton.names',
      missingBones.length === 0 && extraBones.length === 0 ? 'pass' : 'fail',
      missingBones.length === 0 && extraBones.length === 0
        ? `all ${expectedBones.length} bones match`
        : [
            missingBones.length ? `missing: ${list(missingBones)}` : '',
            extraBones.length ? `unexpected: ${list(extraBones)}` : '',
          ]
            .filter(Boolean)
            .join(' · '),
      'Rename bones to match character.json skeleton.bones exactly (case-sensitive).',
    )

    const wrongParents = []
    for (const bone of expectedBones) {
      const index = boneNodeByName.get(bone.name)
      if (index === undefined) continue
      const parentIndex = parentOf.get(index)
      const parentName = parentIndex === undefined ? null : (nodes[parentIndex]?.name ?? null)
      const parentIsBone = parentIndex !== undefined && jointIndices.includes(parentIndex)
      const ok = bone.parent === null ? !parentIsBone : parentName === bone.parent
      if (!ok)
        wrongParents.push(
          `${bone.name} → ${parentName ?? 'none'} (expected ${bone.parent ?? 'no bone'})`,
        )
    }
    add(
      'skeleton.hierarchy',
      wrongParents.length === 0 ? 'pass' : 'fail',
      wrongParents.length === 0
        ? 'parents match the contract'
        : `wrong parent: ${list(wrongParents, 5)}`,
      'Re-parent the bones as listed in character.json skeleton.bones.',
    )
  }

  // Meshes and materials ------------------------------------------------------
  const meshNames = new Set()
  const materialsByMesh = new Map()
  for (const nodeIndex of meshInstances) {
    const node = nodes[nodeIndex]
    const mesh = meshes[node.mesh]
    const names = [node.name, mesh?.name].filter(Boolean)
    const materialNames = (mesh?.primitives ?? [])
      .map((p) => gltf.materials?.[p.material]?.name)
      .filter(Boolean)
    for (const name of names) {
      meshNames.add(name)
      materialsByMesh.set(name, { materialNames, skinned: node.skin !== undefined })
    }
  }
  const requiredMeshes = contract.meshes.required
  const missingMeshes = requiredMeshes.map((m) => m.name).filter((n) => !meshNames.has(n))
  add(
    'meshes.required',
    missingMeshes.length === 0 ? 'pass' : 'fail',
    missingMeshes.length === 0
      ? `found ${list(requiredMeshes.map((m) => m.name))}`
      : `missing: ${list(missingMeshes)}`,
    'Name objects or mesh data exactly as in character.json meshes.required.',
  )
  const meshIssues = []
  for (const required of requiredMeshes) {
    const info = materialsByMesh.get(required.name)
    if (!info) continue
    if (!info.skinned) meshIssues.push(`${required.name} is not skinned`)
    if (!info.materialNames.includes(required.material)) {
      meshIssues.push(
        `${required.name} uses ${list(info.materialNames) || 'no material'}, expected ${required.material}`,
      )
    }
  }
  if (meshIssues.length) {
    add(
      'meshes.binding',
      'warn',
      list(meshIssues, 6),
      'Check skinning and material slots per mesh.',
    )
  }

  const materials = gltf.materials ?? []
  const materialNames = new Set(materials.map((m) => m.name))
  const missingMaterials = contract.materials.required
    .map((m) => m.name)
    .filter((n) => !materialNames.has(n))
  add(
    'materials.count',
    materials.length <= budget.maxMaterials ? 'pass' : 'fail',
    `${materials.length} materials (budget ${budget.maxMaterials})`,
    'Merge materials; each extra material costs a draw call.',
  )
  add(
    'materials.required',
    missingMaterials.length === 0 ? 'pass' : 'fail',
    missingMaterials.length === 0
      ? `found ${list(contract.materials.required.map((m) => m.name))}`
      : `missing: ${list(missingMaterials)}`,
    'The runtime looks materials up by name (glow, expression atlas): rename them to match.',
  )

  // Textures ------------------------------------------------------------------
  const images = gltf.images ?? []
  add(
    'textures.count',
    images.length <= budget.maxTextures ? 'pass' : 'fail',
    `${images.length} images (budget ${budget.maxTextures})`,
    'Pack channels (occlusion, roughness, metalness into one ORM map) or drop maps for this tier.',
  )
  const readExternal = (uri) => {
    const path = resolve(baseDir, uri)
    return existsSync(path) ? new Uint8Array(readFileSync(path)) : null
  }
  const sizeProblems = []
  const unreadable = []
  const sizes = []
  images.forEach((image, i) => {
    const label = image.name ?? `image ${i}`
    const { bytes: imageBytes, source } = getImageBytes(gltf, bin, image, readExternal)
    const size = imageBytes && readImageSize(imageBytes)
    if (!size) {
      unreadable.push(`${label} (${source})`)
      return
    }
    sizes.push(`${label} ${size.width}×${size.height} ${size.format}`)
    if (!isPowerOfTwo(size.width) || !isPowerOfTwo(size.height)) {
      sizeProblems.push(`${label} ${size.width}×${size.height} is not a power of two`)
    }
    if (Math.max(size.width, size.height) > budget.maxTextureSize) {
      sizeProblems.push(`${label} ${size.width}×${size.height} exceeds ${budget.maxTextureSize}px`)
    }
  })
  add(
    'textures.size',
    sizeProblems.length === 0 ? 'pass' : 'fail',
    sizeProblems.length === 0
      ? sizes.length
        ? list(sizes, 6)
        : 'no images'
      : list(sizeProblems, 6),
    `Resize to a power of two, at most ${budget.maxTextureSize}px for the ${tier} tier.`,
  )
  if (unreadable.length) {
    add(
      'textures.readable',
      'warn',
      `could not read the size of ${list(unreadable)}`,
      'Embed images as PNG, JPEG, WebP or KTX2.',
    )
  }
  const expectedTextures = contract.textures.items
    .filter((t) => t.size[tier] !== null)
    .map((t) => t.name)
  const imageNames = new Set(images.map((img) => img.name))
  const missingTextures = expectedTextures.filter((n) => !imageNames.has(n))
  if (missingTextures.length) {
    add(
      'textures.names',
      'warn',
      `expected image names not found: ${list(missingTextures)}`,
      'Name images as in character.json textures.items so the pipeline and runtime can find them.',
    )
  }

  // Animations ----------------------------------------------------------------
  const animations = gltf.animations ?? []
  const clipDuration = (animation) =>
    Math.max(0, ...(animation.samplers ?? []).map((s) => accessors[s.input]?.max?.[0] ?? 0))
  const byName = new Map(animations.map((a, i) => [a.name ?? `animation ${i}`, a]))
  const requiredClips = contract.clips.required
  const missingClips = requiredClips.map((c) => c.name).filter((n) => !byName.has(n))
  add(
    'animations.required',
    missingClips.length === 0 ? 'pass' : 'fail',
    missingClips.length === 0
      ? `found ${list(requiredClips.map((c) => c.name))}`
      : `missing: ${list(missingClips)}`,
    'Name the Blender actions exactly as in character.json clips.required and export all actions.',
  )
  const unknownClips = [...byName.keys()].filter((n) => !requiredClips.some((c) => c.name === n))
  if (unknownClips.length) {
    add(
      'animations.unknown',
      'warn',
      `clips not in the contract: ${list(unknownClips)}`,
      'Delete stray actions (for example T-pose or test actions) or add them to the contract.',
    )
  }
  const tolerance = contract.clips.durationToleranceS
  const wrongDurations = requiredClips
    .filter((c) => byName.has(c.name))
    .map((c) => ({ c, actual: clipDuration(byName.get(c.name)) }))
    .filter(({ c, actual }) => Math.abs(actual - c.durationS) > tolerance)
    .map(({ c, actual }) => `${c.name} ${round(actual)} s (expected ${c.durationS} s)`)
  add(
    'animations.duration',
    wrongDurations.length === 0 ? 'pass' : 'fail',
    wrongDurations.length === 0
      ? `every clip within ±${tolerance} s of its nominal length`
      : list(wrongDurations, 6),
    `Set each action's frame range to durationS × ${contract.clips.fps} fps.`,
  )
  const totalSeconds = animations.reduce((sum, a) => sum + clipDuration(a), 0)
  add(
    'animations.total',
    totalSeconds <= budget.maxAnimationSeconds ? 'pass' : 'fail',
    `${round(totalSeconds)} s of animation (budget ${budget.maxAnimationSeconds} s)`,
    'Shorten or remove clips.',
  )

  const procedural = new Set(contract.skeleton.procedural)
  const rootName = contract.skeleton.rootBone
  const keyedProcedural = new Set()
  const keyedRoot = new Set()
  for (const [name, animation] of byName) {
    for (const channel of animation.channels ?? []) {
      const target = nodes[channel.target?.node]?.name
      if (procedural.has(target)) keyedProcedural.add(`${name}:${target}`)
      if (!contract.clips.rootMotion && target === rootName) keyedRoot.add(name)
    }
  }
  add(
    'animations.procedural',
    keyedProcedural.size === 0 ? 'pass' : 'fail',
    keyedProcedural.size === 0
      ? `no clip keys ${list([...procedural])}`
      : `procedural bones keyed: ${list([...keyedProcedural])}`,
    'Eyes and eyelids are driven at runtime: delete their keyframes from every action.',
  )
  add(
    'animations.rootMotion',
    keyedRoot.size === 0 ? 'pass' : 'fail',
    keyedRoot.size === 0
      ? `"${rootName}" is never keyed`
      : `"${rootName}" keyed in: ${list([...keyedRoot])}`,
    'Root motion is off: move the character with hips, never with the root bone.',
  )

  // Scale ---------------------------------------------------------------------
  const quantized = used.includes('KHR_mesh_quantization')
  const bodyNode = meshInstances.find(
    (i) => nodes[i].name === 'body' || meshes[nodes[i].mesh]?.name === 'body',
  )
  if (bodyNode !== undefined && !quantized) {
    const ys = (meshes[nodes[bodyNode].mesh]?.primitives ?? [])
      .map((p) => accessors[p.attributes?.POSITION])
      .filter((a) => a?.min && a?.max)
      .flatMap((a) => [a.min[1], a.max[1]])
    if (ys.length) {
      const height = Math.max(...ys) - Math.min(...ys)
      const expected = contract.meta.heightM
      const ok = Math.abs(height - expected) <= expected * contract.meta.heightToleranceRatio
      add(
        'scale.height',
        ok ? 'pass' : 'warn',
        `body is ${round(height)} m tall (expected ${expected} m)`,
        'Apply scale in Blender and export in metres with +Y up.',
      )
    }
  }

  return done()
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `Usage: node scripts/assets/validate.mjs [options]

Options:
  --file <path>       GLB to validate (default: every tier in character.json files)
  --tier <lite|full>  budget tier (default: inferred from the file name, else full)
  --contract <path>   contract file (default: character.json at the repo root)
  --strict            fail when a tier file from the contract is missing
  --json              print a JSON report
  -h, --help          show this help`

/** @param {string[]} argv */
export function parseArgs(argv) {
  const options = {
    file: null,
    tier: null,
    contract: null,
    strict: false,
    json: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => {
      const next = argv[++i]
      if (next === undefined || next.startsWith('--')) throw new Error(`${arg} needs a value`)
      return next
    }
    if (arg === '--file') options.file = value()
    else if (arg === '--tier') options.tier = value()
    else if (arg === '--contract') options.contract = value()
    else if (arg === '--strict') options.strict = true
    else if (arg === '--json') options.json = true
    else if (arg === '-h' || arg === '--help') options.help = true
    else throw new Error(`Unknown option ${arg}`)
  }
  if (options.tier !== null && !TIERS.includes(options.tier)) {
    throw new Error(`--tier must be one of ${TIERS.join(', ')}`)
  }
  return options
}

function loadContract(path) {
  const contract = JSON.parse(readFileSync(path, 'utf8'))
  const required = [
    'budgets',
    'skeleton',
    'meshes',
    'materials',
    'textures',
    'clips',
    'files',
    'meta',
  ]
  const missing = required.filter((key) => !(key in contract))
  if (missing.length) throw new Error(`missing sections: ${missing.join(', ')}`)
  return contract
}

function colours(enabled) {
  const wrap = (code) => (text) => (enabled ? `\x1b[${code}m${text}\x1b[0m` : text)
  return { green: wrap(32), yellow: wrap(33), red: wrap(31), dim: wrap(2), bold: wrap(1) }
}

/** @param {Report} report */
export function formatReport(report, contract, { colour = false } = {}) {
  const c = colours(colour)
  const badge = { pass: c.green('PASS'), warn: c.yellow('WARN'), fail: c.red('FAIL') }
  const width = Math.max(...report.results.map((r) => r.id.length), 10) + 2
  const lines = [
    c.bold(`KELOR GLB validator · contract v${contract.contractVersion} · tier ${report.tier}`),
    report.file
      ? report.sizeBytes === undefined
        ? report.file
        : `${report.file} · ${kb(report.sizeBytes)} kB`
      : '',
    '',
  ]
  for (const r of report.results) {
    lines.push(`  ${badge[r.status]}  ${r.id.padEnd(width)}${r.message}`)
    if (r.hint) lines.push(`        ${' '.repeat(width)}${c.dim(`→ ${r.hint}`)}`)
  }
  const count = (s) => report.results.filter((r) => r.status === s).length
  const verdict = report.ok ? c.green('PASS') : c.red('FAIL')
  lines.push(
    '',
    `Result: ${verdict} · ${count('fail')} failed · ${count('warn')} warnings · ${count('pass')} passed`,
  )
  return lines.filter((line, i) => line !== '' || i > 1).join('\n')
}

function inferTier(file) {
  return /\.lite\.glb$/i.test(file) ? 'lite' : 'full'
}

/**
 * Run the CLI. Returns the exit code instead of exiting, for tests.
 * @param {string[]} argv
 * @param {{ log?: (s: string) => void, error?: (s: string) => void, cwd?: string, colour?: boolean, annotate?: boolean }} io
 */
export function main(argv, io = {}) {
  const log = io.log ?? ((s) => console.log(s))
  const error = io.error ?? ((s) => console.error(s))
  const cwd = io.cwd ?? process.cwd()

  let options
  try {
    options = parseArgs(argv)
  } catch (e) {
    error(`${e.message}\n\n${USAGE}`)
    return 2
  }
  if (options.help) {
    log(USAGE)
    return 0
  }

  const contractPath = options.contract
    ? resolve(cwd, options.contract)
    : resolve(REPO_ROOT, 'character.json')
  let contract
  try {
    contract = loadContract(contractPath)
  } catch (e) {
    error(
      `Cannot read the contract at ${contractPath}: ${e.message}\nRun "corepack pnpm test" for a detailed schema report.`,
    )
    return 2
  }

  const targets = options.file
    ? [{ tier: options.tier ?? inferTier(options.file), path: resolve(cwd, options.file) }]
    : TIERS.map((tier) => ({ tier, path: resolve(REPO_ROOT, contract.files[tier]) }))

  /** @type {Report[]} */
  const reports = []
  const skipped = []
  for (const { tier, path } of targets) {
    const display = (relative(cwd, path) || path).split(sep).join('/')
    if (!existsSync(path)) {
      if (options.file || options.strict) {
        reports.push({
          tier,
          file: display,
          ok: false,
          results: [{ id: 'file.exists', status: 'fail', message: `${display} not found` }],
        })
      } else {
        skipped.push({ tier, file: display })
      }
      continue
    }
    const bytes = new Uint8Array(readFileSync(path))
    const report = validateGlb({ bytes, contract, tier, baseDir: dirname(path) })
    reports.push({ ...report, file: display, sizeBytes: bytes.byteLength })
  }

  const ok = reports.every((r) => r.ok)
  if (options.json) {
    log(JSON.stringify({ ok, reports, skipped }, null, 2))
  } else {
    for (const s of skipped) {
      log(`SKIP  ${s.tier}: ${s.file} not found (expected until phase 3 produces the model)`)
    }
    for (const report of reports)
      log(
        `${skipped.length || reports.indexOf(report) ? '\n' : ''}${formatReport(report, contract, { colour: io.colour })}`,
      )
    if (reports.length === 0) log('No model files yet. Nothing to validate.')
  }

  if (io.annotate) {
    for (const report of reports) {
      for (const r of report.results.filter((x) => x.status !== 'pass')) {
        const level = r.status === 'fail' ? 'error' : 'warning'
        log(
          `::${level} file=${report.file},title=${r.id} (${report.tier})::${r.message}${r.hint ? ` → ${r.hint}` : ''}`,
        )
      }
    }
  }
  return ok ? 0 : 1
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  const colour = Boolean(process.env.FORCE_COLOR) || (process.stdout.isTTY && !process.env.NO_COLOR)
  process.exitCode = main(process.argv.slice(2), {
    colour,
    annotate: process.env.GITHUB_ACTIONS === 'true',
  })
}
