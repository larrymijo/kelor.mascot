import { describe, expect, it } from 'vitest'
import raw from '../../../character.json'
import { character } from './index'
import { characterSchema, parseCharacter, type Character } from './schema'

/** Deep clone of the real contract, to mutate in negative tests. */
const clone = (): Character => structuredClone(raw) as unknown as Character

/** Messages of every issue raised for a mutated contract. */
function issuesFor(mutate: (c: Character) => void): string[] {
  const data = clone()
  mutate(data)
  const result = characterSchema.safeParse(data)
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('character.json', () => {
  it('matches the schema', () => {
    expect(() => parseCharacter(raw)).not.toThrow()
  })

  it('is exposed with the same content by the runtime entry point', () => {
    expect(character).toEqual(parseCharacter(raw))
  })

  it('declares the 28 canonical bones with a single root', () => {
    const { bones, rootBone } = character.skeleton
    expect(bones).toHaveLength(28)
    expect(bones.filter((b) => b.parent === null).map((b) => b.name)).toEqual([rootBone])
  })

  it('keeps the tail at 4 bones and the head chain within the brief limits', () => {
    expect(character.skeleton.bones.filter((b) => b.role === 'tail')).toHaveLength(4)
    expect(character.gaze.headChain.maxYawDeg).toBeLessThanOrEqual(40)
    expect(character.gaze.headChain.maxPitchDeg).toBeLessThanOrEqual(25)
  })

  it('offers the four expressions of the bible', () => {
    expect(Object.keys(character.expressions.cells).sort()).toEqual(
      ['happy', 'neutral', 'roar', 'surprised'].sort(),
    )
  })

  it('forbids morph targets in every tier', () => {
    expect(character.budgets.full.maxMorphTargets).toBe(0)
    expect(character.budgets.lite.maxMorphTargets).toBe(0)
  })
})

describe('characterSchema cross-checks', () => {
  it('rejects unknown keys (typos)', () => {
    expect(issuesFor((c) => Object.assign(c.meta, { heigthM: 1 }))).not.toEqual([])
  })

  it('rejects a bone whose parent is missing', () => {
    const issues = issuesFor((c) => {
      c.skeleton.bones.find((b) => b.name === 'tail_02')!.parent = 'tail_99'
    })
    expect(issues.join('\n')).toMatch(/Parent "tail_99"/)
  })

  it('rejects duplicate bone names', () => {
    const issues = issuesFor((c) => {
      c.skeleton.bones.find((b) => b.name === 'tail_04')!.name = 'tail_03'
    })
    expect(issues.join('\n')).toMatch(/Duplicate bone "tail_03"/)
  })

  it('rejects asymmetric left/right rest positions', () => {
    const issues = issuesFor((c) => {
      c.skeleton.bones.find((b) => b.name === 'hand_L')!.restHead = [0.3, 0.47, 0.15]
    })
    expect(issues.join('\n')).toMatch(/not mirrored/)
  })

  it('rejects gaze bones that are not procedural', () => {
    const issues = issuesFor((c) => {
      c.skeleton.procedural = c.skeleton.procedural.filter((b) => b !== 'eye_L')
    })
    expect(issues.join('\n')).toMatch(/"eye_L" must be listed in skeleton.procedural/)
  })

  it('rejects head chain shares that do not add up to 1', () => {
    const issues = issuesFor((c) => {
      c.gaze.headChain.links[0]!.share = 0.5
    })
    expect(issues.join('\n')).toMatch(/Shares must add up to 1/)
  })

  it('rejects textures that break the tier budget or are not powers of two', () => {
    const issues = issuesFor((c) => {
      c.textures.items[0]!.size.lite = 2048
      c.textures.items[1]!.size.full = 1000
    })
    const text = issues.join('\n')
    expect(text).toMatch(/exceeds budgets.lite.maxTextureSize/)
    expect(text).toMatch(/1000 is not a power of two/)
  })

  it('rejects expression cells outside the atlas or shared by two expressions', () => {
    const issues = issuesFor((c) => {
      c.expressions.cells.roar = [2, 0]
      c.expressions.cells.happy = [0, 0]
    })
    const text = issues.join('\n')
    expect(text).toMatch(/outside the grid/)
    expect(text).toMatch(/Shares cell \[0, 0\]/)
  })

  it('rejects meshes that reference unknown materials', () => {
    const issues = issuesFor((c) => {
      c.meshes.required[0]!.material = 'skin'
    })
    expect(issues.join('\n')).toMatch(/Unknown material "skin"/)
  })

  it('rejects clips longer than the animation budget', () => {
    const issues = issuesFor((c) => {
      c.clips.required[0]!.durationS = 60
    })
    expect(issues.join('\n')).toMatch(/over budgets.full.maxAnimationSeconds/)
  })

  it('reports a readable error from parseCharacter', () => {
    const data = clone()
    data.meta.units = 'feet' as 'meters'
    expect(() => parseCharacter(data)).toThrow(/Invalid character contract/)
  })
})
