'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Color,
  Plane,
  Ray,
  Vector3,
  type Camera,
  type Group,
  type Mesh,
  type MeshStandardMaterial,
} from 'three'
import { character } from '@/lib/character'
import { degToRad, smoothstep } from '@/lib/math/damp'
import { createDrop, stepDrop, type Drop } from '@/lib/scene/drop'
import { onDropEgg, type DropPoint } from '@/lib/showcase/state'
import { playSound } from '@/lib/sound/bus'
import { live } from '../live/LiveDriver'
import { useScene } from '../store'
import { buildEggPieces } from './geometry'
import { EggShell } from './shell'

const egg = character.egg
const glow = new Color(
  character.colors.mascot[egg.crackGlow as keyof typeof character.colors.mascot],
)
/** A landing faster than this (m/s) makes a sound. */
const THUD_MPS = 1.2
/** How far the egg's centre keeps from the screen's sides (metres), so it lands whole. */
const SIDE_M = egg.radiusM + character.interaction.fall.marginM

const easeIn = (t: number) => t * t
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)

const _ray = new Ray()
const _stage = new Plane(new Vector3(0, 0, 1), 0)
const _top = new Vector3()

/** Where the ray through a screen position (NDC) meets the stage plane, across it. */
function stageX(ndcX: number, ndcY: number, camera: Camera) {
  _ray.origin.setFromMatrixPosition(camera.matrixWorld)
  _ray.direction.set(ndcX, ndcY, 0.5).unproject(camera).sub(_ray.origin).normalize()
  return _ray.intersectPlane(_stage, _top) ? _top.x : null
}

/** Where on the stage the egg lands for a press, kept inside the screen. */
function dropX(
  at: DropPoint,
  camera: Camera,
  size: { left: number; top: number; width: number; height: number },
) {
  const x = stageX(
    ((at.clientX - size.left) / Math.max(1, size.width)) * 2 - 1,
    -((at.clientY - size.top) / Math.max(1, size.height)) * 2 + 1,
    camera,
  )
  const left = stageX(-1, 0, camera)
  const right = stageX(1, 0, camera)
  if (x === null || left === null || right === null || right - left < 2 * SIDE_M) return 0
  return Math.min(right - SIDE_M, Math.max(left + SIDE_M, x))
}

/**
 * The dinosaur egg the visitor drops on the empty stage
 * (docs/interaction-script.md). It falls from above the top of the screen to
 * where the click landed, lands with a squash and a couple of smaller
 * bounces, then rocks on its base while its cracks open, and breaks along
 * them into two halves and a cap when the boot sequence hatches Kelo.
 * Until then it is one seamless shell with the cracks drawn on it; the
 * pieces only appear for the burst. The light inside is kept low: the egg
 * should read as a finely made object, not a lamp. Reduced motion: it
 * appears on the floor, still, and the boot machine cuts to the mascot.
 *
 * It answers the drop itself (the page's `dropEgg`), outside the mascot's
 * Suspense boundary, so it falls at once even while the model still loads;
 * Kelo follows it there once he mounts.
 */
export function Egg() {
  const phase = useScene((s) => s.boot.phase)
  const pieces = useMemo(() => buildEggPieces(egg), [])
  const shell = useMemo(() => new EggShell(egg, glow), [])
  const root = useRef<Group>(null)
  const group = useRef<Group>(null)
  const whole = useRef<Mesh>(null)
  /** Pivot groups on the outer edge of each half, so they tip over outwards. */
  const left = useRef<Group>(null)
  const right = useRef<Group>(null)
  /** Pivot at the cap's centre, so it spins about itself as it pops. */
  const cap = useRef<Group>(null)
  const core = useRef<Mesh>(null)
  const coreMaterial = useRef<MeshStandardMaterial>(null)
  const time = useRef(0)
  const drop = useRef<Drop | null>(null)
  /** Seconds since the egg settled, for the wobble and the cracks. */
  const settled = useRef(0)

  useEffect(
    () => () => {
      for (const geometry of [pieces.whole, pieces.left, pieces.right, pieces.cap, pieces.core])
        geometry.dispose()
    },
    [pieces],
  )
  useEffect(() => () => shell.dispose(), [shell])

  const get = useThree((s) => s.get)
  useEffect(
    () =>
      onDropEgg((at) => {
        const scene = useScene.getState()
        if (scene.boot.phase !== 'waiting' || scene.dropRequested) return
        const { camera, size } = get()
        live.egg.x = at ? dropX(at, camera, size) : 0
        scene.requestDrop()
      }),
    [get],
  )

  useFrame((state, delta) => {
    if (!root.current || !group.current || !whole.current || !left.current) return
    if (!right.current || !cap.current || !core.current) return
    const scene = useScene.getState()
    const reduced = scene.reducedMotion
    const dt = Math.min(delta, 0.1)
    // Before the drop the egg is drawn at a speck's size, out of sight, so its
    // shader compiles while the stage waits and the fall starts on time.
    if (scene.boot.phase === 'waiting') {
      root.current.scale.setScalar(1e-4)
      return
    }
    time.current += dt

    // The drop starts just above the top of the screen, over the click.
    if (!drop.current) {
      _ray.origin.setFromMatrixPosition(state.camera.matrixWorld)
      _ray.direction.set(0, 1, 0.5).unproject(state.camera).sub(_ray.origin).normalize()
      const top = _ray.intersectPlane(_stage, _top) ? _top.y : 2.5
      drop.current = createDrop(reduced ? 0 : Math.max(1.2, top + 0.15))
    }
    const fall = stepDrop(drop.current, dt, egg.drop)
    if (fall.landed > 0) {
      if (fall.landed > THUD_MPS) playSound('pat')
      fall.landed = 0
    }
    if (fall.settled) settled.current += dt
    root.current.position.set(live.egg.x, fall.y, 0)
    live.egg.y = fall.y
    // Squashed on landing, the egg keeps its volume.
    const squash = reduced ? 0 : fall.squash
    root.current.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5)

    const hatch =
      scene.boot.phase === 'hatching' || scene.boot.phase === 'ready' ? scene.boot.hatchProgress : 0
    const broken = hatch > 0
    const since = settled.current

    // Rocking from the base once it has settled, stronger as it gets ready to hatch.
    const eagerness = smoothstep(0.2, egg.minDisplayS, since)
    const amplitude = reduced
      ? 0
      : degToRad(egg.wobble.maxAngleDeg) * (0.25 + 0.75 * eagerness) * (1 - hatch)
    const phaseAngle = 2 * Math.PI * egg.wobble.frequencyHz * time.current
    group.current.rotation.z = fall.settled ? amplitude * Math.sin(phaseAngle) : 0
    group.current.rotation.x = fall.settled
      ? amplitude * 0.35 * Math.sin(phaseAngle * 0.7 + 1.3)
      : 0

    // Whole while it waits; the pieces take over for the burst.
    whole.current.visible = !broken
    left.current.visible = broken
    right.current.visible = broken
    cap.current.visible = broken

    // The cracks open after the landing, faintly lit from inside, and flare a little as it bursts.
    const cracks = Math.min(
      1,
      smoothstep(0.3, egg.minDisplayS, since) * Math.max(0.35, scene.loadProgress) + hatch,
    )
    const flash = reduced ? 0 : Math.sin(Math.min(1, hatch * 2.2) * Math.PI) * 1.6
    shell.setCracks(cracks, 0.12 + 0.35 * cracks + flash)

    // The halves fall outwards and the cap pops, spinning.
    const gap = 0.006
    const tip = easeIn(smoothstep(0.1, 0.9, hatch))
    const hinge = pieces.halfWidth
    const slide = easeOut(hatch) * 0.12
    left.current.position.set(-hinge - gap - slide, 0, 0)
    left.current.rotation.z = tip * 1.35
    right.current.position.set(hinge + gap + slide, 0, 0)
    right.current.rotation.z = -tip * 1.35

    const pop = Math.sin(Math.min(1, hatch * 1.4) * Math.PI) * 0.45 + hatch * 0.3
    cap.current.position.y = pieces.capCenterY + gap * 1.5 + pop
    cap.current.rotation.x = hatch * 2.4
    cap.current.rotation.z = hatch * 0.8

    const shrink = 1 - smoothstep(0.55, 1, hatch)
    left.current.scale.setScalar(shrink)
    right.current.scale.setScalar(shrink)
    cap.current.scale.setScalar(shrink)

    // A dim warmth shows through the gaps as the pieces part.
    if (coreMaterial.current) coreMaterial.current.emissiveIntensity = 0.25 + 0.5 * cracks + flash
    core.current.scale.setScalar(1 - smoothstep(0.35, 0.7, hatch))
  })

  if (phase === 'ready') return null

  return (
    <group ref={root}>
      <group ref={group}>
        <mesh ref={core} geometry={pieces.core}>
          <meshStandardMaterial
            ref={coreMaterial}
            color="#000000"
            emissive={glow}
            emissiveIntensity={0.25}
          />
        </mesh>
        <mesh
          ref={whole}
          geometry={pieces.whole}
          material={shell.material}
          castShadow
          receiveShadow
        />
        <group ref={left} position-x={-pieces.halfWidth} visible={false}>
          <mesh
            geometry={pieces.left}
            material={shell.material}
            position-x={pieces.halfWidth}
            castShadow
            receiveShadow
          />
        </group>
        <group ref={right} position-x={pieces.halfWidth} visible={false}>
          <mesh
            geometry={pieces.right}
            material={shell.material}
            position-x={-pieces.halfWidth}
            castShadow
            receiveShadow
          />
        </group>
        <group ref={cap} position-y={pieces.capCenterY} visible={false}>
          <mesh
            geometry={pieces.cap}
            material={shell.material}
            position-y={-pieces.capCenterY}
            castShadow
            receiveShadow
          />
        </group>
      </group>
    </group>
  )
}
