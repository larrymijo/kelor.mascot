/**
 * Compress an assembled contract GLB. Geometry goes through Meshopt, which
 * quantises the attributes and stores them with EXT_meshopt_compression; the
 * decoder ships inside three-stdlib, so the runtime needs no network for it.
 *
 * Textures are left alone here. The lite tier already carries WebP written by
 * Blender, and the full tier is converted to KTX2 by the caller, which needs
 * the KTX-Software binary that only CI has.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions'
import { dedup, meshopt, prune } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'

/**
 * Shared reader/writer. Without the encoder the writer cannot emit Meshopt
 * buffers, and without the decoder nothing can read the result back.
 */
export async function compressionIO() {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready])
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
}

/**
 * How each contract texture is encoded. Colour maps are sRGB and tolerate the
 * cheaper ETC1S; the normal map and the expression atlas carry detail that
 * blocks would smear, so they take UASTC, and both are linear data rather than
 * colour. Mipmaps go in the file because a compressed texture cannot build
 * them at runtime.
 * @type {Record<string, { encode: 'basis-lz' | 'uastc', srgb: boolean }>}
 */
const KTX_PROFILES = {
  body_basecolor: { encode: 'basis-lz', srgb: true },
  eyes_basecolor: { encode: 'basis-lz', srgb: true },
  body_orm: { encode: 'basis-lz', srgb: false },
  body_normal: { encode: 'uastc', srgb: false },
  face_atlas: { encode: 'uastc', srgb: true },
}

const EXTENSION_OF = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/** Argument list for one texture, in KTX-Software 4.4.2 spelling (later releases rename the UASTC codec). */
export function ktxArgs({ encode, srgb }, input, output) {
  const args = ['create', '--format', srgb ? 'R8G8B8A8_SRGB' : 'R8G8B8A8_UNORM']
  if (!srgb) args.push('--assign-tf', 'linear')
  args.push('--generate-mipmap')
  if (encode === 'uastc') {
    // RDO trades a little precision for far better zstd ratios (run 13 saw a
    // plain UASTC normal map grow from 263 to 914 kB); -m keeps it deterministic
    // so rebuilding the same model does not churn the committed file.
    args.push('--encode', 'uastc', '--uastc-quality', '2')
    args.push('--uastc-rdo', '--uastc-rdo-l', '4', '--uastc-rdo-m', '--zstd', '18')
  } else {
    args.push('--encode', 'basis-lz', '--clevel', '4', '--qlevel', '200')
  }
  return [...args, input, output]
}

/**
 * Convert every texture to KTX2 with the KTX-Software CLI. Only CI has the
 * binary, so this throws a pointed error anywhere else.
 * @param {{ bytes: Uint8Array, ktxBin?: string, log?: (line: string) => void }} input
 */
export async function compressTextures({
  bytes,
  ktxBin = process.env.KTX ?? 'ktx',
  log = () => {},
}) {
  const io = await compressionIO()
  const doc = await io.readBinary(bytes)
  const textures = doc.getRoot().listTextures()
  const dir = mkdtempSync(join(tmpdir(), 'kelo-ktx-'))
  const converted = []
  try {
    for (const texture of textures) {
      const name = texture.getName()
      const profile = KTX_PROFILES[name]
      if (!profile) throw new Error(`No KTX profile for texture "${name}"`)
      const extension = EXTENSION_OF[texture.getMimeType()]
      if (!extension) throw new Error(`Cannot convert ${name} (${texture.getMimeType()}) to KTX2`)

      const input = join(dir, `${name}.${extension}`)
      const output = join(dir, `${name}.ktx2`)
      writeFileSync(input, texture.getImage())
      const args = ktxArgs(profile, input, output)
      log(`$ ${ktxBin} ${args.join(' ')}`)
      try {
        execFileSync(ktxBin, args, { stdio: 'pipe' })
      } catch (error) {
        const detail = (error.stderr?.toString().trim() || error.message).replace(/\.+$/, '')
        throw new Error(`ktx failed on ${name}: ${detail}. Set KTX to the KTX-Software binary.`)
      }
      const encoded = new Uint8Array(readFileSync(output))
      converted.push({
        name,
        encode: profile.encode,
        beforeKB: Math.round(texture.getImage().byteLength / 1024),
        afterKB: Math.round(encoded.byteLength / 1024),
      })
      texture.setImage(encoded).setMimeType('image/ktx2')
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  // Required: there is no uncompressed fallback in the file.
  doc.createExtension(KHRTextureBasisu).setRequired(true)
  return { bytes: await io.writeBinary(doc), report: { textures: converted } }
}

/**
 * @param {{ bytes: Uint8Array, level?: 'medium' | 'high' }} input
 * @returns {Promise<{ bytes: Uint8Array, report: { beforeKB: number, afterKB: number, savedPercent: number } }>}
 */
export async function compressModel({ bytes, level = 'high' }) {
  const io = await compressionIO()
  const doc = await io.readBinary(bytes)
  // A scene-wide quantisation volume keeps one dequantisation transform for
  // every mesh, so the contract's single skin is not split one-per-mesh.
  await doc.transform(
    // The contract names every material and image, so differently named
    // duplicates must survive: the placeholder's flat ORM and normal maps have
    // identical pixels, and dedup ignores names unless told otherwise.
    dedup({ keepUniqueNames: true }),
    // Solid-colour maps would otherwise be folded into material factors, and
    // the contract expects every named map to exist.
    prune({ keepSolidTextures: true }),
    meshopt({ encoder: MeshoptEncoder, level, quantizationVolume: 'scene' }),
  )
  const out = await io.writeBinary(doc)
  const beforeKB = Math.round(bytes.byteLength / 1024)
  const afterKB = Math.round(out.byteLength / 1024)
  return {
    bytes: out,
    report: {
      beforeKB,
      afterKB,
      savedPercent: Math.round((1 - out.byteLength / bytes.byteLength) * 100),
    },
  }
}
