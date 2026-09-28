/**
 * Compress an assembled contract GLB. Geometry goes through Meshopt, which
 * quantises the attributes and stores them with EXT_meshopt_compression; the
 * decoder ships inside three-stdlib, so the runtime needs no network for it.
 *
 * Textures are left alone here. The lite tier already carries WebP written by
 * Blender, and the full tier is converted to KTX2 by the caller, which needs
 * the KTX-Software binary that only CI has.
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
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
 * @param {{ bytes: Uint8Array, level?: 'medium' | 'high' }} input
 * @returns {Promise<{ bytes: Uint8Array, report: { beforeKB: number, afterKB: number, savedPercent: number } }>}
 */
export async function compressModel({ bytes, level = 'high' }) {
  const io = await compressionIO()
  const doc = await io.readBinary(bytes)
  // A scene-wide quantisation volume keeps one dequantisation transform for
  // every mesh, so the contract's single skin is not split one-per-mesh.
  await doc.transform(
    dedup(),
    prune(),
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
