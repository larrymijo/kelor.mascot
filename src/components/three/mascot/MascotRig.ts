/**
 * Imperative wrapper around a loaded mascot: clone, bones, animation mixer,
 * expression atlas, plate glow, and the behaviour layers on top of the clips.
 * Keeping the three.js mutations behind methods keeps React components
 * declarative. Everything is found by the contract's names, so any model that
 * passes the validator drops in without code changes.
 *
 * Layering, every frame:
 *   1. the layered bones return to their bind pose;
 *   2. the mixer writes whatever the clips key;
 *   3. behave() multiplies the carried pose (legs, arms, a wiggle), gaze,
 *      blink, tail and jaw offsets on top.
 * Offsets therefore never accumulate, whether or not a clip keys the bone.
 */
import {
  AnimationMixer,
  Euler,
  LoopOnce,
  LoopRepeat,
  Matrix4,
  Quaternion,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Bone,
  type Material,
  type Mesh,
  type MeshPhysicalMaterial,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
} from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { aimAngles, clampAngles, dampAngles, chainShares, type Angles } from '@/lib/behaviour/gaze'
import { createTail, stepTail, type TailLink } from '@/lib/behaviour/tail'
import { character } from '@/lib/character'
import { MOUTH } from '@/lib/live/pose'
import { applyFinish, tuneFinish, type Finish } from './finish'
import { damp, degToRad } from '@/lib/math/damp'

const CROSS_FADE_S = 0.25
const loops = new Map(character.clips.required.map((clip) => [clip.name, clip.loop]))
const { cells, grid } = character.expressions
const { gaze, life } = character

const HEAD = {
  maxYaw: degToRad(gaze.headChain.maxYawDeg),
  maxPitch: degToRad(gaze.headChain.maxPitchDeg),
  shares: chainShares(gaze.headChain.links),
}
const EYES = { maxYaw: degToRad(gaze.eyes.maxYawDeg), maxPitch: degToRad(gaze.eyes.maxPitchDeg) }
const LID_CLOSED = degToRad(gaze.blink.closedAngleDeg)
/** Upper lids ride half the eye's pitch, so they stay on the iris; never lifted far. */
const LID_FOLLOW = 0.5
const LID_FOLLOW_RANGE = [degToRad(-8), degToRad(25)] as const
/** How fast the layers fade in and out when the director changes the weight. */
const WEIGHT_LAMBDA = 4
/** The procedural jaw (character.json jaw): a positive turn about its +X opens it. */
const JAW_BONE = character.skeleton.bones.find((b) => b.role === 'jaw')?.name
/** A bite closes within biteS: three time constants of the damping. */
const BITE_LAMBDA = 3 / character.jaw.biteS
/** The jaw stays shut this long after a bite before it follows again. */
const BITE_HOLD_S = 0.35
/** The camera aims this far inside the lips, into the mouth rather than at its edge. */
const MOUTH_INSET_M = 0.02
const CARRY = character.interaction.carry
/** How much of his sideways speed (m/s) the tail feels as a turn (rad/s): it trails behind. */
const LATERAL_TO_YAW = 1.4

/** What the carried layer shows this frame; the behaviour controller sets it. */
export interface CarryPose {
  /** 0 standing to 1 held or flying. */
  carried: number
  /** Phase of the legs' kick and the arms' flap (rad). */
  kick: number
  /** Side-to-side wiggle of the upper body (rad), for the giggle. */
  wiggle: number
  /** 1, or less with reduced motion: calmer kicks and flaps. */
  stillness: number
}

export type ExpressionName = keyof typeof cells

/** What drives the layers this frame; the behaviour component fills it in. */
export interface BehaviourFrame {
  /** Smoothed look-at point in world space. */
  target: Vector3
  /** Director's gaze weight, 0 to 1. The rig fades towards it. */
  weight: number
  /** Lid closure from the blink scheduler, 0 open to 1 shut. */
  blink: number
  /** 1, or the reduced-motion scale that makes the gaze calmer. */
  lambdaScale: number
}

/** What a rig hands over when the model under it is replaced. */
export interface RigSnapshot {
  clip: string | null
  time: number
  expression: ExpressionName | null
  idleClip: string
  behaviour?: { head: Angles; eyes: Angles[]; weight: number; tail: TailLink[]; jawDeg?: number }
}

function findMaterial(root: Object3D, name: string) {
  let found: Material | undefined
  root.traverse((object) => {
    const material = (object as Mesh).material as Material | undefined
    if (!found && material && !Array.isArray(material) && material.name === name) found = material
  })
  return found
}

/** Meshes that only exist inside the open mouth. */
const MOUTH_PARTS = new Set(['teeth', 'mouth'])

// Scratch objects shared by every rig: behave() runs one rig at a time.
const _target = new Vector3()
const _from = new Vector3()
const _invParent = new Matrix4()
const _invBind = new Quaternion()
const _offset = new Quaternion()
const _euler = new Euler(0, 0, 0, 'YXZ')
const _aim: Angles = { yaw: 0, pitch: 0 }
const _limited: Angles = { yaw: 0, pitch: 0 }
const _forward = new Vector3()
const _world = new Vector3()
const _sceneQ = new Quaternion()
const _boneQ = new Quaternion()
const _axis = new Vector3()
const X_AXIS = new Vector3(1, 0, 0)
const Z_AXIS = new Vector3(0, 0, 1)

export class MascotRig {
  readonly scene: Object3D
  readonly bones = new Map<string, Bone>()
  readonly missingBones: string[]
  private readonly mixer: AnimationMixer
  private readonly actions: Map<string, AnimationAction>
  private readonly faceMap?: Texture
  private readonly plates?: MeshStandardMaterial
  private current: AnimationAction | null = null
  private expression: ExpressionName | null = null
  private idle = 'idle'

  // Behaviour layers
  private readonly bind = new Map<Bone, Quaternion>()
  private readonly chain: Bone[]
  private readonly head?: Bone
  private readonly eyes: Bone[]
  private readonly lids: (Bone | undefined)[]
  private readonly tailBones: Bone[]
  private readonly hips?: Bone
  private readonly jaw?: Bone
  /** Teeth and mouth cavity: drawn only while the jaw is open. */
  private readonly mouthParts: Object3D[] = []
  private jawDeg = 0
  private jawExpressionDeg = 0
  private jawScriptDeg = 0
  private biting = 0
  /** The mouth in the head bone's space, so it follows every turn of the head. */
  private readonly mouthLocal = new Vector3()
  /** The lower lip in the jaw bone's space: it drops as the jaw opens. */
  private readonly lowerMouthLocal = new Vector3()
  private headAngles: Angles = { yaw: 0, pitch: 0 }
  private eyeAngles: Angles[]
  private weight = 0
  private tail: TailLink[]
  private readonly finish: MeshPhysicalMaterial[]
  private hipsYaw = 0
  private hipsX = 0
  private hipsY = 0
  private hipsMeasured = false
  /** The bones the carried layer moves, found by the contract's names. */
  private readonly spine: Bone[]
  private readonly legs: { side: number; thigh?: Bone; shin?: Bone; foot?: Bone }[]
  private readonly arms: { side: number; upper?: Bone; fore?: Bone }[]
  private readonly carryPose: CarryPose = { carried: 0, kick: 0, wiggle: 0, stillness: 1 }

  /**
   * @param options.finish swap in the physical skin and eye finish (medium and
   *   high tiers); the low tier keeps the GLB's standard materials.
   */
  constructor(
    gltf: { scene: Object3D; animations: AnimationClip[] },
    options: { finish?: boolean } = {},
  ) {
    this.scene = cloneSkinned(gltf.scene)
    this.scene.traverse((object) => {
      if ((object as Bone).isBone) this.bones.set(object.name, object as Bone)
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      // Skinned bounds come from the bind pose; animation would cull them wrongly.
      mesh.frustumCulled = false
    })
    this.missingBones = character.skeleton.bones
      .map((b) => b.name)
      .filter((name) => !this.bones.has(name))

    const found = (names: readonly string[]) =>
      names.map((n) => this.bones.get(n)).filter((b): b is Bone => Boolean(b))
    this.chain = found(gaze.headChain.links.map((l) => l.bone))
    this.head = this.bones.get(gaze.headChain.links.at(-1)!.bone)
    this.eyes = found(gaze.eyes.bones)
    // Pair each lid with its eye by side, whatever order the contract lists them in.
    this.lids = this.eyes.map((eye) =>
      found(gaze.blink.bones).find((lid) => lid.name.slice(-2) === eye.name.slice(-2)),
    )
    this.tailBones = found(life.tail.bones)
    this.hips = this.bones.get('hips')
    this.jaw = JAW_BONE ? this.bones.get(JAW_BONE) : undefined
    // The inner teeth and the cavity hide in the closed mouth; the tusks, which
    // share the teeth's material, stay out on the lips.
    this.scene.traverse((object) => {
      if ((object as Mesh).isMesh && MOUTH_PARTS.has(object.name)) this.mouthParts.push(object)
    })
    if (this.head) {
      // At bind the scene root is the model's origin: place the mouth, then keep
      // the upper lip in head space and the lower lip in jaw space, a little
      // inside the lips, so the middle of the two is the mouth's opening.
      this.scene.updateMatrixWorld(true)
      this.head.worldToLocal(this.mouthLocal.set(0, MOUTH.y, MOUTH.z - MOUTH_INSET_M))
      this.jaw?.worldToLocal(this.lowerMouthLocal.set(0, MOUTH.y, MOUTH.z - MOUTH_INSET_M))
    }
    this.spine = found(['spine_02', 'chest'])
    // Left is +X in character space; each side turns the mirror way.
    this.legs = (['L', 'R'] as const).map((s) => ({
      side: s === 'L' ? 1 : -1,
      thigh: this.bones.get(`thigh_${s}`),
      shin: this.bones.get(`shin_${s}`),
      foot: this.bones.get(`foot_${s}`),
    }))
    this.arms = (['L', 'R'] as const).map((s) => ({
      side: s === 'L' ? 1 : -1,
      upper: this.bones.get(`upperarm_${s}`),
      fore: this.bones.get(`forearm_${s}`),
    }))
    const limbs = [
      ...this.spine,
      ...this.legs.flatMap((l) => [l.thigh, l.shin, l.foot]),
      ...this.arms.flatMap((a) => [a.upper, a.fore]),
    ]
    for (const bone of [
      ...this.chain,
      ...this.eyes,
      ...this.lids,
      ...this.tailBones,
      this.jaw,
      ...limbs,
    ]) {
      if (bone) this.bind.set(bone, bone.quaternion.clone())
    }
    this.eyeAngles = this.eyes.map(() => ({ yaw: 0, pitch: 0 }))
    this.tail = createTail(this.tailBones.length)

    this.mixer = new AnimationMixer(this.scene)
    this.actions = new Map(gltf.animations.map((clip) => [clip.name, this.mixer.clipAction(clip)]))
    // Before the face lookup: the physical face keeps the same atlas texture.
    this.finish = options.finish ? applyFinish(this.scene) : []
    this.faceMap =
      (findMaterial(this.scene, 'face') as MeshStandardMaterial | undefined)?.map ?? undefined
    this.plates = findMaterial(this.scene, 'plates') as MeshStandardMaterial | undefined
    // The contract's pale glow colour burns out to white under bloom and AgX;
    // a saturated violet keeps the plates reading as purple crystals.
    this.plates?.emissive.set(character.colors.mascot['500'])
    // Catchlights are the brightest thing on screen: AgX would tone pure white down to grey.
    const highlight = findMaterial(this.scene, 'highlight')
    if (highlight) highlight.toneMapped = false
    this.mixer.addEventListener('finished', this.onFinished)
  }

  get currentClip() {
    return this.current?.getClip().name ?? null
  }

  get idleClip() {
    return this.idle
  }

  /** Play a contract clip; loops follow character.json, one-shots return to the idle clip. */
  play(name: string) {
    const action = this.actions.get(name)
    if (!action) return false
    const loop = loops.get(name) ?? false
    action.reset()
    action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1)
    action.clampWhenFinished = !loop
    if (this.current && this.current !== action)
      action.crossFadeFrom(this.current, CROSS_FADE_S, false)
    action.play()
    this.current = action
    return true
  }

  /**
   * The loop to rest in: idle, or look_around on touch devices left alone.
   * Switches straight away when resting; a one-shot finishes first.
   */
  setIdleClip(name: string) {
    if (name === this.idle || !this.actions.has(name)) return
    const resting = this.currentClip === this.idle || this.currentClip === null
    this.idle = name
    if (resting && this.current) this.play(name)
  }

  snapshot(): RigSnapshot {
    return {
      clip: this.currentClip,
      time: this.current?.time ?? 0,
      expression: this.expression,
      idleClip: this.idle,
      behaviour: {
        head: { ...this.headAngles },
        eyes: this.eyeAngles.map((a) => ({ ...a })),
        weight: this.weight,
        tail: this.tail.map((l) => ({ yaw: { ...l.yaw }, pitch: { ...l.pitch } })),
        jawDeg: this.jawDeg,
      },
    }
  }

  /**
   * Continue exactly where another rig left off: same clip at the same time,
   * same expression, same gaze and tail. Plate glow needs no handover, the
   * component sets it every frame. This is what makes the lite to full swap
   * invisible.
   */
  restore(snapshot: RigSnapshot) {
    this.idle = snapshot.idleClip ?? this.idle
    if (snapshot.expression) this.setExpression(snapshot.expression)
    if (snapshot.clip && this.play(snapshot.clip) && this.current) this.current.time = snapshot.time
    const b = snapshot.behaviour
    if (b) {
      this.headAngles = { ...b.head }
      this.eyeAngles = this.eyeAngles.map((a, i) => ({ ...(b.eyes[i] ?? a) }))
      this.weight = b.weight
      this.jawDeg = b.jawDeg ?? this.jawDeg
      if (b.tail.length === this.tail.length) {
        this.tail = b.tail.map((l) => ({ yaw: { ...l.yaw }, pitch: { ...l.pitch } }))
      }
    }
  }

  /** Bind pose for the layered bones, then the clips. Call behave() afterwards. */
  update(dt: number) {
    for (const [bone, rest] of this.bind) bone.quaternion.copy(rest)
    this.mixer.update(dt)
  }

  /** The carried pose, gaze, blink, tail and jaw on top of the clip pose. */
  behave(dt: number, frame: BehaviourFrame) {
    this.weight = damp(this.weight, frame.weight, WEIGHT_LAMBDA, dt)
    this.carry()
    this.aimHead(dt, frame)
    this.aimEyes(dt, frame)
    this.blink(frame.blink)
    this.swingTail(dt)
    this.moveJaw(dt)
  }

  /** How he is being carried this frame (behaviour controller); applied in behave(). */
  setCarry(pose: CarryPose) {
    Object.assign(this.carryPose, pose)
  }

  /** How far the bite or a reaction opens the jaw, in degrees; the expression may open it more. */
  setJawScript(deg: number) {
    this.jawScriptDeg = Math.min(character.jaw.maxOpenDeg, Math.max(0, deg))
  }

  /** Snap the jaw shut, faster than it otherwise moves, and hold it a moment. */
  bite() {
    this.biting = character.jaw.biteS + BITE_HOLD_S
  }

  /** Current jaw opening in degrees; for tests and the debug readout. */
  get jawOpenDeg() {
    return this.jawDeg
  }

  /** Current layer weight; for tests and the debug readout. */
  get gazeWeight() {
    return this.weight
  }

  /** Switch the face atlas cell by UV offset, and open the jaw as the expression wants. */
  setExpression(name: ExpressionName) {
    if (name === this.expression) return
    this.jawExpressionDeg = (character.jaw.openDeg as Record<string, number>)[name] ?? 0
    if (!this.faceMap) return
    this.expression = name
    const [col, row] = cells[name] ?? cells[character.expressions.default as ExpressionName]!
    this.faceMap.offset.set(col / grid[0], row / grid[1])
  }

  /**
   * Where the mouth is in the world right now, whatever the head, the jaw and
   * the stage are doing: the middle of its opening, just inside the lips.
   */
  mouthWorld(out: Vector3) {
    if (!this.head) return out.set(0, MOUTH.y, MOUTH.z)
    this.head.updateWorldMatrix(true, false)
    this.head.localToWorld(out.copy(this.mouthLocal))
    if (!this.jaw) return out
    this.jaw.updateWorldMatrix(true, false)
    return out.add(this.jaw.localToWorld(_world.copy(this.lowerMouthLocal))).multiplyScalar(0.5)
  }

  /** Midpoint between the eyes in the world, for the close-up's focus. */
  eyesWorld(out: Vector3) {
    if (this.eyes.length === 0) return out.set(0, 0.93, 0.2)
    out.set(0, 0, 0)
    for (const eye of this.eyes) out.add(eye.getWorldPosition(_world))
    return out.divideScalar(this.eyes.length)
  }

  /** A point on the plates along the back, in the world, for the close-up's focus. */
  platesWorld(out: Vector3) {
    this.scene.updateWorldMatrix(true, false)
    return this.scene.localToWorld(out.set(0, 0.62, -0.2))
  }

  setPlateGlow(intensity: number) {
    if (this.plates) this.plates.emissiveIntensity = intensity
  }

  /** Live-tune the vinyl finish from the debug panel. */
  setFinish(finish: Finish) {
    tuneFinish(this.finish, finish)
  }

  dispose() {
    for (const material of this.finish) material.dispose()
    this.mixer.removeEventListener('finished', this.onFinished)
    this.mixer.stopAllAction()
  }

  /** Target direction from `origin` (world) in `bone`'s rest frame, as yaw and pitch. */
  private aimFrom(bone: Bone, origin: Vector3, target: Vector3, out: Angles) {
    const parent = bone.parent!
    _invParent.copy(parent.matrixWorld).invert()
    _target.copy(target).applyMatrix4(_invParent)
    _from.copy(origin).applyMatrix4(_invParent)
    _target.sub(_from).applyQuaternion(_invBind.copy(this.bind.get(bone)!).invert())
    return aimAngles(_target.x, _target.y, _target.z, out)
  }

  private rotate(bone: Bone, yaw: number, pitch: number) {
    // Pitch up is a negative turn about +X, the axis that closes the lids.
    bone.quaternion.multiply(_offset.setFromEuler(_euler.set(-pitch, yaw, 0, 'YXZ')))
  }

  /** The neck and head share one aim at the target, damped slowly. */
  private aimHead(dt: number, frame: BehaviourFrame) {
    const root = this.chain[0]
    if (!root || !this.head) return
    // Bring the chain up to date with this frame's clip pose.
    this.head.updateWorldMatrix(true, false)
    this.aimFrom(root, this.head.getWorldPosition(_world), frame.target, _aim)
    clampAngles(_aim, HEAD.maxYaw, HEAD.maxPitch, _limited)
    _limited.yaw *= this.weight
    _limited.pitch *= this.weight
    dampAngles(this.headAngles, _limited, gaze.headChain.lambda * frame.lambdaScale, dt)
    this.chain.forEach((bone, i) => {
      const share = HEAD.shares[i] ?? 0
      this.rotate(bone, this.headAngles.yaw * share, this.headAngles.pitch * share)
    })
    root.updateWorldMatrix(false, true)
  }

  /** Each eye aims from where it sits after the head turned, damped fast. */
  private aimEyes(dt: number, frame: BehaviourFrame) {
    this.eyes.forEach((eye, i) => {
      const angles = this.eyeAngles[i]!
      this.aimFrom(eye, eye.getWorldPosition(_world), frame.target, _aim)
      clampAngles(_aim, EYES.maxYaw, EYES.maxPitch, _limited)
      _limited.yaw *= this.weight
      _limited.pitch *= this.weight
      dampAngles(angles, _limited, gaze.eyes.lambda * frame.lambdaScale, dt)
      this.rotate(eye, angles.yaw, angles.pitch)
    })
  }

  private blink(closure: number) {
    this.lids.forEach((lid, i) => {
      if (!lid) return
      const follow = Math.min(
        LID_FOLLOW_RANGE[1],
        Math.max(LID_FOLLOW_RANGE[0], -(this.eyeAngles[i]?.pitch ?? 0) * LID_FOLLOW),
      )
      // A positive turn about the lid's +X closes it (character.json gaze.blink).
      const angle = follow + (LID_CLOSED - follow) * closure
      lid.quaternion.multiply(_offset.setFromEuler(_euler.set(angle, 0, 0, 'YXZ')))
    })
  }

  /** The jaw follows the wider of the expression and the script, unless a bite shuts it. */
  private moveJaw(dt: number) {
    if (!this.jaw) return
    const biting = this.biting > 0
    if (biting) this.biting -= dt
    const target = biting ? 0 : Math.max(this.jawExpressionDeg, this.jawScriptDeg)
    this.jawDeg = damp(this.jawDeg, target, biting ? BITE_LAMBDA : character.jaw.lambda, dt)
    // Shut, the mouth is only the painted lip line: nothing inside can show through.
    const open = this.jawDeg > 0.5
    for (const part of this.mouthParts) part.visible = open
    this.jaw.quaternion.multiply(
      _offset.setFromEuler(_euler.set(degToRad(this.jawDeg), 0, 0, 'YXZ')),
    )
  }

  /**
   * Turn a bone about an axis of Kelo's own frame (+X his left, +Y up, +Z
   * forward), whatever its local axes: the offset is expressed in the bone's
   * frame and multiplied on, like every other layer.
   */
  private turn(bone: Bone | undefined, axis: Vector3, angle: number) {
    if (!bone || Math.abs(angle) < 1e-5) return
    bone.updateWorldMatrix(true, false)
    bone.getWorldQuaternion(_boneQ)
    _axis.copy(axis).applyQuaternion(_sceneQ).applyQuaternion(_boneQ.invert())
    bone.quaternion.multiply(_offset.setFromAxisAngle(_axis, angle))
  }

  /**
   * Held or flying: legs dangle a little forward with the knees bent and the
   * toes down, and kick in turn; arms rise and flap. A reaction's wiggle
   * sways the upper body side to side.
   */
  private carry() {
    const { carried, kick, wiggle, stillness } = this.carryPose
    if (carried < 1e-3 && Math.abs(wiggle) < 1e-4) return
    this.scene.updateWorldMatrix(true, false)
    this.scene.getWorldQuaternion(_sceneQ)
    this.spine.forEach((bone, i) => this.turn(bone, Z_AXIS, wiggle * (i === 0 ? 0.4 : 0.6)))
    if (carried < 1e-3) return
    const dangle = degToRad(CARRY.legDangleDeg) * carried
    const kickAngle = degToRad(CARRY.legKickDeg) * carried * stillness
    const raise = degToRad(CARRY.armRaiseDeg) * carried
    this.legs.forEach(({ side, thigh, shin, foot }, i) => {
      const swing = Math.sin(kick + i * Math.PI) * kickAngle
      // Forward is a negative turn about +X: the foot swings towards +Z.
      this.turn(thigh, X_AXIS, -(0.45 * dangle + swing))
      this.turn(thigh, Z_AXIS, side * 0.25 * dangle)
      this.turn(shin, X_AXIS, 0.9 * dangle + 0.5 * Math.max(0, swing))
      this.turn(foot, X_AXIS, 0.6 * dangle)
    })
    this.arms.forEach(({ side, upper, fore }, i) => {
      const flap = Math.sin(kick * 1.3 + i * Math.PI * 0.5) * 0.35 * raise * stillness
      this.turn(upper, Z_AXIS, side * (raise + flap))
      this.turn(fore, Z_AXIS, side * 0.3 * raise)
    })
  }

  /** Measure how fast the hips turn, rise and slide, and let the tail lag behind. */
  private swingTail(dt: number) {
    if (!this.hips || this.tailBones.length === 0 || dt <= 0) return
    this.hips.updateWorldMatrix(true, false)
    _forward.set(0, 0, 1).transformDirection(this.hips.matrixWorld)
    const yaw = Math.atan2(_forward.x, _forward.z)
    const { x, y } = this.hips.getWorldPosition(_world)
    if (this.hipsMeasured) {
      let turn = yaw - this.hipsYaw
      if (turn > Math.PI) turn -= 2 * Math.PI
      if (turn < -Math.PI) turn += 2 * Math.PI
      // Sliding sideways swings the tail the other way, like a turn would.
      const slide = (x - this.hipsX) / dt
      stepTail(this.tail, turn / dt - slide * LATERAL_TO_YAW, (y - this.hipsY) / dt, life.tail, dt)
    }
    this.hipsYaw = yaw
    this.hipsX = x
    this.hipsY = y
    this.hipsMeasured = true
    this.tailBones.forEach((bone, i) => {
      const link = this.tail[i]!
      bone.quaternion.multiply(
        _offset.setFromEuler(_euler.set(link.pitch.angle, link.yaw.angle, 0, 'YXZ')),
      )
    })
  }

  private onFinished = (event: { action: AnimationAction }) => {
    if (event.action === this.current && event.action.getClip().name !== this.idle) {
      this.play(this.idle)
    }
  }
}
