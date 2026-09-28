/**
 * Normalise an image-to-3D source into contract space: +Y up, facing +Z,
 * scaled to meta.heightM, origin between the feet. Node transforms are baked
 * into the vertices and every mesh node moves to the scene root, so Blender
 * and the landmark analysis see plain geometry. Materials and textures stay.
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import * as THREE from 'three'

const AXES = {
  '+X': [1, 0, 0],
  '-X': [-1, 0, 0],
  '+Y': [0, 1, 0],
  '-Y': [0, -1, 0],
  '+Z': [0, 0, 1],
  '-Z': [0, 0, -1],
}

/** Rotation taking the source's forward/up axes to +Z/+Y. */
export function orientationMatrix(forward, up) {
  const f = new THREE.Vector3(...AXES[forward])
  const u = new THREE.Vector3(...AXES[up])
  const r = new THREE.Vector3().crossVectors(u, f)
  if (r.lengthSq() === 0) throw new Error(`forward ${forward} and up ${up} are parallel`)
  // Columns (right, up, forward) of the source basis; its transpose is the inverse rotation.
  return new THREE.Matrix4().makeBasis(r, u, f).transpose()
}

function meshNodes(doc) {
  const nodes = []
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]
  if (!scene) throw new Error('The source has no scene')
  scene.traverse((node) => {
    if (node.getMesh()) nodes.push(node)
  })
  if (nodes.length === 0) throw new Error('The source has no mesh')
  const seen = new Set()
  for (const node of nodes) {
    if (seen.has(node.getMesh())) throw new Error('Instanced meshes are not supported')
    seen.add(node.getMesh())
  }
  return { scene, nodes }
}

/**
 * @param {{ bytes: Uint8Array, fit: any, heightM: number }} input
 * @returns {Promise<{ bytes: Uint8Array, report: object }>}
 */
export async function normalizeSource({ bytes, fit, heightM }) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  let doc
  try {
    doc = await io.readBinary(bytes)
  } catch (error) {
    throw new Error(
      `Cannot read the source GLB (${error.message}). Export it without Draco or Meshopt compression.`,
    )
  }
  const { scene, nodes } = meshNodes(doc)
  const rotation = orientationMatrix(fit.orientation.forward, fit.orientation.up)
  const p = new THREE.Vector3()

  // Pass 1: bounds after world transform and rotation.
  const oriented = nodes.map((node) =>
    new THREE.Matrix4().multiplyMatrices(
      rotation,
      new THREE.Matrix4().fromArray(node.getWorldMatrix()),
    ),
  )
  const min = new THREE.Vector3(Infinity, Infinity, Infinity)
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
  let triangles = 0
  nodes.forEach((node, n) => {
    for (const prim of node.getMesh().listPrimitives()) {
      const position = prim.getAttribute('POSITION')
      triangles += (prim.getIndices()?.getCount() ?? position.getCount()) / 3
      for (let i = 0; i < position.getCount(); i++) {
        p.fromArray(position.getElement(i, [])).applyMatrix4(oriented[n])
        min.min(p)
        max.max(p)
      }
    }
  })
  const sourceHeight = max.y - min.y
  const scale = heightM / sourceHeight

  // Feet centre: the lowest 3 % of the height.
  let fx = 0
  let fz = 0
  let count = 0
  nodes.forEach((node, n) => {
    for (const prim of node.getMesh().listPrimitives()) {
      const position = prim.getAttribute('POSITION')
      for (let i = 0; i < position.getCount(); i++) {
        p.fromArray(position.getElement(i, [])).applyMatrix4(oriented[n])
        if (p.y < min.y + sourceHeight * 0.03) {
          fx += p.x
          fz += p.z
          count += 1
        }
      }
    }
  })
  fx /= count
  fz /= count

  // Pass 2: bake the final transform into new float accessors.
  const finalTransform = new THREE.Matrix4()
    .makeTranslation(-fx * scale, -min.y * scale, -fz * scale)
    .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer()
  const nrm = new THREE.Vector3()
  nodes.forEach((node, n) => {
    const matrix = new THREE.Matrix4().multiplyMatrices(finalTransform, oriented[n])
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix)
    for (const prim of node.getMesh().listPrimitives()) {
      const position = prim.getAttribute('POSITION')
      const positions = new Float32Array(position.getCount() * 3)
      for (let i = 0; i < position.getCount(); i++) {
        p.fromArray(position.getElement(i, []))
          .applyMatrix4(matrix)
          .toArray(positions, i * 3)
      }
      prim.setAttribute(
        'POSITION',
        doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer),
      )
      const normal = prim.getAttribute('NORMAL')
      if (normal) {
        const normals = new Float32Array(normal.getCount() * 3)
        for (let i = 0; i < normal.getCount(); i++) {
          nrm
            .fromArray(normal.getElement(i, []))
            .applyMatrix3(normalMatrix)
            .normalize()
            .toArray(normals, i * 3)
        }
        prim.setAttribute(
          'NORMAL',
          doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(buffer),
        )
      }
    }
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1])
    scene.addChild(node)
  })
  // Drop now-empty helper nodes so importers do not re-apply their transforms.
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getMesh() && node.listChildren().length === 0) node.dispose()
  }

  return {
    bytes: await io.writeBinary(doc),
    report: {
      sourceHeight: Math.round(sourceHeight * 1000) / 1000,
      scale: Math.round(scale * 10000) / 10000,
      feetCentre: [fx, fz].map((v) => Math.round(v * 1000) / 1000),
      triangles: Math.round(triangles),
      meshes: nodes.length,
    },
  }
}

/** Flat Float32Array of every vertex position in a normalised GLB. */
export async function readPositions(bytes) {
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(bytes)
  const chunks = []
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) chunks.push(prim.getAttribute('POSITION').getArray())
  }
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}
