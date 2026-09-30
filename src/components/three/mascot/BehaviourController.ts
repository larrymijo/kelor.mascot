/**
 * Glue between the page and the rig's behaviour (docs/interaction-script.md).
 * Input listeners write plain values here through methods; once per frame
 * step() runs the pure logic (the director, the tap streak, the carry
 * physics, blinks), plays what it decides on the rig, and hands the mascot
 * the pose of his root. It outlives rig swaps, so everything carries on when
 * the full model replaces the lite one.
 *
 * Pointer targets for his look sit on a plane facing the viewer,
 * gaze.target.defaultDistanceM in front of his head: the pointer over his
 * face means "look at me", towards a screen edge means "look that way".
 * Picking him up, dropping him and hopping move him on the stage plane
 * (z = 0), inside the screen.
 */
import { Plane, Ray, Vector3, type Camera } from 'three'
import { blinkSoon, createBlink, stepBlink, type BlinkState } from '@/lib/behaviour/blink'
import {
  createBody,
  feetBounds,
  grab,
  holdAt,
  hopTo,
  release,
  stepBody,
  type Bounds,
  type CarryBody,
} from '@/lib/behaviour/carry'
import {
  createDirector,
  directorSettings,
  stepDirector,
  type DirectorInput,
  type DirectorOutput,
  type PointerKind,
} from '@/lib/behaviour/director'
import {
  createStreak,
  isDesktop,
  isDrag,
  nextTapBites,
  registerTap,
  type Capabilities,
  type Reaction,
} from '@/lib/behaviour/interaction'
import { character } from '@/lib/character'
import { damp, dampFactor, degToRad } from '@/lib/math/damp'
import type { Random } from '@/lib/math/random'
import type { BootPhase } from '@/lib/scene/boot'
import { playSound } from '@/lib/sound/bus'
import { live, startBite } from '../live/LiveDriver'
import type { MascotRig } from './MascotRig'

const { gaze, interaction } = character
const H = character.meta.heightM
/** A capsule around Kelo for hit tests, relative to his feet, at his normal size. */
const HIT = { bottom: 0.1 * H, top: 0.88 * H, radius: 0.3 * H }
/**
 * His size for the screen bounds. He nearly fills the screen's height, so
 * carried or flying the top of his head may leave it: a fifth of him.
 */
const BODY = { halfWidthM: 0.3 * H, heightM: 0.8 * H }
/** Where he can be held: from his belly to the top of his head. */
const GRAB = { min: 0.4 * H, max: 0.9 * H }
/** A landing harder than this (m/s) startles him, with a thud (a pat after a hop). */
const HARD_LANDING_MPS = 1.6
const STARTLED_S = 0.7
/** With reduced motion the bite is a jaw snap in place, once the jaw has opened. */
const SNAP_DELAY_S = 0.35
/** Let go faster than this, he was tossed: a whoosh. */
const TOSS_MPS = 1.5
/**
 * Looking at the camera aims at a point at least this far from the head (times
 * Kelo's scale), on the same line, so both eyes stay parallel instead of
 * converging on the nearby lens.
 */
const CAMERA_GAZE_MIN_M = 3

export interface StepContext {
  camera: Camera
  /** Canvas rectangle in viewport pixels (R3F state.size). */
  size: { left: number; top: number; width: number; height: number }
  bootPhase: BootPhase
  reducedMotion: boolean
  gazeEnabled: boolean
}

/** What the mascot applies to his root this frame. */
export interface LiveFrame {
  director: DirectorOutput
  /** Feet, grab height, swing and lean about the grab point, squash. */
  body: CarryBody
  /** 0 standing to 1 held or flying: how much the carried pose shows. */
  carried: number
}

type Queued = { kind: 'tap' } | { kind: 'hop'; x: number } | { kind: 'step'; direction: -1 | 1 }

// Scratch objects: step() and the input methods never run re-entrantly.
const _ray = new Ray()
const _gazePlane = new Plane(new Vector3(0, 0, 1), 0)
const _stage = new Plane(new Vector3(0, 0, 1), 0)
const _wanted = new Vector3()
const _head = new Vector3()
const _scale = new Vector3()
const _bottom = new Vector3()
const _top = new Vector3()
const _onSegment = new Vector3()
const _hit = new Vector3()

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
  private touchFirst = false
  private blinkPending = false

  // Interaction
  private device = { finePointer: false, canHover: false, widthPx: 0 }
  private caps: Capabilities = { desktop: false, reducedMotion: false }
  private readonly streak = createStreak()
  private readonly body = createBody(0)
  private bounds: Bounds = { xMin: -1, xMax: 1, yMax: 1 }
  private press: { x: number; y: number; grabY: number } | null = null
  private floorPress: { x: number; y: number } | null = null
  private dragging = false
  private readonly queue: Queued[] = []
  private reaction: { spec: Reaction; startS: number; untilS: number } | null = null
  private startledUntilS = -Infinity
  private snapAtS = Infinity
  private carried = 0
  private kick = 0
  private lastCtx: StepContext | null = null
  private readonly frame: LiveFrame

  constructor(private readonly random: Random = Math.random) {
    this.blinkState = createBlink(0, gaze.blink, random)
    this.frame = { director: this.memory.out, body: this.body, carried: 0 }
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

  /** The device's pointer and screen, which decide whether he can be dragged and bite. */
  setDevice(device: { finePointer: boolean; canHover: boolean; widthPx: number }) {
    this.device = device
  }

  /** Whether the pointer is over Kelo now, for the grab cursor. */
  hovers(clientX: number, clientY: number) {
    const ctx = this.lastCtx
    return Boolean(ctx && this.interactive(ctx) && this.hitsKelo(clientX, clientY, ctx))
  }

  /**
   * A press anywhere outside links and buttons. On Kelo it may become a tap
   * or a drag; elsewhere a click on the stage sends him hopping there.
   * Returns whether it landed on him.
   */
  pressAt(clientX: number, clientY: number) {
    this.press = null
    this.floorPress = null
    const ctx = this.lastCtx
    if (!ctx || !this.interactive(ctx)) return false
    const grabY = this.hitsKelo(clientX, clientY, ctx)
    if (grabY === null) {
      this.floorPress = { x: clientX, y: clientY }
      return false
    }
    this.press = { x: clientX, y: clientY, grabY }
    return true
  }

  /** The pointer moved while pressed: past a few pixels on desktop, he is picked up. */
  dragTo(clientX: number, clientY: number) {
    const ctx = this.lastCtx
    if (!this.press || !ctx) return
    if (!this.dragging) {
      if (!isDrag(this.press, clientX, clientY, this.caps, interaction)) return
      if (!this.interactive(ctx) || this.body.mode === 'air') return
      this.dragging = true
      this.reaction = null
      live.kelo.touched = true
      grab(this.body, this.press.grabY)
      playSound('squeak')
    }
    if (this.onStage(clientX, clientY, ctx, _hit)) holdAt(this.body, _hit.x, _hit.y)
  }

  /** The press ended: a drop, a tap on him, or a click on the stage. */
  lift(clientX: number, clientY: number) {
    const ctx = this.lastCtx
    if (this.dragging) {
      release(this.body, interaction)
      this.dragging = false
      if (Math.hypot(this.body.vx, this.body.vy) > TOSS_MPS) playSound('toss')
    } else if (this.press) {
      this.queue.push({ kind: 'tap' })
    } else if (this.floorPress && ctx) {
      const moved = Math.hypot(clientX - this.floorPress.x, clientY - this.floorPress.y)
      if (moved <= interaction.taps.dragThresholdPx && this.onStage(clientX, clientY, ctx, _hit))
        this.queue.push({ kind: 'hop', x: _hit.x })
    }
    this.press = null
    this.floorPress = null
  }

  /** The keyboard button on Kelo: Enter or Space taps him, the arrows make him hop. */
  key(action: 'tap' | 'left' | 'right') {
    if (action === 'tap') this.queue.push({ kind: 'tap' })
    else this.queue.push({ kind: 'step', direction: action === 'left' ? -1 : 1 })
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

  /** A press on him is down: it may become a tap, or on desktop a pick-up. */
  get pressing() {
    return this.press !== null
  }

  /** On desktop the sixth tap bites: presses on him preload the synthesiser. */
  get canBite() {
    return this.caps.desktop
  }

  /** Whether a tap now would bite: that press wakes the audio engine. */
  get nextTapBites() {
    return nextTapBites(this.streak, this.clock, this.caps, interaction)
  }

  /** Being held or thrown, for the debug readout and the cursor. */
  get held() {
    return this.dragging
  }

  // Frame --------------------------------------------------------------------------

  /**
   * One frame: the queued taps and hops, the physics, the director, the look
   * and the layers on the rig. The caller mirrors the director's expression
   * and attention into the store and applies the root pose.
   */
  step(dt: number, rig: MascotRig, ctx: StepContext): LiveFrame {
    this.clock += dt
    this.lastCtx = ctx
    this.caps = {
      desktop: isDesktop(this.device, interaction),
      reducedMotion: ctx.reducedMotion,
    }
    // The bite moves the camera in close: keep the bounds of the hero shot.
    if (ctx.bootPhase === 'ready' && live.sample.biteS === null) this.bounds = this.stageBounds(ctx)
    for (const event of this.queue) this.handle(event, rig, ctx)
    this.queue.length = 0

    const hopping = this.body.planted
    stepBody(this.body, dt, this.bounds, interaction)
    if (this.body.landed > 0) {
      if (this.body.landed > HARD_LANDING_MPS) {
        playSound(hopping ? 'pat' : 'thud')
        this.startledUntilS = this.clock + STARTLED_S
      }
      this.body.landed = 0
    }
    if (this.clock >= this.snapAtS) {
      rig.bite()
      playSound('chomp')
      playSound('biteEnd')
      this.snapAtS = Infinity
    }
    if (this.reaction && this.clock >= this.reaction.untilS) this.reaction = null

    const out = stepDirector(
      this.memory,
      {
        nowS: this.clock,
        bootPhase: ctx.bootPhase,
        pointer: this.pointer,
        ctaActive: this.cta.hover || this.cta.focus,
        reducedMotion: ctx.reducedMotion,
        touchFirst: this.touchFirst,
        override: this.override(),
      },
      this.settings,
      this.random,
    )
    rig.setIdleClip(out.idleClip)

    // The carried pose fades in as he leaves the floor and out as he lands.
    const airborne = this.body.mode === 'rest' ? 0 : 1
    this.carried = damp(this.carried, airborne, 3 / interaction.carry.blendS, dt)
    const speed = Math.hypot(this.body.vx, this.body.vy)
    this.kick += dt * (5 + 9 * Math.min(1, speed / 2))
    rig.setCarry({
      carried: this.carried,
      kick: this.kick,
      wiggle: this.wiggle(),
      stillness: ctx.reducedMotion ? 0.4 : 1,
    })
    rig.setJawScript(
      live.sample.biteS !== null
        ? live.sample.jaw * character.jaw.maxOpenDeg
        : (this.reaction?.spec.jawDeg ?? 0),
    )

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

    live.kelo.state =
      live.sample.biteS !== null
        ? 'bite'
        : this.body.mode === 'held'
          ? 'held'
          : this.body.mode === 'air'
            ? 'air'
            : this.reaction
              ? 'react'
              : 'rest'
    live.kelo.reaction = this.reaction?.spec.name ?? ''
    this.frame.director = out
    this.frame.carried = this.carried
    return this.frame
  }

  private handle(event: Queued, rig: MascotRig, ctx: StepContext) {
    if (!this.interactive(ctx) || this.body.mode === 'held') return
    live.kelo.touched = true
    if (event.kind === 'tap') {
      const outcome = registerTap(this.streak, this.clock, this.caps, interaction)
      if (outcome.kind === 'bite') {
        this.reaction = null
        startBite()
        return
      }
      const spec = outcome.reaction
      this.reaction = { spec, startS: this.clock, untilS: this.clock + spec.durationS }
      if (spec.clip) rig.play(spec.clip)
      if (spec.sound) playSound(spec.sound)
      if (outcome.kind === 'snap') {
        // The bite without the motion: heard like the bite, before the sound is on.
        playSound('biteStart')
        this.snapAtS = this.clock + SNAP_DELAY_S
      }
      return
    }
    if (this.body.mode !== 'rest') return
    const x = event.kind === 'hop' ? event.x : this.body.x + event.direction * interaction.hop.stepM
    hopTo(this.body, x, this.bounds, interaction)
    rig.play('jump')
  }

  /** What an interaction imposes on the director right now. */
  private override(): DirectorInput['override'] {
    const { sample } = live
    if (sample.biteS !== null) return { gaze: sample.gaze, expression: sample.expression }
    if (this.body.mode === 'held') return { gaze: null, expression: 'surprised' }
    if (this.clock < this.startledUntilS) return { gaze: null, expression: 'surprised' }
    if (this.reaction) {
      const expression = this.reaction.spec.expression as DirectorOutput['expression']
      return { gaze: 'camera', expression }
    }
    return null
  }

  /** A reaction's side-to-side wiggle, fading out over its length. */
  private wiggle() {
    if (!this.reaction || this.reaction.spec.wiggleDeg === 0) return 0
    const { spec, startS } = this.reaction
    const t = this.clock - startS
    const fade = Math.max(0, 1 - t / spec.durationS)
    return degToRad(spec.wiggleDeg) * Math.sin(t * Math.PI * 2 * 3.5) * fade
  }

  /** He answers only once hatched, and not while biting. */
  private interactive(ctx: StepContext) {
    return ctx.bootPhase === 'ready' && live.sample.biteS === null
  }

  /** Where the director wants Kelo to look, written into _wanted. */
  private aim(out: DirectorOutput, rig: MascotRig, ctx: StepContext) {
    const head = rig.bones.get('head')
    if (head) head.getWorldPosition(_head)
    else _head.set(this.body.x, this.body.y + 0.8 * H, 0)
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
      default: {
        const scale = head ? head.getWorldScale(_scale).y : 1
        ctx.camera.getWorldPosition(_wanted).sub(_head)
        _wanted.setLength(Math.max(_wanted.length(), CAMERA_GAZE_MIN_M * scale)).add(_head)
      }
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
    _gazePlane.constant = -(_head.z + gaze.target.defaultDistanceM)
    if (!this.rayThrough(x, y, ctx.camera).intersectPlane(_gazePlane, _wanted)) {
      ctx.camera.getWorldPosition(_wanted)
    }
  }

  /** The point under a screen position on the stage plane, where he moves. */
  private onStage(clientX: number, clientY: number, ctx: StepContext, out: Vector3) {
    const ray = this.rayThrough(this.toNdcX(clientX, ctx), this.toNdcY(clientY, ctx), ctx.camera)
    return ray.intersectPlane(_stage, out) !== null
  }

  /** Where his feet may go: the screen at his depth, less his size. */
  private stageBounds(ctx: StepContext): Bounds {
    const at = (x: number, y: number) =>
      this.rayThrough(x, y, ctx.camera).intersectPlane(_stage, _hit) ? _hit.clone() : null
    const left = at(-1, 0)
    const right = at(1, 0)
    const top = at(0, 1)
    if (!left || !right || !top) return this.bounds
    return feetBounds({ left: left.x, right: right.x, top: top.y }, BODY, interaction.fall.marginM)
  }

  /**
   * Whether a screen position is on Kelo, wherever he stands: the height
   * above his feet where it hits him (for picking him up there), or null.
   */
  private hitsKelo(clientX: number, clientY: number, ctx: StepContext) {
    const { x, y } = this.body
    const scale = live.sample.scale
    _bottom.set(x, y + HIT.bottom * scale, 0)
    _top.set(x, y + HIT.top * scale, 0)
    const ray = this.rayThrough(this.toNdcX(clientX, ctx), this.toNdcY(clientY, ctx), ctx.camera)
    const radius = HIT.radius * scale
    if (ray.distanceSqToSegment(_bottom, _top, undefined, _onSegment) > radius * radius) return null
    return Math.min(GRAB.max, Math.max(GRAB.min, _onSegment.y - y))
  }
}
