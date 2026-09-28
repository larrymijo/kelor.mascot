import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import raw from '../../../character.json' with { type: 'json' }
import { validateGlb } from '../validate.mjs'
import { compressionIO, compressModel } from './compress.mjs'

const contract = raw as unknown as {
  files: { full: string; lite: string }
  skeleton: { bones: unknown[] }
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
      expect(bytes.byteLength).toBeLessThanOrEqual(source.byteLength)
      expect(report.afterKB).toBeGreaterThan(0)

      const io = await compressionIO()
      const doc = await io.readBinary(bytes)
      const root = doc.getRoot()

      // One skin, not one per mesh: a scene-wide quantisation volume is what
      // keeps the six meshes sharing a single skeleton upload per frame.
      expect(root.listSkins()).toHaveLength(1)
      expect(root.listSkins()[0]!.listJoints()).toHaveLength(contract.skeleton.bones.length)

      const meshes = root.listMeshes()
      expect(meshes).toHaveLength(6)
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
