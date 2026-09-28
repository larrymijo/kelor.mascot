#!/usr/bin/env node
/**
 * Build the placeholder mascot GLBs from character.json.
 *
 *   node scripts/assets/build-placeholder.mjs            write both tiers to build/placeholder/
 *   node scripts/assets/build-placeholder.mjs --public   write them to character.json files.* (replaces the model)
 *   node scripts/assets/build-placeholder.mjs --check    exit 1 if the files on disk are out of date
 *
 * The placeholder honours the whole contract (bone names, hierarchy and rest
 * positions, mesh and material names, textures, expression atlas, clips), so
 * the runtime loads it exactly like the real model. It shares the contract
 * assembly (assembly/*.mjs) with the real-model build. Output is deterministic.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  addContractClips,
  addContractMaterials,
  addSkinnedMesh,
  createContractDocument,
  writeGlb,
} from './assembly/document.mjs'
import { eyeball, eyelid, highlights, plate, projectFaceUvs } from './assembly/features.mjs'
import { boneSegments, merge, skinByDistance, skinRigid } from './assembly/skinning.mjs'
import { eyesBaseColor, faceAtlas } from './assembly/textures.mjs'
import { PLACEHOLDER_CLIPS } from './placeholder-clips.mjs'
import { bodyParts, FACE_PATCH, faceShell, PLATES } from './placeholder/shapes.mjs'
import { bodyBaseColor, bodyNormal, bodyOrm } from './placeholder/textures.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const TIERS = /** @type {const} */ (['lite', 'full'])

/** Geometry density and texture edge (px) per tier; null drops the texture. */
const TIER_SETTINGS = {
  full: { detail: 0.75, body: 256, orm: 64, normal: 64, eyes: 256, face: 512 },
  lite: { detail: 0.5, body: 128, orm: 32, normal: null, eyes: 128, face: 512 },
}

const png = (data) => ({ data, mimeType: 'image/png' })

/** Pick the body tone per vertex (see textures.bodyBaseColor) from its normal. */
function shadeBody(geometry, belly) {
  const normal = geometry.attributes.normal
  const uv = geometry.attributes.uv
  for (let i = 0; i < normal.count; i++) {
    const nz = normal.getZ(i)
    const ny = normal.getY(i)
    const front = belly ? Math.min(1, Math.max(0, (nz * 0.9 - ny * 0.35 - 0.15) / 0.75)) : 0
    const dorsal = Math.min(1, Math.max(0, -nz * 0.5 + ny * 0.5 - 0.1)) * 0.8
    uv.setXY(i, 0.5, Math.min(0.98, Math.max(0.02, 0.5 + 0.5 * front - 0.35 * dorsal)))
  }
  return geometry
}

/**
 * Build one tier of the placeholder.
 * @param {{ contract: any, tier: 'lite' | 'full' }} options
 * @returns {Promise<Uint8Array>}
 */
export async function buildPlaceholder({ contract, tier }) {
  const settings = TIER_SETTINGS[tier]
  const ctx = createContractDocument({
    contract,
    extras: { kelorPlaceholder: true, contractVersion: contract.contractVersion },
  })
  const { jointOf, restOf } = ctx
  const segments = boneSegments(contract.skeleton.bones)
  const detail = settings.detail

  // Geometry ------------------------------------------------------------------
  const body = merge(
    bodyParts(detail).flatMap((part) =>
      part.geometries.map((g) =>
        skinByDistance(shadeBody(g, part.belly), part.bones, segments, jointOf),
      ),
    ),
  )
  const face = faceShell(detail)
  projectFaceUvs(face, FACE_PATCH, 1 / contract.expressions.grid[0])
  skinRigid(face, jointOf('head'))

  const eyes = merge(
    ['eye_L', 'eye_R'].map((b) => skinRigid(eyeball(restOf(b), detail), jointOf(b))),
  )
  const lidTilt = contract.gaze.blink.closedAngleDeg
  const eyelids = merge(
    ['eyelid_L', 'eyelid_R'].map((b) => skinRigid(eyelid(restOf(b), lidTilt, detail), jointOf(b))),
  )
  const catchlights = merge(
    ['eye_L', 'eye_R']
      .flatMap((b) => highlights(restOf(b), detail))
      .map((g) => skinRigid(g, jointOf('head'))),
  )
  const plates = merge(PLATES.map((p) => skinRigid(plate(p), jointOf(p.bone))))

  // Materials, meshes and clips -------------------------------------------------
  const { colors } = contract
  const materials = addContractMaterials(ctx, {
    bodyOrm: png(bodyOrm(settings.orm)),
    bodyBaseColor: png(bodyBaseColor(colors, settings.body)),
    bodyNormal: settings.normal ? png(bodyNormal(settings.normal)) : undefined,
    faceAtlas: png(faceAtlas(colors, contract.expressions, settings.face, { patch: FACE_PATCH })),
    eyesBaseColor: png(eyesBaseColor(colors, settings.eyes)),
  })
  addSkinnedMesh(ctx, 'body', body, materials.body)
  addSkinnedMesh(ctx, 'face', face, materials.face)
  addSkinnedMesh(ctx, 'eyes', eyes, materials.eyes)
  addSkinnedMesh(ctx, 'eyelids', eyelids, materials.body)
  addSkinnedMesh(ctx, 'eye_highlights', catchlights, materials.highlight)
  addSkinnedMesh(ctx, 'plates', plates, materials.plates)
  addContractClips(ctx, PLACEHOLDER_CLIPS)

  return writeGlb(ctx.doc)
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export async function main(argv, io = {}) {
  const log = io.log ?? ((s) => console.log(s))
  const check = argv.includes('--check')
  const contract = JSON.parse(readFileSync(resolve(REPO_ROOT, 'character.json'), 'utf8'))
  // Since phase 3 the real model owns public/models; the placeholder writes to build/ unless asked.
  const target = (tier) =>
    argv.includes('--public')
      ? contract.files[tier]
      : `build/placeholder/${contract.files[tier].split('/').pop()}`
  let stale = 0
  for (const tier of TIERS) {
    const path = resolve(REPO_ROOT, target(tier))
    const bytes = await buildPlaceholder({ contract, tier })
    const kb = Math.round(bytes.byteLength / 1024)
    if (check) {
      const same = existsSync(path) && Buffer.compare(readFileSync(path), Buffer.from(bytes)) === 0
      log(`${same ? 'OK   ' : 'STALE'} ${target(tier)} (${kb} kB)`)
      if (!same) stale += 1
    } else {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, bytes)
      log(`wrote ${target(tier)} (${kb} kB)`)
    }
  }
  if (stale)
    log(
      'Placeholder models are out of date: run "corepack pnpm build:placeholder" and commit them.',
    )
  return stale ? 1 : 0
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  process.exitCode = await main(process.argv.slice(2))
}
