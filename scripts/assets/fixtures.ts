/**
 * Synthetic GLB builders for the validator tests.
 *
 * `buildModel` produces a GLB that satisfies character.json for a tier. Tests
 * then break one rule at a time through `mutate`. Accessors carry counts and
 * bounds but no bufferView: glTF defines such accessors as zero-filled, and
 * the validator only reads metadata.
 */
import contractJson from '../../character.json'

// The fixtures only need the contract's shape, not its literal types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Gltf = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const contract = contractJson as any

export type Tier = 'lite' | 'full'

const FLOAT = 5126
const UNSIGNED_INT = 5125
const UNSIGNED_BYTE = 5121

const pad4 = (bytes: Uint8Array, fill: number) => {
  const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4).fill(fill)
  padded.set(bytes)
  return padded
}

/** Encode glTF JSON and an optional BIN chunk as a GLB container. */
export function encodeGlb(json: Gltf, bin?: Uint8Array): Uint8Array {
  const jsonChunk = pad4(new TextEncoder().encode(JSON.stringify(json)), 0x20)
  const binChunk = bin && bin.length ? pad4(bin, 0) : null
  const total = 12 + 8 + jsonChunk.length + (binChunk ? 8 + binChunk.length : 0)
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonChunk.length, true)
  view.setUint32(16, 0x4e4f534a, true)
  out.set(jsonChunk, 20)
  if (binChunk) {
    const at = 20 + jsonChunk.length
    view.setUint32(at, binChunk.length, true)
    view.setUint32(at + 4, 0x004e4942, true)
    out.set(binChunk, at + 8)
  }
  return out
}

const asciiBytes = (text: string) => [...text].map((ch) => ch.charCodeAt(0))

/** PNG signature plus an IHDR chunk: enough for a size read. */
export function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33)
  const view = new DataView(bytes.buffer)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  view.setUint32(8, 13)
  bytes.set(asciiBytes('IHDR'), 12)
  view.setUint32(16, width)
  view.setUint32(20, height)
  bytes[24] = 8 // bit depth
  bytes[25] = 6 // RGBA
  return bytes
}

/** KTX2 identifier and the fixed header fields up to pixelHeight. */
export function ktx2Header(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(80)
  const view = new DataView(bytes.buffer)
  bytes.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  view.setUint32(20, width, true)
  view.setUint32(24, height, true)
  return bytes
}

/** SOI, an APP0 segment, then a baseline SOF0 segment. */
export function jpegHeader(width: number, height: number): Uint8Array {
  // prettier-ignore
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, ...asciiBytes('JFIF'), 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ])
}

/** Extended WebP (VP8X) header with the canvas size. */
export function webpVp8xHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30)
  bytes.set(asciiBytes('RIFF'), 0)
  bytes.set(asciiBytes('WEBPVP8X'), 8)
  bytes[16] = 10
  const w = width - 1
  const h = height - 1
  bytes.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24)
  bytes.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27)
  return bytes
}

/** Lossy WebP (VP8) header: frame tag, start code, 14-bit sizes. */
export function webpVp8Header(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(30)
  const view = new DataView(bytes.buffer)
  bytes.set(asciiBytes('RIFF'), 0)
  bytes.set(asciiBytes('WEBPVP8 '), 8)
  bytes.set([0x9d, 0x01, 0x2a], 23)
  view.setUint16(26, width, true)
  view.setUint16(28, height, true)
  return bytes
}

/** Lossless WebP (VP8L) header: signature byte then packed 14-bit sizes. */
export function webpVp8lHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(25)
  const view = new DataView(bytes.buffer)
  bytes.set(asciiBytes('RIFF'), 0)
  bytes.set(asciiBytes('WEBPVP8L'), 8)
  bytes[20] = 0x2f
  view.setUint32(21, ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14), true)
  return bytes
}

export interface ModelContext {
  gltf: Gltf
  bone: (name: string) => number
  addAccessor: (accessor: Gltf) => number
  addBufferView: (bytes: Uint8Array) => number
}

export interface ModelOptions {
  tier?: Tier
  /** Break one rule by editing the glTF JSON before encoding. */
  mutate?: (ctx: ModelContext) => void
  /** Extra unreferenced BIN bytes, to push the file over the size budget. */
  padBytes?: number
}

/** Build a GLB that satisfies the contract for the given tier. */
export function buildModel({ tier = 'full', mutate, padBytes = 0 }: ModelOptions = {}): Uint8Array {
  const gltf: Gltf = {
    asset: { version: '2.0', generator: 'kelor-fixture' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
    images: [],
    textures: [],
    skins: [],
    animations: [],
  }
  const binParts: Uint8Array[] = []
  let binLength = 0

  const addAccessor = (accessor: Gltf) => gltf.accessors.push(accessor) - 1
  const addBufferView = (bytes: Uint8Array) => {
    const padded = pad4(bytes, 0)
    const index =
      gltf.bufferViews.push({ buffer: 0, byteOffset: binLength, byteLength: bytes.length }) - 1
    binParts.push(padded)
    binLength += padded.length
    return index
  }

  // Armature and bones, mirroring the contract hierarchy.
  const armature = gltf.nodes.push({ name: 'Armature', children: [] }) - 1
  gltf.scenes[0].nodes.push(armature)
  const boneIndex = new Map<string, number>()
  for (const bone of contract.skeleton.bones) {
    boneIndex.set(bone.name, gltf.nodes.push({ name: bone.name, translation: bone.restHead }) - 1)
  }
  for (const bone of contract.skeleton.bones) {
    const parent = bone.parent === null ? armature : boneIndex.get(bone.parent)!
    ;(gltf.nodes[parent].children ??= []).push(boneIndex.get(bone.name)!)
  }
  gltf.skins.push({ joints: [...boneIndex.values()] })
  const bone = (name: string) => {
    const index = boneIndex.get(name)
    if (index === undefined) throw new Error(`Unknown bone ${name}`)
    return index
  }

  // Materials and one skinned, single-primitive mesh per required mesh.
  const materialIndex = new Map<string, number>()
  for (const material of contract.materials.required) {
    materialIndex.set(material.name, gltf.materials.push({ name: material.name }) - 1)
  }
  const bodyTriangles = Math.floor(contract.budgets[tier].maxTriangles / 2)
  for (const required of contract.meshes.required) {
    const isBody = required.name === 'body'
    const triangles = isBody ? bodyTriangles : 200
    const vertices = Math.ceil(triangles * 0.6)
    const bounds = isBody
      ? { min: [-0.4, 0, -0.55], max: [0.4, contract.meta.heightM, 0.3] }
      : { min: [-0.1, 0.9, 0.1], max: [0.1, 1.05, 0.25] }
    const position = addAccessor({ componentType: FLOAT, type: 'VEC3', count: vertices, ...bounds })
    const joints = addAccessor({ componentType: UNSIGNED_BYTE, type: 'VEC4', count: vertices })
    const weights = addAccessor({ componentType: FLOAT, type: 'VEC4', count: vertices })
    const indices = addAccessor({
      componentType: UNSIGNED_INT,
      type: 'SCALAR',
      count: triangles * 3,
    })
    const mesh =
      gltf.meshes.push({
        name: required.name,
        primitives: [
          {
            attributes: { POSITION: position, JOINTS_0: joints, WEIGHTS_0: weights },
            indices,
            material: materialIndex.get(required.material),
          },
        ],
      }) - 1
    const node = gltf.nodes.push({ name: required.name, mesh, skin: 0 }) - 1
    gltf.nodes[armature].children.push(node)
  }

  // Embedded images at the contract size for this tier.
  for (const texture of contract.textures.items) {
    const size = texture.size[tier]
    if (size === null) continue
    const bufferView = addBufferView(pngHeader(size, size))
    const source = gltf.images.push({ name: texture.name, mimeType: 'image/png', bufferView }) - 1
    gltf.textures.push({ source })
  }

  // One rotation channel on the hips per required clip.
  for (const clip of contract.clips.required) {
    const input = addAccessor({
      componentType: FLOAT,
      type: 'SCALAR',
      count: 2,
      min: [0],
      max: [clip.durationS],
    })
    const output = addAccessor({ componentType: FLOAT, type: 'VEC4', count: 2 })
    gltf.animations.push({
      name: clip.name,
      samplers: [{ input, output, interpolation: 'LINEAR' }],
      channels: [{ sampler: 0, target: { node: bone('hips'), path: 'rotation' } }],
    })
  }

  mutate?.({ gltf, bone, addAccessor, addBufferView })

  if (padBytes > 0) addBufferView(new Uint8Array(padBytes))
  const bin = new Uint8Array(binLength)
  let offset = 0
  for (const part of binParts) {
    bin.set(part, offset)
    offset += part.length
  }
  if (binLength > 0) gltf.buffers = [{ byteLength: binLength }]

  // glTF forbids empty arrays: drop them, like a real exporter would.
  for (const key of Object.keys(gltf)) {
    if (Array.isArray(gltf[key]) && gltf[key].length === 0) delete gltf[key]
  }
  return encodeGlb(gltf, bin)
}
