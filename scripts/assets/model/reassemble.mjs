#!/usr/bin/env node
/**
 * Reassemble the committed lite model with the current assembly code, with
 * no Blender: the body mesh (with its weights) and its textures come out of
 * the lite model as committed at HEAD (never the working copy, which a
 * --public preview overwrites), the rig from the local Node steps. For tuning procedural
 * parts (the jaw, the eyes, the plates) locally before spending a CI run.
 *
 *   node scripts/assets/model/run.mjs --until rig      once, for build/model/rig.json
 *   node scripts/assets/model/reassemble.mjs [--public] [--raw]
 *
 * Writes build/model/reassembled/mascot.lite.glb, or over the committed lite
 * model with --public, for a local preview (restore it with git checkout).
 * --raw also writes the uncompressed assembly next to it, for inspection.
 * Lite only: the full tier's KTX2 textures need the KTX CLI of CI.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { dequantize } from '@gltf-transform/functions'
import * as THREE from 'three'
import { buildModel } from '../build-model.mjs'
import { compressionIO, compressModel } from './compress.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'))

/**
 * The committed body as Blender would hand it over: one skinned mesh in
 * metres. Meshopt quantisation stores skinned positions in a unit volume and
 * folds the volume's transform into the inverse bind matrices, so the first
 * joint's world matrix times its inverse bind matrix gives that transform back.
 */
export async function extractBody(bytes) {
  const io = await compressionIO()
  const doc = await io.readBinary(bytes)
  await doc.transform(dequantize())
  const root = doc.getRoot()
  const node = root.listNodes().find((n) => n.getName() === 'body' && n.getMesh())
  if (!node) throw new Error('No body mesh in the committed model')
  const primitive = node.getMesh().listPrimitives()[0]
  const material = primitive.getMaterial()
  const image = (texture) => ({ data: texture.getImage(), mimeType: texture.getMimeType() })
  const textures = {
    baseColor: image(material.getBaseColorTexture()),
    orm: image(material.getMetallicRoughnessTexture()),
  }

  const skin = node.getSkin()
  const joint = skin.listJoints()[0]
  const inverseBind = new THREE.Matrix4().fromArray(skin.getInverseBindMatrices().getElement(0, []))
  const volume = new THREE.Matrix4().fromArray(joint.getWorldMatrix()).multiply(inverseBind)
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(volume)
  const position = primitive.getAttribute('POSITION')
  const normal = primitive.getAttribute('NORMAL')
  const p = new THREE.Vector3()
  for (let i = 0; i < position.getCount(); i++) {
    position.setElement(i, p.fromArray(position.getElement(i, [])).applyMatrix4(volume).toArray())
    normal.setElement(
      i,
      p.fromArray(normal.getElement(i, [])).applyMatrix3(normalMatrix).normalize().toArray(),
    )
  }

  // Only the body, with no textures or compression, for the plain reader.
  for (const other of root.listNodes()) if (other.getMesh() && other !== node) other.setMesh(null)
  for (const texture of root.listTextures()) texture.dispose()
  for (const extension of root.listExtensionsUsed()) extension.dispose()
  const body = await new NodeIO().writeBinary(doc)
  return { body, textures, height: bounds(position).max.y }
}

function bounds(accessor) {
  const box = new THREE.Box3()
  const p = new THREE.Vector3()
  for (let i = 0; i < accessor.getCount(); i++)
    box.expandByPoint(p.fromArray(accessor.getElement(i, [])))
  return box
}

async function main(argv) {
  const contract = read('character.json')
  const fit = read('assets/model/fit.json')
  const rig = read('build/model/rig.json')
  if (!rig.bones.some((b) => b.role === 'jaw'))
    throw new Error(
      'build/model/rig.json predates the jaw: run `node scripts/assets/model/run.mjs --until rig`',
    )

  const committed = execFileSync('git', ['show', `HEAD:${contract.files.lite}`], {
    cwd: ROOT,
    maxBuffer: 64 * 1024 * 1024,
  })
  const { body, textures, height } = await extractBody(new Uint8Array(committed))
  if (Math.abs(height - contract.meta.heightM) > 0.05)
    throw new Error(
      `The extracted body is ${height.toFixed(3)} m tall, not ${contract.meta.heightM} m`,
    )

  const { bytes: assembled, report } = await buildModel({
    contract,
    fit,
    tier: 'lite',
    body,
    textures,
    rig,
  })
  if (argv.includes('--raw')) {
    mkdirSync(join(ROOT, 'build', 'model', 'reassembled'), { recursive: true })
    writeFileSync(join(ROOT, 'build', 'model', 'reassembled', 'assembled.lite.glb'), assembled)
  }
  const { bytes } = await compressModel({ bytes: assembled })
  const out = argv.includes('--public')
    ? join(ROOT, contract.files.lite)
    : join(ROOT, 'build', 'model', 'reassembled', 'mascot.lite.glb')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, bytes)
  console.log(`${out}: ${Math.round(bytes.byteLength / 1024)} kB, mouth at ${report.mouthY}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
