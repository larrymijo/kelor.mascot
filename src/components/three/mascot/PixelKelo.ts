import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three'
import { character } from '@/lib/character'
import { kelo, PALETTE, type KeloFrame } from '@/lib/game/sprites'
import { lowestRow, voxelHeight, voxelize, type Voxel } from '@/lib/game/voxels'

const H = character.meta.heightM
const FRAMES: readonly KeloFrame[] = ['runA', 'runB', 'jump', 'hurt']
/** Blocks are this many times deeper than wide: a chunky toy, not a flat card. */
const DEPTH = 3
/** A hop at each reaction: how long, and how many blocks high. */
const HOP_S = 0.36
const HOP_BLOCKS = 3
/** The idle bob: one block up and down, a step at a time, like a sprite. */
const BOB_S = 0.55
/** How much of the transformation one block's growth spans, as it sweeps up. */
const SWEEP = 0.35

const _matrix = new Matrix4()
const _position = new Vector3()
const _scale = new Vector3()
const _turn = new Quaternion()

export interface PixelPose {
  /** The transformation, 0 the 3D model to 1 all blocks. */
  amount: number
  /** live.kelo.state: rest, react, held, air or bite. */
  state: string
  /** live.kelo.acts: a new reaction or action makes him hop. */
  acts: number
  /** Where he stands across the stage (metres), to face the way he moves. */
  x: number
  xray: boolean
  reducedMotion: boolean
}

/**
 * The runner's Kelo as blocks (docs/interaction-script.md): what the sandbox's
 * size slider turns him into at its small end. Each coloured pixel of the
 * game's sprite is a block, the standing pose as tall as the 3D Kelo, so it
 * takes his place in the same carried, squashed and turned group. It keeps
 * the game's frames: standing with a stepped bob, tucked in the air, dizzy
 * when picked up, and a hop at every reaction. The blocks sweep up from the
 * feet as he transforms, and away again as he grows back.
 *
 * One instanced mesh, one draw call, a few hundred blocks; a class, so the
 * React Compiler leaves its three.js mutations alone.
 */
export class PixelKelo {
  readonly group = new Group()
  private readonly mesh: InstancedMesh
  private readonly material: MeshStandardMaterial
  private readonly frames: Record<KeloFrame, Voxel[]>
  private readonly colors = new Map<number, Color>()
  private readonly block: number
  private shown: KeloFrame | null = null
  private applied = -1
  private acts = 0
  private hopS = Infinity
  private clock = 0
  private facing = 1
  private lastX: number | null = null

  constructor() {
    // Every frame on the standing frame's floor, so tucked legs lift off it.
    const floor = lowestRow(kelo('runA'))
    this.frames = Object.fromEntries(
      FRAMES.map((frame) => [frame, voxelize(kelo(frame), floor)]),
    ) as Record<KeloFrame, Voxel[]>
    this.block = H / voxelHeight(this.frames.runA)
    const most = Math.max(...FRAMES.map((frame) => this.frames[frame].length))
    this.material = new MeshStandardMaterial({ roughness: 0.55, metalness: 0 })
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), this.material, most)
    this.mesh.castShadow = true
    this.mesh.frustumCulled = false
    this.group.add(this.mesh)
    this.group.visible = false
  }

  /** One frame: the pose, then the blocks when the frame or the transformation changed. */
  update(dt: number, pose: PixelPose) {
    this.group.visible = pose.amount > 0
    if (!this.group.visible) {
      this.lastX = null
      return
    }
    this.clock += dt
    this.hopS += dt
    if (pose.acts !== this.acts) {
      this.acts = pose.acts
      this.hopS = 0
    }

    // Facing the way he moves, like the sprite in the game.
    if (this.lastX !== null && Math.abs(pose.x - this.lastX) > 1e-3)
      this.facing = Math.sign(pose.x - this.lastX)
    this.lastX = pose.x
    this.group.scale.x = this.facing

    const hopping = this.hopS < HOP_S
    const frame: KeloFrame =
      pose.state === 'held' ? 'hurt' : pose.state === 'air' || hopping ? 'jump' : 'runA'
    const bob = pose.reducedMotion ? 0 : Math.floor(this.clock / BOB_S) % 2
    const hop =
      hopping && !pose.reducedMotion ? Math.sin((Math.PI * this.hopS) / HOP_S) * HOP_BLOCKS : 0
    this.group.position.y = (frame === 'runA' ? bob : 0) * this.block + hop * this.block

    this.material.wireframe = pose.xray
    if (frame === this.shown && pose.amount === this.applied) return
    this.shown = frame
    this.applied = pose.amount
    this.place(this.frames[frame], pose.amount)
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.mesh.dispose()
  }

  /** Lay the blocks out; mid-transformation the lower ones have grown, the upper ones not yet. */
  private place(voxels: Voxel[], amount: number) {
    const b = this.block
    voxels.forEach((voxel, i) => {
      const grown = Math.min(1, Math.max(0, (amount * (1 + SWEEP) - voxel.rise) / SWEEP))
      const size = grown * (2 - grown) // ease out
      _position.set(voxel.x * b, voxel.y * b, 0)
      _scale.set(b * size, b * size, b * DEPTH * size)
      this.mesh.setMatrixAt(i, _matrix.compose(_position, _turn, _scale))
      this.mesh.setColorAt(i, this.color(voxel.color))
    })
    this.mesh.count = voxels.length
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  private color(index: number) {
    let color = this.colors.get(index)
    if (!color) {
      color = new Color(PALETTE[index] || '#000000')
      this.colors.set(index, color)
    }
    return color
  }
}
