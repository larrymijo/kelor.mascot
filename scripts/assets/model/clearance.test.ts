import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import contract from '../../../character.json'
import { PLACEHOLDER_CLIPS } from '../placeholder-clips.mjs'
import { armHeadClearance } from './clearance.mjs'

const ROOT = resolve(__dirname, '../../..')
/** The closest a forearm or hand may come to the head in any clip. */
const MIN_CLEARANCE_M = 0.05

describe('clip clearance', () => {
  it("keeps every clip's forearms and hands off the head", async () => {
    // The committed lite model's body and weights, posed by the current clip data.
    const bytes = new Uint8Array(readFileSync(resolve(ROOT, 'public/models/mascot.lite.glb')))
    const clearance = await armHeadClearance(bytes, PLACEHOLDER_CLIPS)
    expect(Object.keys(clearance).sort()).toEqual(contract.clips.required.map((c) => c.name).sort())
    for (const [clip, { L, R }] of Object.entries(clearance)) {
      expect(Math.min(L, R), `${clip}: closest forearm or hand to the head`).toBeGreaterThan(
        MIN_CLEARANCE_M,
      )
    }
  }, 60_000)

  it('catches an arm raised over the head', async () => {
    const bytes = new Uint8Array(readFileSync(resolve(ROOT, 'public/models/mascot.lite.glb')))
    // The old wave: the right arm 115 degrees up, through the cheek.
    const overhead = {
      wave: [
        {
          bone: 'upperarm_R',
          path: 'rotation',
          keys: [
            [0, [0, 0, 0]],
            [0.5, [0, 0, -115]],
            [1, [0, 0, 0]],
          ] as [number, number[]][],
        },
      ],
    }
    const { wave } = await armHeadClearance(bytes, overhead, 8)
    expect(wave!.R).toBeLessThan(0.02)
  }, 60_000)
})
