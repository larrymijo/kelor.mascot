import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import contract from '../../character.json'
import fit from '../../assets/model/fit.json'
import { fitSchema } from './fit'

const clone = () => structuredClone(fit) as Record<string, unknown> & typeof fit

describe('assets/model/fit.json', () => {
  it('matches the schema', () => {
    const result = fitSchema.safeParse(fit)
    expect(result.success ? [] : result.error.issues).toEqual([])
  })

  it('points at a committed source model', () => {
    expect(existsSync(resolve(__dirname, '../..', fit.source))).toBe(true)
  })

  it('only overrides and plates contract bones', () => {
    const bones = new Set(contract.skeleton.bones.map((b) => b.name))
    for (const name of Object.keys(fit.rig.overrides)) expect(bones.has(name), name).toBe(true)
    for (const item of fit.plates.items) expect(bones.has(item.bone), item.bone).toBe(true)
  })

  it('keeps the retopology inside the triangle budgets', () => {
    // Quads become two triangles; eyes, lids, plates and face add roughly 2,500 more.
    expect(fit.retopo.targetQuads.full * 2 + 2500).toBeLessThanOrEqual(
      contract.budgets.full.maxTriangles,
    )
    expect(fit.retopo.targetQuads.lite * 2 + 1500).toBeLessThanOrEqual(
      contract.budgets.lite.maxTriangles,
    )
  })

  it('bakes within the contract texture sizes', () => {
    expect(fit.bake.size.full).toBeLessThanOrEqual(contract.budgets.full.maxTextureSize)
    expect(fit.bake.size.lite).toBeLessThanOrEqual(contract.budgets.lite.maxTextureSize)
  })

  it('rejects sources outside assets/source and conflicting axes', () => {
    const bad = clone()
    bad.source = 'public/models/x.glb'
    bad.orientation = { ...bad.orientation, forward: '+Y', up: '+Y' }
    const issues = fitSchema.safeParse(bad).error?.issues.map((i) => i.path.join('.')) ?? []
    expect(issues).toEqual(expect.arrayContaining(['source', 'orientation']))
  })
})
