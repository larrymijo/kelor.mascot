import {
  AnimationClip,
  Bone,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  NumberKeyframeTrack,
  Quaternion,
  QuaternionKeyframeTrack,
  Texture,
  Vector3,
  type Object3D,
} from 'three'
import { describe, expect, it } from 'vitest'
import { character } from '@/lib/character'
import { MascotRig, type BehaviourFrame } from './MascotRig'

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

/**
 * The contract skeleton with identity rest rotations, as the pipeline builds
 * it. `eyeBindYawDeg` gives the eyes a rotated bind pose to prove the math
 * does not assume identity.
 */
function contractModel({ eyeBindYawDeg = 0, headClip = false } = {}) {
  const scene = new Group()
  const bones = new Map<string, Bone>()
  for (const spec of character.skeleton.bones) {
    const bone = new Bone()
    bone.name = spec.name
    const parent = spec.parent ? bones.get(spec.parent)! : null
    const head = new Vector3(...spec.restHead)
    const parentHead = parent
      ? new Vector3(...character.skeleton.bones.find((b) => b.name === spec.parent)!.restHead)
      : new Vector3()
    bone.position.copy(head.sub(parentHead))
    if (spec.name.startsWith('eye_') && eyeBindYawDeg) {
      bone.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), (eyeBindYawDeg * Math.PI) / 180)
    }
    ;(parent ?? scene).add(bone as Object3D)
    bones.set(spec.name, bone)
  }
  const animations = [new AnimationClip('idle', 2, [])]
  if (headClip) {
    // A clip that keys the head, to prove offsets land on top of it without piling up.
    const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.2).toArray()
    animations[0] = new AnimationClip('idle', 2, [
      new QuaternionKeyframeTrack('head.quaternion', [0, 2], [...tilt, ...tilt]),
    ])
  }
  return { scene, animations }
}

const frame = (target: Vector3, patch: Partial<BehaviourFrame> = {}): BehaviourFrame => ({
  target,
  weight: 1,
  blink: 0,
  lambdaScale: 1,
  ...patch,
})

/** Run the rig for `seconds` at 60 fps so the damped layers converge. */
function settle(rig: MascotRig, f: BehaviourFrame, seconds = 4) {
  for (let i = 0; i < seconds * 60; i++) {
    rig.update(1 / 60)
    rig.behave(1 / 60, f)
    rig.scene.updateMatrixWorld(true)
  }
}

/** World-space yaw of a bone's +Z, relative to the character's +Z. */
function worldYawDeg(bone: Bone) {
  const forward = new Vector3(0, 0, 1).transformDirection(bone.matrixWorld)
  return (Math.atan2(forward.x, forward.z) * 180) / Math.PI
}

describe('MascotRig snapshot and restore', () => {
  it('hands the clip, its time and the expression to the next rig', () => {
    const lite = new MascotRig(tinyModel())
    lite.play('look_around')
    lite.update(1.25)
    lite.setExpression('happy')

    const snapshot = lite.snapshot()
    expect(snapshot).toMatchObject({ clip: 'look_around', time: 1.25, expression: 'happy' })

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
    expect(rig.snapshot()).toMatchObject({ clip: null, time: 0, expression: null })
    const next = new MascotRig(tinyModel())
    next.restore(rig.snapshot())
    expect(next.currentClip).toBeNull()
  })

  it('carries the gaze across a model swap, so the head does not snap back', () => {
    const target = new Vector3(3, 1, 2)
    const lite = new MascotRig(contractModel())
    lite.play('idle')
    settle(lite, frame(target))
    const before = worldYawDeg(lite.bones.get('head')!)

    const full = new MascotRig(contractModel())
    full.restore(lite.snapshot())
    full.update(1 / 60)
    full.behave(1 / 60, frame(target))
    full.scene.updateMatrixWorld(true)
    expect(worldYawDeg(full.bones.get('head')!)).toBeCloseTo(before, 0)
  })
})

describe('MascotRig behaviour layers', () => {
  it('turns the head towards a target on its left and stays within the contract limit', () => {
    const rig = new MascotRig(contractModel())
    rig.play('idle')
    settle(rig, frame(new Vector3(2, 0.9, 1.5)))
    const yaw = worldYawDeg(rig.bones.get('head')!)
    expect(yaw).toBeGreaterThan(10)
    expect(yaw).toBeLessThanOrEqual(character.gaze.headChain.maxYawDeg + 0.05)

    // Far round to the side, the neck stops at its limit instead of wrapping. The limit
    // holds for the chain total; composing three links that also pitch can add a
    // thousandth of a degree in world yaw.
    const side = new MascotRig(contractModel())
    side.play('idle')
    settle(side, frame(new Vector3(10, 0.9, -1)))
    expect(worldYawDeg(side.bones.get('head')!)).toBeLessThanOrEqual(
      character.gaze.headChain.maxYawDeg + 0.05,
    )
  })

  it('points the eyes at a target inside their range, with or without a rotated bind pose', () => {
    for (const eyeBindYawDeg of [0, 20]) {
      const rig = new MascotRig(contractModel({ eyeBindYawDeg }))
      rig.play('idle')
      const target = new Vector3(0.4, 1.1, 2.5)
      settle(rig, frame(target))
      for (const name of character.gaze.eyes.bones) {
        const eye = rig.bones.get(name)!
        const position = eye.getWorldPosition(new Vector3())
        const wanted = target.clone().sub(position).normalize()
        const looking = new Vector3(0, 0, 1).transformDirection(eye.matrixWorld)
        // The bind rotation is the eye's own forward; the gaze aims that forward at the target.
        expect(looking.angleTo(wanted), `${name} with ${eyeBindYawDeg}° bind`).toBeLessThan(0.02)
      }
    }
  })

  it('lays offsets on top of the clip without piling them up frame after frame', () => {
    const rig = new MascotRig(contractModel({ headClip: true }))
    rig.play('idle')
    const f = frame(new Vector3(1.5, 1.2, 2))
    settle(rig, f)
    const head = rig.bones.get('head')!
    const first = head.quaternion.clone()
    // A zero-length frame changes nothing: if offsets accumulated, it would turn further.
    rig.update(0)
    rig.behave(0, f)
    expect(head.quaternion.angleTo(first)).toBeLessThan(1e-6)
  })

  it('does nothing to the head when the director weight is zero', () => {
    const rig = new MascotRig(contractModel())
    rig.play('idle')
    settle(rig, frame(new Vector3(3, 1, 1), { weight: 0 }))
    expect(Math.abs(worldYawDeg(rig.bones.get('head')!))).toBeLessThan(1e-3)
  })

  it('closes the lids by the contract angle at a full blink', () => {
    const rig = new MascotRig(contractModel())
    rig.play('idle')
    settle(rig, frame(new Vector3(0, 1, 3), { blink: 1 }), 0.1)
    const lid = rig.bones.get('eyelid_L')!
    const angle = 2 * Math.acos(Math.min(1, Math.abs(lid.quaternion.w)))
    expect((angle * 180) / Math.PI).toBeCloseTo(character.gaze.blink.closedAngleDeg, 0)
  })

  it('keeps one-shots returning to the chosen idle loop', () => {
    const rig = new MascotRig(tinyModel())
    rig.play('idle')
    rig.setIdleClip('look_around')
    expect(rig.currentClip).toBe('look_around')
    expect(rig.idleClip).toBe('look_around')
  })
})
