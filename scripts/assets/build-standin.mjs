#!/usr/bin/env node
/**
 * Build a stand-in for an image-to-3D output, so the Blender pipeline can be
 * developed and tested before the owner's model exists.
 *
 *   node scripts/assets/build-standin.mjs    writes assets/source/standin-raw.glb
 *
 * It mimics what image-to-3D services return: one dense, unrigged, textured
 * mesh made of overlapping, unwelded shells, with a blank face and no plates,
 * in an arbitrary scale, position and facing, arms in an A-pose. Deterministic output.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Document, NodeIO } from '@gltf-transform/core'
import * as THREE from 'three'
import { merge } from './assembly/skinning.mjs'
import { bodyParts } from './placeholder/shapes.mjs'
import { bodyBaseColor } from './placeholder/textures.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const STANDIN_PATH = 'assets/source/standin-raw.glb'

/**
 * The transform a service might apply: facing -Z, 0.85 scale, off-centre.
 * The pipeline's fit.json declares the facing; it must detect the rest.
 */
export const STANDIN_TRANSFORM = { rotateYDeg: 180, scale: 0.85, offset: [0.1, 0.05, -0.2] }

/** Same tone logic as the placeholder, baked into UVs of a dense mesh. */
function shade(geometry, belly) {
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

/** Arms swing out from the shoulder by this much: the A-pose the concept brief asks for. */
export const STANDIN_ARM_SPREAD_DEG = 25
const SHOULDER = [0.16, 0.585, 0.06]

function aPose(geometry, side) {
  const sign = side === 'L' ? 1 : -1
  const [x, y, z] = SHOULDER
  geometry.translate(-sign * x, -y, -z)
  geometry.rotateZ(THREE.MathUtils.degToRad(sign * STANDIN_ARM_SPREAD_DEG))
  geometry.translate(sign * x, y, z)
  return geometry
}

export async function buildStandin(contract) {
  const body = merge(
    bodyParts(2.2).flatMap((part) =>
      part.geometries.map((g) => {
        const arm = /^(arm|hand)_([LR])$/.exec(part.name)
        return shade(arm ? aPose(g, arm[2]) : g, part.belly)
      }),
    ),
  )
  // merge() keeps skin attributes when present; the stand-in has none.
  const { rotateYDeg, scale, offset } = STANDIN_TRANSFORM
  body.rotateY(THREE.MathUtils.degToRad(rotateYDeg))
  body.scale(scale, scale, scale)
  body.translate(...offset)

  const doc = new Document()
  doc.getRoot().setExtras({ kelorStandin: true })
  const buffer = doc.createBuffer()
  const accessor = (array, type) =>
    doc.createAccessor().setArray(array).setType(type).setBuffer(buffer)
  const texture = doc
    .createTexture('standin_basecolor')
    .setImage(bodyBaseColor(contract.colors, 512))
    .setMimeType('image/png')
  const material = doc
    .createMaterial('standin')
    .setBaseColorTexture(texture)
    .setRoughnessFactor(0.6)
    .setMetallicFactor(0)
  const a = body.attributes
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', accessor(Float32Array.from(a.position.array), 'VEC3'))
    .setAttribute('NORMAL', accessor(Float32Array.from(a.normal.array), 'VEC3'))
    .setAttribute('TEXCOORD_0', accessor(Float32Array.from(a.uv.array), 'VEC2'))
    .setIndices(accessor(Uint32Array.from(body.index.array), 'SCALAR'))
    .setMaterial(material)
  const mesh = doc.createMesh('standin').addPrimitive(primitive)
  doc.createScene('Scene').addChild(doc.createNode('standin').setMesh(mesh))
  return new NodeIO().writeBinary(doc)
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (invokedDirectly) {
  const { readFileSync } = await import('node:fs')
  const contract = JSON.parse(readFileSync(resolve(REPO_ROOT, 'character.json'), 'utf8'))
  const bytes = await buildStandin(contract)
  const path = resolve(REPO_ROOT, STANDIN_PATH)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, bytes)
  console.log(`wrote ${STANDIN_PATH} (${Math.round(bytes.byteLength / 1024)} kB)`)
}
