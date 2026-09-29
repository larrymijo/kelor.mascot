'use client'

/**
 * The finale: the two halves of the KELOR mark, the same halves the egg split
 * into, fly in from either side and lock together behind Kelo, so the
 * hexagon frames him. Driven by the script's logo channel (0 hidden, 1
 * locked), so scrolling back takes it apart again. Reduced motion steps the
 * channel, so the mark is simply there after the cut.
 *
 * The outline is the LogoMark SVG's (side 100), extruded with a small bevel,
 * in the logo greys: the UI palette, not the mascot's purple.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Color,
  ExtrudeGeometry,
  Shape,
  Vector3,
  type Group,
  type MeshStandardMaterial,
} from 'three'
import { sampleChannel, scriptFor } from '@/lib/cinematic/timeline'
import { character } from '@/lib/character'
import { degToRad, smoothstep } from '@/lib/math/damp'
import { cinematic } from './cinematic/CinematicDriver'

/** LogoMark polygons, in SVG units (y down). */
const DARK = [
  [0, -100, -86.6, -50, -86.6, 50, 0, 100, 0, 50, -43.3, 25, -43.3, -25, 0, -50],
  [29, -85, 60, -67, 60, -31, 29, -49],
]
const LIGHT = [[0, -50, 86.6, 0, 86.6, 100, 0, 150, 0, 100, 43.3, 75, 43.3, 25, 0, 0]]
/** Centre of the whole mark in SVG units: its box is y -100 to 150, so 125 either side. */
const MARK_CENTRE_Y = 25
const MARK_HALF_HEIGHT = 125
/** Metres per SVG unit: the mark is 2.5 m tall. */
const UNIT_M = 0.01
/** How far behind Kelo the mark stands: far enough to fit the finale's frame when it stands on the floor. */
const BEHIND_M = 3
/** Where each half starts, in mark units, and how it is turned then. */
const FLY = { x: 190, y: 120, z: 60, yawDeg: 55, rollDeg: 25 }

const easeOutBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2

/** Extrude polygons into one geometry centred on its own box, so a half turns about itself. */
function extrudeHalf(polygons: number[][]) {
  const shapes = polygons.map((points) => {
    const shape = new Shape()
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i]!
      const y = MARK_CENTRE_Y - points[i + 1]!
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    shape.closePath()
    return shape
  })
  const geometry = new ExtrudeGeometry(shapes, {
    depth: 10,
    bevelEnabled: true,
    bevelThickness: 2,
    bevelSize: 1.5,
    bevelSegments: 2,
  })
  geometry.computeBoundingBox()
  const centre = geometry.boundingBox!.getCenter(new Vector3())
  geometry.translate(-centre.x, -centre.y, -centre.z)
  return { geometry, centre }
}

export function LogoAssembly() {
  const halves = useMemo(() => ({ dark: extrudeHalf(DARK), light: extrudeHalf(LIGHT) }), [])
  const root = useRef<Group>(null)
  const dark = useRef<Group>(null)
  const light = useRef<Group>(null)
  const darkMaterial = useRef<MeshStandardMaterial>(null)
  const lightMaterial = useRef<MeshStandardMaterial>(null)
  const glow = useMemo(() => new Color(character.colors.mascot['500']), [])

  useEffect(
    () => () => {
      halves.dark.geometry.dispose()
      halves.light.geometry.dispose()
    },
    [halves],
  )

  useFrame(() => {
    if (!root.current || !dark.current || !light.current) return
    const { sample, progress, variant } = cinematic
    const logo = sample.logo
    root.current.visible = logo > 0.001
    if (!root.current.visible) return

    // Stand behind Kelo on the line from the finale's camera, facing it.
    const azimuth = degToRad(sampleChannel(scriptFor(variant).channels.azimuthDeg, 1))
    // Standing on the floor, never through it. Portrait framing pulls the
    // camera back, so the same size frames him on phones too.
    root.current.position.set(
      -Math.sin(azimuth) * BEHIND_M,
      MARK_HALF_HEIGHT * UNIT_M + 0.01,
      -Math.cos(azimuth) * BEHIND_M,
    )
    root.current.rotation.y = azimuth
    root.current.scale.setScalar(UNIT_M)

    // Each half flies in from its side, point-symmetric like the mark. Only
    // depth overshoots as they lock, so the halves never cut into each other.
    const back = 1 - easeOutBack(smoothstep(0, 1, logo))
    const away = Math.max(0, back)
    for (const [half, group, side] of [
      [halves.dark, dark.current, -1],
      [halves.light, light.current, 1],
    ] as const) {
      group.position.set(
        half.centre.x + side * FLY.x * away,
        half.centre.y - side * FLY.y * away,
        half.centre.z + FLY.z * back,
      )
      group.rotation.set(
        0,
        -side * degToRad(FLY.yawDeg) * away,
        side * degToRad(FLY.rollDeg) * away,
      )
    }

    // A soft violet flash as the halves click together.
    const flash = smoothstep(0.88, 0.9, progress) * (1 - smoothstep(0.9, 0.95, progress))
    for (const material of [darkMaterial.current, lightMaterial.current]) {
      if (material) material.emissiveIntensity = 0.3 * flash
    }
  })

  return (
    <group ref={root} visible={false}>
      <group ref={dark}>
        <mesh geometry={halves.dark.geometry}>
          <meshStandardMaterial
            ref={darkMaterial}
            color={character.colors.brandMono.ink500}
            emissive={glow}
            emissiveIntensity={0}
            roughness={0.38}
            metalness={0.2}
          />
        </mesh>
      </group>
      <group ref={light}>
        <mesh geometry={halves.light.geometry}>
          <meshStandardMaterial
            ref={lightMaterial}
            color={character.colors.brandMono.ink300}
            emissive={glow}
            emissiveIntensity={0}
            roughness={0.38}
            metalness={0.2}
          />
        </mesh>
      </group>
    </group>
  )
}
