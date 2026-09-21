/**
 * Geometry of the procedural hexagonal egg (0 KB of assets).
 *
 * A bevelled hexagonal prism with one vertex facing the camera (+Z), split
 * down the middle into two solid halves like the two halves of the KELOR
 * mark, plus a thin top cap. A slightly smaller emissive core sits inside and
 * shows through the gaps between pieces as glowing cracks.
 */
import { BufferGeometry, ExtrudeGeometry, Shape, Vector2 } from 'three'
import type { Character } from '@/lib/character'

export interface EggPieces {
  left: BufferGeometry
  right: BufferGeometry
  cap: BufferGeometry
  core: BufferGeometry
  /** Height of the two halves; the cap sits on top of them. */
  bodyHeight: number
  capHeight: number
  /** The cap geometry is centred on its own origin so it can spin; place it here. */
  capCenterY: number
  /** Distance from the centre to the outer vertical edge of each half (its tipping hinge). */
  halfWidth: number
}

type EggSpec = Character['egg']

/** Hexagon corners in the XZ plane, starting with the vertex facing +Z. */
function hexCorners(radius: number) {
  return Array.from({ length: 6 }, (_, k) => {
    const phi = ((90 + 60 * k) * Math.PI) / 180
    return new Vector2(radius * Math.cos(phi), radius * Math.sin(phi))
  })
}

/** Closed shape with rounded corners. Shape Y maps to world -Z after extrusion. */
function roundedShape(points: Vector2[], radius: number) {
  const shape = new Shape()
  const n = points.length
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]!
    const current = points[i]!
    const next = points[(i + 1) % n]!
    const toPrev = prev.clone().sub(current)
    const toNext = next.clone().sub(current)
    const r = Math.min(radius, toPrev.length() / 2, toNext.length() / 2)
    const a = current.clone().add(toPrev.normalize().multiplyScalar(r))
    const b = current.clone().add(toNext.normalize().multiplyScalar(r))
    if (i === 0) shape.moveTo(a.x, -a.y)
    else shape.lineTo(a.x, -a.y)
    shape.quadraticCurveTo(current.x, -current.y, b.x, -b.y)
  }
  shape.closePath()
  return shape
}

/** Extrude a shape upwards (world +Y) from y = base, with rounded top and bottom edges. */
function extrudeUp(
  shape: Shape,
  height: number,
  bevel: number,
  base: number,
  curveSegments: number,
) {
  const geometry = new ExtrudeGeometry(shape, {
    depth: Math.max(0.001, height - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments,
  })
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, base + bevel, 0)
  geometry.computeVertexNormals()
  return geometry
}

export function buildEggPieces(egg: EggSpec, curveSegments = 4): EggPieces {
  const { heightM, radiusM, bevelM } = egg
  const capHeight = heightM * 0.12
  const bodyHeight = heightM - capHeight
  // The bevel grows the outline, so build the outline smaller by the same amount.
  const inner = radiusM - bevelM
  const corners = hexCorners(inner)
  const [front, frontLeft, backLeft, back, backRight, frontRight] = corners as [
    Vector2,
    Vector2,
    Vector2,
    Vector2,
    Vector2,
    Vector2,
  ]
  const corner = bevelM * 0.6

  const left = extrudeUp(
    roundedShape([front, frontLeft, backLeft, back], corner),
    bodyHeight,
    bevelM,
    0,
    curveSegments,
  )
  const right = extrudeUp(
    roundedShape([back, backRight, frontRight, front], corner),
    bodyHeight,
    bevelM,
    0,
    curveSegments,
  )
  const capCenterY = bodyHeight + capHeight / 2
  const cap = extrudeUp(
    roundedShape(corners, corner),
    capHeight,
    bevelM * 0.8,
    bodyHeight,
    curveSegments,
  )
  cap.translate(0, -capCenterY, 0)
  const core = extrudeUp(
    roundedShape(hexCorners(inner * 0.86), corner),
    heightM * 0.92,
    0,
    heightM * 0.03,
    curveSegments,
  )

  const halfWidth = radiusM * Math.cos(Math.PI / 6)
  return { left, right, cap, core, bodyHeight, capHeight, capCenterY, halfWidth }
}
