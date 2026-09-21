import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import contract from '../../../character.json'
import fit from '../../../assets/model/fit.json'
import { STANDIN_PATH } from '../build-standin.mjs'
import { fitSkeleton, heightMap, measureLandmarks, NOMINAL } from './landmarks.mjs'
import { normalizeSource, orientationMatrix, readPositions } from './normalize.mjs'

const ROOT = resolve(__dirname, '../../..')
let positions: Float32Array
let report: object

beforeAll(async () => {
  const bytes = new Uint8Array(readFileSync(resolve(ROOT, STANDIN_PATH)))
  const standinFit = { ...fit, orientation: { ...fit.orientation, forward: '-Z', up: '+Y' } }
  const normalized = await normalizeSource({
    bytes,
    fit: standinFit,
    heightM: contract.meta.heightM,
  })
  report = normalized.report
  positions = await readPositions(normalized.bytes)
})

const bounds = (p: Float32Array) => {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, p[i + k]!)
      max[k] = Math.max(max[k]!, p[i + k]!)
    }
  }
  return { min, max }
}

describe('orientationMatrix', () => {
  it('turns a -Z facing source around and keeps +Y up', () => {
    const m = orientationMatrix('-Z', '+Y').elements
    // Column-major: the -Z axis must land on +Z.
    expect([m[8], m[9], m[10]].map((v) => Math.round(v))).toEqual([0, 0, -1])
    expect([m[4], m[5], m[6]].map((v) => Math.round(v))).toEqual([0, 1, 0])
  })

  it('rejects parallel axes', () => {
    expect(() => orientationMatrix('+Y', '-Y')).toThrow(/parallel/)
  })
})

describe('normalizeSource on the stand-in', () => {
  it('scales to the contract height with the feet on the floor', () => {
    const { min, max } = bounds(positions)
    expect(min[1]).toBeCloseTo(0, 4)
    expect(max[1]).toBeCloseTo(contract.meta.heightM, 4)
    expect(report).toMatchObject({ meshes: 1 })
  })

  it('faces +Z with the tail behind and stays centred on x', () => {
    const { min, max } = bounds(positions)
    expect(max[2]).toBeGreaterThan(0.25)
    expect(min[2]).toBeLessThan(-0.45)
    expect(Math.abs(min[0]! + max[0]!)).toBeLessThan(0.02)
  })
})

describe('landmarks and skeleton fit', () => {
  it('finds the anatomy of the stand-in where the nominal skeleton expects it', () => {
    const lm = measureLandmarks(positions, contract.meta.heightM)
    expect(lm.crotchY).toBeCloseTo(NOMINAL.crotchY, 1)
    expect(lm.neckY).toBeCloseTo(NOMINAL.neckY, 1)
    expect(lm.legX).toBeCloseTo(NOMINAL.legX, 1)
    expect(lm.hand[0]).toBeCloseTo(NOMINAL.handX, 1)
    expect(lm.tailTip[2]).toBeLessThan(-0.55)
    expect(lm.snoutTip[2] - lm.torsoFrontZ).toBeGreaterThan(0.08)
    expect(lm.tailCurve.length).toBeGreaterThan(4)
  })

  it('refits the skeleton within 5 cm of nominal for a body with nominal proportions', () => {
    const lm = measureLandmarks(positions, contract.meta.heightM)
    const fitted = fitSkeleton(contract, lm)
    // The stand-in is the nominal body, only moved back so its feet sit on the origin.
    const dz = lm.torsoFrontZ - NOMINAL.torsoFrontZ
    expect(dz).toBeLessThan(-0.03)
    for (const [i, bone] of fitted.entries()) {
      const nominal = contract.skeleton.bones[i]!.restHead
      const distance = Math.hypot(
        ...bone.restHead.map((v, k) => v - nominal[k]! - (k === 2 ? dz : 0)),
      )
      // Tail bones land on the measured tail centreline, a few cm off the nominal heads.
      expect(distance, bone.name).toBeLessThan(0.05)
    }
  })

  it('keeps hierarchy and names, and lets overrides win', () => {
    const lm = measureLandmarks(positions, contract.meta.heightM)
    const fitted = fitSkeleton(contract, lm, { head: [0, 0.8, 0.05] })
    expect(fitted.map((b) => [b.name, b.parent])).toEqual(
      contract.skeleton.bones.map((b) => [b.name, b.parent]),
    )
    expect(fitted.find((b) => b.name === 'head')!.restHead).toEqual([0, 0.8, 0.05])
  })

  it('maps the nominal anchors onto the measured ones', () => {
    const f = heightMap({ crotchY: 0.25, neckY: 0.75, heightM: 1.2 } as never)
    expect(f(0)).toBe(0)
    expect(f(NOMINAL.crotchY)).toBeCloseTo(0.25)
    expect(f(NOMINAL.neckY)).toBeCloseTo(0.75)
    expect(f(1.2)).toBeCloseTo(1.2)
  })
})
