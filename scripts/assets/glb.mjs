/**
 * Minimal, dependency-free readers for the GLB container and for the headers
 * of the image formats a glTF can embed (PNG, JPEG, WebP, KTX2).
 *
 * Only metadata is read: the JSON chunk, the BIN chunk as a byte view, and
 * image dimensions. Vertex data is never decoded, so Meshopt-compressed
 * files are handled without a decoder.
 */

const GLB_MAGIC = 0x46546c67 // 'glTF'
const CHUNK_JSON = 0x4e4f534a // 'JSON'
const CHUNK_BIN = 0x004e4942 // 'BIN\0'

/**
 * Parse a GLB (binary glTF 2.0) buffer.
 * @param {Uint8Array} bytes
 * @returns {{ json: any, bin: Uint8Array | null, version: number }}
 */
export function parseGlb(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected a Uint8Array')
  if (bytes.byteLength < 20) throw new Error('File is too small to be a GLB')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('Not a GLB file: missing the "glTF" magic header (is it a .gltf text file?)')
  }
  const version = view.getUint32(4, true)
  if (version !== 2) throw new Error(`Unsupported GLB container version ${version}, expected 2`)
  const declaredLength = view.getUint32(8, true)
  if (declaredLength > bytes.byteLength) {
    throw new Error(
      `Truncated GLB: header declares ${declaredLength} bytes, file has ${bytes.byteLength}`,
    )
  }

  let offset = 12
  let json = null
  let bin = null
  while (offset + 8 <= declaredLength) {
    const chunkLength = view.getUint32(offset, true)
    const chunkType = view.getUint32(offset + 4, true)
    const start = offset + 8
    const end = start + chunkLength
    if (end > declaredLength) throw new Error('Corrupt GLB: a chunk runs past the end of the file')

    if (chunkType === CHUNK_JSON && json === null) {
      const text = new TextDecoder('utf-8').decode(bytes.subarray(start, end))
      try {
        json = JSON.parse(text)
      } catch (error) {
        throw new Error(`Corrupt GLB: the JSON chunk is not valid JSON (${error.message})`)
      }
    } else if (chunkType === CHUNK_BIN && bin === null) {
      bin = bytes.subarray(start, end)
    }
    offset = end
  }

  if (json === null) throw new Error('Corrupt GLB: no JSON chunk found')
  return { json, bin, version }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const KTX2_IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]

const startsWith = (bytes, signature, at = 0) =>
  bytes.length >= at + signature.length && signature.every((b, i) => bytes[at + i] === b)

const ascii = (bytes, start, length) =>
  String.fromCharCode(...bytes.subarray(start, start + length))

/**
 * Read the pixel dimensions of an embedded image from its header.
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number, format: 'png' | 'jpeg' | 'webp' | 'ktx2' } | null}
 */
export function readImageSize(bytes) {
  if (!bytes || bytes.length < 12) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (startsWith(bytes, PNG_SIGNATURE) && bytes.length >= 24 && ascii(bytes, 12, 4) === 'IHDR') {
    return { format: 'png', width: view.getUint32(16, false), height: view.getUint32(20, false) }
  }

  if (startsWith(bytes, KTX2_IDENTIFIER) && bytes.length >= 28) {
    return { format: 'ktx2', width: view.getUint32(20, true), height: view.getUint32(24, true) }
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) return readJpegSize(bytes, view)

  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP')
    return readWebpSize(bytes, view)

  return null
}

/** Walk JPEG markers until a start-of-frame segment. */
function readJpegSize(bytes, view) {
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]
    // Standalone markers without a length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    const length = view.getUint16(offset + 2, false)
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isStartOfFrame) {
      return {
        format: 'jpeg',
        height: view.getUint16(offset + 5, false),
        width: view.getUint16(offset + 7, false),
      }
    }
    offset += 2 + length
  }
  return null
}

/** WebP has three layouts: lossy (VP8), lossless (VP8L) and extended (VP8X). */
function readWebpSize(bytes, view) {
  const chunk = ascii(bytes, 12, 4)
  if (chunk === 'VP8X' && bytes.length >= 30) {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16))
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
    return { format: 'webp', width, height }
  }
  if (chunk === 'VP8 ' && bytes.length >= 30) {
    return {
      format: 'webp',
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    }
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = view.getUint32(21, true)
    return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  return null
}

/**
 * Bytes of a glTF image, from the BIN chunk, a data URI or an external file.
 * @param {any} gltf parsed glTF JSON
 * @param {Uint8Array | null} bin
 * @param {any} image entry of gltf.images
 * @param {(uri: string) => Uint8Array | null} readExternal loader for external URIs
 * @returns {{ bytes: Uint8Array | null, source: string }}
 */
export function getImageBytes(gltf, bin, image, readExternal) {
  if (image.bufferView !== undefined) {
    const bufferView = gltf.bufferViews?.[image.bufferView]
    if (!bufferView || !bin || bufferView.buffer !== 0) return { bytes: null, source: 'bufferView' }
    const start = bufferView.byteOffset ?? 0
    return { bytes: bin.subarray(start, start + bufferView.byteLength), source: 'bufferView' }
  }
  if (typeof image.uri === 'string') {
    const dataUri = /^data:[^;,]*;base64,(.*)$/s.exec(image.uri)
    if (dataUri)
      return { bytes: new Uint8Array(Buffer.from(dataUri[1], 'base64')), source: 'data URI' }
    return {
      bytes: readExternal(decodeURIComponent(image.uri)),
      source: `external file ${image.uri}`,
    }
  }
  return { bytes: null, source: 'none' }
}
