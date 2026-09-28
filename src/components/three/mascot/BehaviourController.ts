/**
 * Glue between the page and the rig's behaviour layers. Input listeners write
 * plain values here through methods; once per frame step() runs the pure
 * director, turns its attention into a smoothed point in the world, schedules
 * blinks, and hands the rig one BehaviourFrame. It outlives rig swaps, so the
 * director, the blink rhythm and the target carry on when the full model
 * replaces the lite one.
 *
 * Pointer targets sit on a plane facing the viewer, gaze.target.defaultDistanceM
 * in front of Kelo's head: the pointer over his face means "look at me",
 * towards a screen edge means "look that way".
 */
import { Plane, Ray, Vector3, type Camera } from 'three'
import { blinkSoon, createBlink, stepBlink, type BlinkState } from '@/lib/behaviour/blink'
import {
  createDirector,
  directorSettings,
  stepDirector,
  type DirectorInput,
  type DirectorOutput,
  type PointerKind,
} from '@/lib/behaviour/director'
import { character } from '@/lib/character'
import { dampFactor } from '@/lib/math/damp'
import type { Random } from '@/lib/math/random'
import type { BootPhase } from '@/lib/scene/boot'
import type { MascotRig } from './MascotRig'

const { gaze } = character
const H = character.meta.heightM
/** A capsule around Kelo for click and tap hit tests, in world space (feet at the origin). */
const HIT = {
  bottom: new Vector3(0, 0.1 * H, 0),
  top: new Vector3(0, 0.88 * H, 0),
  radius: 0.3 * H,
}

export interface StepContext {
  camera: Camera
  /** Canvas rectangle in viewport pixels (R3F state.size). */
  size: { left: number; top: number; width: number; height: number }
  bootPhase: BootPhase
  reducedMotion: boolean
  gazeEnabled: boolean
  /** What the scroll script imposes past the first screen, or null. */
  script: DirectorInput['script']
}

// Scratch objects: step() runs once per frame, never re-entrantly.
const _ray = new Ray()
const _plane = new Plane(new Vector3(0, 0, 1), 0)
const _wanted = new Vector3()
const _head = new Vector3()

export class BehaviourController {
  readonly target = new Vector3()
  private readonly memory = createDirector()
  private readonly settings = directorSettings(character)
  private readonly blinkState: BlinkState
  private clock = 0
  private targetReady = false
  private pointer: {
    clientX: number
    clientY: number
    kind: PointerKind
    lastActiveS: number
  } | null = null
  private readonly cta = { hover: false, focus: false, clientX: 0, clientY: 0 }
  private pendingTap: { clientX: number; clientY: number } | null = null
  private tapS: number | null = null
  private touchFirst = false
  private blinkPending = false

  constructor(private readonly random: Random = Math.random) {
    this.blinkState = createBlink(0, gaze.blink, random)
  }

  // Input, called from DOM listeners ------------------------------------------------

  pointerAt(clientX: number, clientY: number, kind: string) {
    const pointerKind: PointerKind = kind === 'touch' || kind === 'pen' ? kind : 'mouse'
    if (this.pointer) {
      this.pointer.clientX = clientX
      this.pointer.clientY = clientY
      this.pointer.kind = pointerKind
      this.pointer.lastActiveS = this.clock
    } else {
      this.pointer = { clientX, clientY, kind: pointerKind, lastActiveS: this.clock }
    }
  }

  /** The mouse left the window: stop following it straight away. */
  pointerLeft() {
    if (this.pointer) this.pointer.lastActiveS = -Infinity
  }

  /** A click or tap that did not land on a link or button; tested against Kelo next frame. */
  tap(clientX: number, clientY: number) {
    this.pendingTap = { clientX, clientY }
  }

  /** A data-gaze-target element gained hover or keyboard focus. */
  attend(
    how: 'hover' | 'focus',
    rect: { left: number; top: number; width: number; height: number },
  ) {
    this.cta[how] = true
    this.cta.clientX = rect.left + rect.width / 2
    this.cta.clientY = rect.top + rect.height / 2
  }

  release(how: 'hover' | 'focus') {
    this.cta[how] = false
  }

  setTouchFirst(value: boolean) {
    this.touchFirst = value
  }

  requestBlink() {
    this.blinkPending = true
  }

  // Frame --------------------------------------------------------------------------

  /**
   * Run the director and the layers for one frame. The caller mirrors the
   * returned expression and attention into the store; the rig reads the
   * expression from there, so the debug panel can still override it.
   */
  step(dt: number, rig: MascotRig, ctx: StepContext): DirectorOutput {
    this.clock += dt
    if (this.pendingTap) {
      if (this.hitsKelo(this.pendingTap.clientX, this.pendingTap.clientY, ctx))
        this.tapS = this.clock
      this.pendingTap = null
    }

    const out = stepDirector(
      this.memory,
      {
        nowS: this.clock,
        bootPhase: ctx.bootPhase,
        pointer: this.pointer,
        ctaActive: this.cta.hover || this.cta.focus,
        tapS: this.tapS,
        reducedMotion: ctx.reducedMotion,
        touchFirst: this.touchFirst,
        script: ctx.script,
      },
      this.settings,
      this.random,
    )
    if (out.reaction === 'hop') rig.play('jump')
    rig.setIdleClip(out.idleClip)

    this.aim(out, rig, ctx)
    const lambdaScale = ctx.reducedMotion
      ? character.accessibility.reducedMotion.gazeLambdaScale
      : 1
    if (this.targetReady) {
      this.target.lerp(_wanted, dampFactor(gaze.target.lambda * lambdaScale, dt))
    } else {
      this.target.copy(_wanted)
      this.targetReady = true
    }

    if (this.blinkPending) {
      blinkSoon(this.blinkState, this.clock)
      this.blinkPending = false
    }
    const blink = stepBlink(this.blinkState, this.clock, gaze.blink, this.random)
    rig.behave(dt, {
      target: this.target,
      weight: ctx.gazeEnabled ? out.gazeWeight : 0,
      blink,
      lambdaScale,
    })
    return out
  }

  /** Where the director wants Kelo to look, written into _wanted. */
  private aim(out: DirectorOutput, rig: MascotRig, ctx: StepContext) {
    const head = rig.bones.get('head')
    if (head) head.getWorldPosition(_head)
    else _head.set(0, 0.8 * H, 0)
    switch (out.attention) {
      case 'cta':
        this.onPlane(this.toNdcX(this.cta.clientX, ctx), this.toNdcY(this.cta.clientY, ctx), ctx)
        break
      case 'pointer':
        this.onPlane(
          this.toNdcX(this.pointer!.clientX, ctx),
          this.toNdcY(this.pointer!.clientY, ctx),
          ctx,
        )
        break
      case 'glance':
        this.onPlane(out.glance.x, out.glance.y, ctx)
        break
      default:
        ctx.camera.getWorldPosition(_wanted)
    }
  }

  private toNdcX(clientX: number, ctx: StepContext) {
    return ((clientX - ctx.size.left) / Math.max(1, ctx.size.width)) * 2 - 1
  }

  private toNdcY(clientY: number, ctx: StepContext) {
    return -((clientY - ctx.size.top) / Math.max(1, ctx.size.height)) * 2 + 1
  }

  private rayThrough(x: number, y: number, camera: Camera) {
    _ray.origin.setFromMatrixPosition(camera.matrixWorld)
    _ray.direction.set(x, y, 0.5).unproject(camera).sub(_ray.origin).normalize()
    return _ray
  }

  /** The point under screen position (x, y) on the plane in front of the head. */
  private onPlane(x: number, y: number, ctx: StepContext) {
    _plane.constant = -(_head.z + gaze.target.defaultDistanceM)
    if (!this.rayThrough(x, y, ctx.camera).intersectPlane(_plane, _wanted)) {
      ctx.camera.getWorldPosition(_wanted)
    }
  }

  private hitsKelo(clientX: number, clientY: number, ctx: StepContext) {
    const ray = this.rayThrough(this.toNdcX(clientX, ctx), this.toNdcY(clientY, ctx), ctx.camera)
    return ray.distanceSqToSegment(HIT.bottom, HIT.top) <= HIT.radius * HIT.radius
  }
}
