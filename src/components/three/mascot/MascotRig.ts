/**
 * Imperative wrapper around a loaded mascot: clone, bones, animation mixer,
 * expression atlas and plate glow. Keeping the three.js mutations behind
 * methods keeps React components declarative. Everything is found by the
 * contract's names, so the phase 3 model drops in without code changes.
 */
import {
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  type AnimationAction,
  type AnimationClip,
  type Bone,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type Texture,
} from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { character } from '@/lib/character'

const CROSS_FADE_S = 0.25
const loops = new Map(character.clips.required.map((clip) => [clip.name, clip.loop]))
const { cells, grid } = character.expressions

export type ExpressionName = keyof typeof cells

function findMaterial(root: Object3D, name: string) {
  let found: Material | undefined
  root.traverse((object) => {
    const material = (object as Mesh).material as Material | undefined
    if (!found && material && !Array.isArray(material) && material.name === name) found = material
  })
  return found
}

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

  constructor(gltf: { scene: Object3D; animations: AnimationClip[] }) {
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

    this.mixer = new AnimationMixer(this.scene)
    this.actions = new Map(gltf.animations.map((clip) => [clip.name, this.mixer.clipAction(clip)]))
    this.faceMap =
      (findMaterial(this.scene, 'face') as MeshStandardMaterial | undefined)?.map ?? undefined
    this.plates = findMaterial(this.scene, 'plates') as MeshStandardMaterial | undefined
    this.mixer.addEventListener('finished', this.onFinished)
  }

  get currentClip() {
    return this.current?.getClip().name ?? null
  }

  /** Play a contract clip; loops follow character.json, one-shots return to idle. */
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

  update(dt: number) {
    this.mixer.update(dt)
  }

  /** Switch the face atlas cell by UV offset. */
  setExpression(name: ExpressionName) {
    if (!this.faceMap || name === this.expression) return
    this.expression = name
    const [col, row] = cells[name] ?? cells[character.expressions.default as ExpressionName]!
    this.faceMap.offset.set(col / grid[0], row / grid[1])
  }

  setPlateGlow(intensity: number) {
    if (this.plates) this.plates.emissiveIntensity = intensity
  }

  dispose() {
    this.mixer.removeEventListener('finished', this.onFinished)
    this.mixer.stopAllAction()
  }

  private onFinished = (event: { action: AnimationAction }) => {
    if (event.action === this.current && event.action.getClip().name !== 'idle') this.play('idle')
  }
}
