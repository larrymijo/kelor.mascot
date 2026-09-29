/**
 * Geometry of the procedural dinosaur egg (0 kB of assets).
 *
 * A smooth ovoid, fuller at the bottom like a real egg, turned from a
 * profile curve with enough segments to stay round in the close framing,
 * with normals from the curve itself, so no faceting shows. While it waits
 * it is one seamless shell, its cracks drawn by the material (shell.ts). It
 * breaks along the same jagged cracks into a left and a right half and a top
 * cap, thin shells whose inside the material shades, around a slightly
 * smaller emissive core that glows through the gaps as they open.
 */
import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { Character } from '@/lib/character'

export interface EggPieces {
  /** The unbroken egg, shown until it hatches. */
  whole: BufferGeometry
  left: BufferGeometry
  right: BufferGeometry
  cap: BufferGeometry
  core: BufferGeometry
  /** Mean height of the crack that frees the cap. */
  capLineY: number
  /** Height of the cap's centre, the pivot it spins about as it pops. */
  capCenterY: number
  /** Where each half tips over: its outer edge at the widest point, on the floor. */
  halfWidth: number
}

type EggSpec = Character['egg']

/** Segments around and rings from bottom to top: round at any framing. */
export const EGG_SEGMENTS = { around: 128, rings: 96 }
/**
 * The cracks, each the sum of two zig-zags of unrelated periods, so their
 * teeth are irregular like a real break. The cap's line runs around the egg
 * (depth as a share of the height, teeth per turn); the seam between the
 * halves runs up the front and back (depth and period in metres). The
 * material draws the same lines, so they are shared.
 */
export const CRACK = {
  cap: [
    { depth: 0.03, teeth: 9, phase: 0 },
    { depth: 0.011, teeth: 23, phase: 0.17 },
  ],
  seam: [
    { depth: 0.016, periodM: 0.085, phase: 0 },
    { depth: 0.007, periodM: 0.031, phase: 0.3 },
  ],
}
/** The cap breaks off at this share of the height. */
export const CAP_AT = 0.72

/** A triangle wave from -1 to 1 with period 1. */
const zigzag = (t: number) => 4 * Math.abs(t - Math.floor(t + 0.5)) - 1

/**
 * The egg's profile at polar angle phi (0 at the bottom, pi at the top):
 * height, radius, and their derivatives, for exact normals. `taper` makes
 * the top narrower than the bottom; the radius is scaled so its maximum is
 * `radius`.
 */
export function eggProfile(height: number, radius: number, taper: number) {
  const raw = (phi: number) => Math.sin(phi) * (1 + taper * Math.cos(phi))
  // The widest point of the tapered profile, found numerically once.
  let widest = 0
  for (let i = 0; i <= 2000; i++) widest = Math.max(widest, raw((i / 2000) * Math.PI))
  const k = radius / widest
  return (phi: number) => {
    const s = Math.sin(phi)
    const c = Math.cos(phi)
    return {
      y: (height / 2) * (1 - c),
      r: k * s * (1 + taper * c),
      dy: (height / 2) * s,
      dr: k * (c * (1 + taper * c) - taper * s * s),
    }
  }
}

type Piece = 'left' | 'right' | 'cap'

/** Height of the crack that frees the cap, at angle theta around the egg. */
const capLineAt = (theta: number, height: number) =>
  height * CAP_AT +
  CRACK.cap.reduce(
    (sum, t) => sum + height * t.depth * zigzag((theta / (2 * Math.PI)) * t.teeth + t.phase),
    0,
  )

/** x of the seam between the halves at height y, on the front (z > 0) or the back. */
const seamAt = (y: number, front: boolean) =>
  CRACK.seam.reduce(
    (sum, t) => sum + t.depth * zigzag(y / t.periodM + t.phase + (front ? 0 : 0.5)),
    0,
  )

/** Which piece a point of the shell belongs to, along the jagged cracks. */
function pieceAt(x: number, y: number, z: number, height: number): Piece {
  if (y > capLineAt(Math.atan2(z, x), height)) return 'cap'
  return x < seamAt(y, z > 0) ? 'left' : 'right'
}

/**
 * A surface of revolution split into pieces by face. `scale` shrinks it
 * (for the core); `split` false keeps it whole.
 */
function turn(egg: EggSpec, scale: number, split: boolean) {
  const profile = eggProfile(egg.heightM * scale, egg.radiusM * scale, egg.taper)
  const lift = (egg.heightM * (1 - scale)) / 2
  const { around, rings } = EGG_SEGMENTS
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  for (let i = 0; i <= rings; i++) {
    const phi = (i / rings) * Math.PI
    const p = profile(phi)
    for (let j = 0; j <= around; j++) {
      const theta = (j / around) * Math.PI * 2
      const cos = Math.cos(theta)
      const sin = Math.sin(theta)
      positions.push(p.r * cos, p.y + lift, p.r * sin)
      // Outward normal of a surface of revolution: (dy cos, -dr, dy sin).
      const nx = p.dy * cos
      const ny = -p.dr
      const nz = p.dy * sin
      const length = Math.hypot(nx, ny, nz) || 1
      normals.push(nx / length, ny / length, nz / length)
      uvs.push(j / around, i / rings)
    }
  }

  const indices: Record<Piece, number[]> = { left: [], right: [], cap: [] }
  const vertex = (i: number, j: number) => i * (around + 1) + j
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < around; j++) {
      const a = vertex(i, j)
      const b = vertex(i + 1, j)
      const c = vertex(i + 1, j + 1)
      const d = vertex(i, j + 1)
      // Assign the quad by its centre, so each crack follows the mesh.
      let piece: Piece = 'left'
      if (split) {
        const cx = (positions[a * 3]! + positions[c * 3]!) / 2
        const cy = (positions[a * 3 + 1]! + positions[c * 3 + 1]!) / 2
        const cz = (positions[a * 3 + 2]! + positions[c * 3 + 2]!) / 2
        piece = pieceAt(cx, cy, cz, egg.heightM)
      }
      indices[piece].push(a, d, b, b, d, c)
    }
  }

  /** The point of the surface at height y and angle theta, with its normal. */
  const surfaceAt = (y: number, theta: number) => {
    const phi = Math.acos(Math.min(1, Math.max(-1, 1 - (2 * (y - lift)) / (egg.heightM * scale))))
    const p = profile(phi)
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    const n = [p.dy * cos, -p.dr, p.dy * sin]
    const length = Math.hypot(n[0]!, n[1]!, n[2]!) || 1
    return {
      position: [p.r * cos, p.y + lift, p.r * sin],
      normal: n.map((v) => v / length),
    }
  }

  /**
   * A piece's edge follows the grid, in steps. Its vertices that lie past a
   * crack slide along the surface onto it, so every piece breaks exactly
   * along the lines the material draws on the whole egg.
   */
  const snap = (piece: Piece, x: number, y: number, z: number) => {
    let theta = Math.atan2(z, x)
    const capLine = capLineAt(theta, egg.heightM)
    const height = piece === 'cap' ? Math.max(y, capLine) : Math.min(y, capLine)
    let point = surfaceAt(height, theta)
    if (piece !== 'cap') {
      const [px, , pz] = point.position as [number, number, number]
      const seam = seamAt(height, pz > 0)
      const radius = Math.hypot(px, pz)
      const past = piece === 'left' ? px > seam : px < seam
      if (past && radius > Math.abs(seam)) {
        theta = (pz < 0 ? -1 : 1) * Math.acos(seam / radius)
        point = surfaceAt(height, theta)
      }
    }
    return point
  }

  // Each piece keeps only the vertices it uses, so its bounds are its own.
  const build = (list: number[], piece: Piece) => {
    const remap = new Map<number, number>()
    const p: number[] = []
    const n: number[] = []
    const t: number[] = []
    const index = list.map((old) => {
      let next = remap.get(old)
      if (next === undefined) {
        next = remap.size
        remap.set(old, next)
        if (split) {
          const point = snap(
            piece,
            positions[old * 3]!,
            positions[old * 3 + 1]!,
            positions[old * 3 + 2]!,
          )
          p.push(...point.position)
          n.push(...point.normal)
        } else {
          p.push(positions[old * 3]!, positions[old * 3 + 1]!, positions[old * 3 + 2]!)
          n.push(normals[old * 3]!, normals[old * 3 + 1]!, normals[old * 3 + 2]!)
        }
        t.push(uvs[old * 2]!, uvs[old * 2 + 1]!)
      }
      return next
    })
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(p, 3))
    geometry.setAttribute('normal', new Float32BufferAttribute(n, 3))
    geometry.setAttribute('uv', new Float32BufferAttribute(t, 2))
    geometry.setIndex(index)
    return geometry
  }
  return {
    left: build(indices.left, 'left'),
    right: build(indices.right, 'right'),
    cap: build(indices.cap, 'cap'),
  }
}

export function buildEggPieces(egg: EggSpec): EggPieces {
  const shell = turn(egg, 1, true)
  const whole = turn(egg, 1, false).left
  const core = turn(egg, 0.9, false).left

  // The cap keeps its place in the egg, so the shell pattern and cracks stay
  // put on it; it spins about its centre through a pivot.
  shell.cap.computeBoundingBox()
  const capCenterY = (shell.cap.boundingBox!.min.y + shell.cap.boundingBox!.max.y) / 2

  return {
    whole,
    left: shell.left,
    right: shell.right,
    cap: shell.cap,
    core,
    capLineY: egg.heightM * CAP_AT,
    capCenterY,
    halfWidth: egg.radiusM,
  }
}
