import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import raw from '../../../character.json' with { type: 'json' }
import { validateGlb } from '../validate.mjs'
import { compressionIO, compressModel, ktxArgs } from './compress.mjs'

const contract = raw as unknown as {
  files: { full: string; lite: string }
  skeleton: { bones: unknown[] }
  meshes: { required: unknown[] }
}

/**
 * Compression runs on the shipped models, so it has to leave the contract
 * shape untouched: one skin for the whole character, every mesh still skinned,
 * every clip still there, and the validator still happy.
 */
describe('compressModel', () => {
  for (const tier of ['lite', 'full'] as const) {
    it(`keeps the contract shape of the ${tier} model and stays valid`, async () => {
      const source = new Uint8Array(readFileSync(contract.files[tier]))
      const { bytes, report } = await compressModel({ bytes: source, level: 'high' })
      // The committed models are compressed already: a second pass may shift a few bytes, not bloat.
      expect(bytes.byteLength).toBeLessThanOrEqual(source.byteLength * 1.01)
      expect(report.afterKB).toBeGreaterThan(0)

      const io = await compressionIO()
      const doc = await io.readBinary(bytes)
      const root = doc.getRoot()

      // One skin, not one per mesh: a scene-wide quantisation volume is what
      // keeps every mesh sharing a single skeleton upload per frame.
      expect(root.listSkins()).toHaveLength(1)
      expect(root.listSkins()[0]!.listJoints()).toHaveLength(contract.skeleton.bones.length)

      const meshes = root.listMeshes()
      expect(meshes).toHaveLength(contract.meshes.required.length)
      for (const mesh of meshes) {
        for (const prim of mesh.listPrimitives()) {
          expect(prim.getAttribute('JOINTS_0'), `${mesh.getName()} lost its joints`).toBeTruthy()
        }
      }
      expect(root.listAnimations()).toHaveLength(6)

      const extensions = root
        .listExtensionsUsed()
        .map((e: { extensionName: string }) => e.extensionName)
      expect(extensions).toContain('EXT_meshopt_compression')
      expect(extensions).toContain('KHR_mesh_quantization')

      const report2 = validateGlb({ bytes, contract, tier })
      expect(report2.results.filter((r) => r.status !== 'pass')).toEqual([])
      expect(report2.ok).toBe(true)
    })
  }
})

describe('ktxArgs', () => {
  it('encodes colour maps as ETC1S in sRGB and detail maps as UASTC in linear', () => {
    const colour = ktxArgs({ encode: 'basis-lz', srgb: true }, 'in.jpg', 'out.ktx2')
    expect(colour).toContain('R8G8B8A8_SRGB')
    expect(colour).toContain('basis-lz')
    expect(colour).not.toContain('--assign-tf')
    expect(colour.slice(-2)).toEqual(['in.jpg', 'out.ktx2'])

    const data = ktxArgs({ encode: 'uastc', srgb: false }, 'n.jpg', 'n.ktx2')
    expect(data).toContain('R8G8B8A8_UNORM')
    expect(data.join(' ')).toContain('--assign-tf linear')
    expect(data.join(' ')).toContain('--encode uastc')
    expect(data.join(' ')).toContain('--uastc-rdo --uastc-rdo-l 4 --uastc-rdo-m')
    expect(data).not.toContain('--uastc-rdo-d')

    // The scales' normal map: harder RDO and a bigger dictionary.
    const normal = ktxArgs(
      { encode: 'uastc', srgb: false, rdoLambda: 8, rdoDictionary: 32768 },
      'n.png',
      'n.ktx2',
    )
    expect(normal.join(' ')).toContain(
      '--uastc-rdo-l 8 --uastc-rdo-m --uastc-rdo-d 32768 --zstd 18',
    )

    // Mipmaps must live in the file: a compressed texture cannot build them later.
    for (const args of [colour, data]) expect(args).toContain('--generate-mipmap')
  })
})
