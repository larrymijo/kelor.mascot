import {
  AnimationClip,
  Bone,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  NumberKeyframeTrack,
  Texture,
} from 'three'
import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import { MascotRig } from './MascotRig'

/** The smallest stand-in the rig accepts: a root bone, a face with an atlas, two clips. */
function tinyModel() {
  const scene = new Group()
  const root = new Bone()
  root.name = 'root'
  scene.add(root)
  const face = new Mesh(
    new BoxGeometry(),
    new MeshStandardMaterial({ name: 'face', map: new Texture() }),
  )
  scene.add(face)
  const track = () => new NumberKeyframeTrack('root.position[x]', [0, 3], [0, 1])
  return {
    scene,
    animations: [
      new AnimationClip('idle', 3, [track()]),
      new AnimationClip('look_around', 3, [track()]),
    ],
  }
}

describe('MascotRig snapshot and restore', () => {
  it('hands the clip, its time and the expression to the next rig', () => {
    const lite = new MascotRig(tinyModel())
    lite.play('look_around')
    lite.update(1.25)
    lite.setExpression('happy')

    const snapshot = lite.snapshot()
    expect(snapshot).toEqual({ clip: 'look_around', time: 1.25, expression: 'happy' })

    const full = new MascotRig(tinyModel())
    full.restore(snapshot)
    expect(full.currentClip).toBe('look_around')
    expect(full.snapshot().time).toBeCloseTo(1.25, 5)
    expect(full.snapshot().expression).toBe('happy')

    // The face atlas moved to the happy cell on the new model too.
    const [col, row] = character.expressions.cells.happy
    const [cols, rows] = character.expressions.grid
    let offset: number[] = []
    full.scene.traverse((o) => {
      const material = (o as Mesh).material as MeshStandardMaterial | undefined
      if (material?.name === 'face' && material.map) offset = material.map.offset.toArray()
    })
    expect(offset).toEqual([col / cols, row / rows])
  })

  it('restores nothing from an idle, untouched rig', () => {
    const rig = new MascotRig(tinyModel())
    expect(rig.snapshot()).toEqual({ clip: null, time: 0, expression: null })
    const next = new MascotRig(tinyModel())
    next.restore(rig.snapshot())
    expect(next.currentClip).toBeNull()
  })
})
