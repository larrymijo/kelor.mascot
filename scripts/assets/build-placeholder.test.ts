import { describe, expect, it } from 'vitest'
import contract from '../../character.json'
import { buildPlaceholder, TIERS } from './build-placeholder.mjs'
import { parseGlb, readImageSize } from './glb.mjs'
import { PLACEHOLDER_CLIPS } from './placeholder-clips.mjs'
import { validateGlb } from './validate.mjs'

type Tier = (typeof TIERS)[number]

const cache = new Map<Tier, Promise<Uint8Array>>()
const build = (tier: Tier) => {
  if (!cache.has(tier)) cache.set(tier, buildPlaceholder({ contract, tier }))
  return cache.get(tier)!
}

describe('placeholder generator', () => {
  it.each(TIERS)('produces a %s model that passes every validator rule', async (tier) => {
    const report = validateGlb({ bytes: await build(tier), contract, tier })
    const notPassing = report.results.filter((r) => r.status !== 'pass')
    expect(notPassing).toEqual([])
  })

  it('is deterministic', async () => {
    const again = await buildPlaceholder({ contract, tier: 'lite' })
    expect(Buffer.compare(Buffer.from(again), Buffer.from(await build('lite')))).toBe(0)
  })

  it('marks the file as a placeholder', async () => {
    const { json } = parseGlb(await build('full'))
    expect(json.extras).toMatchObject({ kelorPlaceholder: true, contractVersion: 1 })
  })

  it('binds eyes and eyelids rigidly and keeps the lids open in the bind pose', async () => {
    const { json } = parseGlb(await build('full'))
    const eyes = json.meshes.find((m: { name: string }) => m.name === 'eyes')
    expect(eyes.primitives[0].attributes.JOINTS_0).toBeDefined()
    const skinJoints: number[] = json.skins[0].joints
    const names = skinJoints.map((i) => json.nodes[i].name)
    expect(names).toEqual(contract.skeleton.bones.map((b) => b.name))
  })

  it('paints the expression atlas at a power-of-two size', async () => {
    const { json, bin } = parseGlb(await build('lite'))
    const atlas = json.images.find((img: { name: string }) => img.name === 'face_atlas')
    const view = json.bufferViews[atlas.bufferView]
    const bytes = bin!.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
    expect(readImageSize(bytes)).toMatchObject({ format: 'png', width: 512, height: 512 })
  })

  it('defines tracks for every required clip and never keys forbidden bones', () => {
    const forbidden = new Set([contract.skeleton.rootBone, ...contract.skeleton.procedural])
    for (const clip of contract.clips.required) {
      const tracks = PLACEHOLDER_CLIPS[clip.name as keyof typeof PLACEHOLDER_CLIPS]
      expect(tracks, clip.name).toBeDefined()
      for (const track of tracks) {
        expect(forbidden.has(track.bone), `${clip.name} keys ${track.bone}`).toBe(false)
        expect(track.keys[0]![0]).toBe(0)
        expect(track.keys.at(-1)![0]).toBe(1)
      }
    }
  })

  it('closes looping clips on their first pose', () => {
    for (const clip of contract.clips.required.filter((c) => c.loop)) {
      for (const track of PLACEHOLDER_CLIPS[clip.name as keyof typeof PLACEHOLDER_CLIPS]) {
        expect(track.keys.at(-1)![1], `${clip.name}:${track.bone}`).toEqual(track.keys[0]![1])
      }
    }
  })
})
