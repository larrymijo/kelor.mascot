/**
 * Landmarks measured on a normalised mascot (+Y up, facing +Z, feet at the
 * origin, heightM tall) and the contract skeleton refitted to them.
 *
 * The nominal skeleton in character.json was designed around a body whose
 * legs meet at y 0.20 and whose neck is narrowest at y 0.70. The fit remaps
 * heights piecewise-linearly through those anchors and scales widths from
 * measured legs, hands and tail, so any reasonable chibi proportions work.
 * fit.json rig.overrides always win.
 */

/** Landmarks of the body the nominal skeleton was designed for. */
export const NOMINAL = {
  heightM: 1.2,
  crotchY: 0.2,
  neckY: 0.7,
  legX: 0.115,
  handX: 0.222,
  tailTipZ: -0.58,
  /** Belly front at mid-torso height, which anchors the depth of the whole skeleton. */
  torsoY: 0.46,
  torsoFrontZ: 0.22,
}

const round = (v) => Math.round(v * 1e4) / 1e4
const mean = (values) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)

/**
 * @param {Float32Array} positions flat xyz of the normalised mesh
 * @param {number} heightM contract height
 */
export function measureLandmarks(positions, heightM) {
  const n = positions.length / 3
  const X = new Float32Array(n)
  const Y = new Float32Array(n)
  const Z = new Float32Array(n)
  let top = -Infinity
  for (let i = 0; i < n; i++) {
    X[i] = positions[i * 3]
    Y[i] = positions[i * 3 + 1]
    Z[i] = positions[i * 3 + 2]
    if (Y[i] > top) top = Y[i]
  }
  const H = heightM
  const inSlice = (i, y0, y1) => Y[i] >= y0 && Y[i] < y1

  // Feet: their back edge separates legs from a low-hanging tail.
  let feetBackZ = Infinity
  for (let i = 0; i < n; i++) if (Y[i] < 0.04 * H && Z[i] < feetBackZ) feetBackZ = Z[i]
  const notTail = (i) => Z[i] >= feetBackZ - 0.03

  // Crotch: first height (going up) where the two legs are no longer apart.
  const step = 0.005 * H
  let crotchY = null
  let sawGap = false
  for (let y = 0.03 * H; y < 0.5 * H; y += step) {
    let minAbs = Infinity
    let maxAbs = 0
    let count = 0
    for (let i = 0; i < n; i++) {
      if (!inSlice(i, y, y + step) || !notTail(i)) continue
      const ax = Math.abs(X[i])
      if (ax < minAbs) minAbs = ax
      if (ax > maxAbs) maxAbs = ax
      count += 1
    }
    if (count === 0) continue
    const apart = minAbs > 0.1 * maxAbs
    if (apart) sawGap = true
    else if (sawGap) {
      crotchY = y
      break
    }
  }
  if (crotchY === null) throw new Error('Could not find where the legs meet (crotch)')

  // Leg centre: mean |x| of the shins.
  const shin = []
  for (let i = 0; i < n; i++) {
    if (inSlice(i, 0.4 * crotchY, 0.5 * crotchY) && notTail(i)) shin.push(Math.abs(X[i]))
  }
  const legX = mean(shin)

  // Neck: narrowest body slice between the shoulders and the head. Windows are
  // thicker than the step and need enough points, so a sparse ring or a pole
  // does not read as a thin neck.
  const window = 0.012 * H
  const widthAt = (y) => {
    let w = 0
    let count = 0
    for (let i = 0; i < n; i++) {
      if (!inSlice(i, y - window, y + window)) continue
      w = Math.max(w, Math.abs(X[i]))
      count += 1
    }
    return count >= 20 ? w : null
  }
  let neckY = null
  let neckWidth = Infinity
  for (let y = 0.55 * H; y < 0.85 * H; y += step) {
    const w = widthAt(y)
    if (w !== null && w < neckWidth) {
      neckWidth = w
      neckY = y
    }
  }
  if (neckY === null) throw new Error('Could not find the neck')

  // Depth anchor: the belly front at mid-torso height.
  const torsoY =
    crotchY +
    ((neckY - crotchY) * (NOMINAL.torsoY - NOMINAL.crotchY)) / (NOMINAL.neckY - NOMINAL.crotchY)
  let torsoFrontZ = -Infinity
  for (let i = 0; i < n; i++) {
    if (inSlice(i, torsoY - step, torsoY + step) && Math.abs(X[i]) < 0.08 && Z[i] > torsoFrontZ)
      torsoFrontZ = Z[i]
  }

  // Head: widest slice above the neck; snout: front-most point of the head.
  let headCenterY = neckY
  let headHalfWidth = 0
  for (let y = neckY; y < top; y += step) {
    const w = widthAt(y) ?? 0
    if (w > headHalfWidth) {
      headHalfWidth = w
      headCenterY = y
    }
  }
  let snout = [0, neckY, -Infinity]
  for (let i = 0; i < n; i++) {
    if (Y[i] > neckY && Math.abs(X[i]) < 0.05 && Z[i] > snout[2]) snout = [0, Y[i], Z[i]]
  }

  // Hands: outermost points between the crotch and the neck.
  let handReach = 0
  for (let i = 0; i < n; i++) {
    if (Y[i] > crotchY && Y[i] < neckY) handReach = Math.max(handReach, Math.abs(X[i]))
  }
  const handPoints = []
  for (let i = 0; i < n; i++) {
    if (Y[i] > crotchY && Y[i] < neckY && Math.abs(X[i]) > 0.88 * handReach) handPoints.push(i)
  }
  const hand = [
    mean(handPoints.map((i) => Math.abs(X[i]))),
    mean(handPoints.map((i) => Y[i])),
    mean(handPoints.map((i) => Z[i])),
  ]

  // Tail: back-most point, and the centreline height along its length.
  let tailTip = [0, 0, Infinity]
  for (let i = 0; i < n; i++) if (Z[i] < tailTip[2]) tailTip = [0, Y[i], Z[i]]
  const tailCurve = []
  const zStart = feetBackZ - 0.05
  const segments = 8
  for (let k = 0; k <= segments; k++) {
    const z = zStart + ((tailTip[2] - zStart) * k) / segments
    const ys = []
    for (let i = 0; i < n; i++) {
      if (Math.abs(X[i]) < 0.1 && Math.abs(Z[i] - z) < 0.015 && Y[i] < neckY) ys.push(Y[i])
    }
    if (ys.length) tailCurve.push([round(z), round((Math.min(...ys) + Math.max(...ys)) / 2)])
  }

  return {
    heightM: round(top),
    feetBackZ: round(feetBackZ),
    crotchY: round(crotchY),
    legX: round(legX),
    neckY: round(neckY),
    neckHalfWidth: round(neckWidth),
    torsoFrontZ: round(torsoFrontZ),
    headCenterY: round(headCenterY),
    headHalfWidth: round(headHalfWidth),
    snoutTip: snout.map(round),
    mouthY: round(snout[1] - 0.03 * (H / NOMINAL.heightM)),
    hand: hand.map(round),
    tailTip: tailTip.map(round),
    tailCurve,
  }
}

/** Piecewise-linear remap of nominal heights through the measured anchors. */
export function heightMap(landmarks) {
  const anchors = [
    [0, 0],
    [NOMINAL.crotchY, landmarks.crotchY],
    [NOMINAL.neckY, landmarks.neckY],
    [NOMINAL.heightM, landmarks.heightM],
  ]
  return (y) => {
    for (let k = 1; k < anchors.length; k++) {
      const [a0, b0] = anchors[k - 1]
      const [a1, b1] = anchors[k]
      if (y <= a1 || k === anchors.length - 1) return b0 + ((y - a0) * (b1 - b0)) / (a1 - a0)
    }
    return y
  }
}

function tailHeightAt(landmarks, z, fallback) {
  const curve = landmarks.tailCurve
  if (curve.length < 2) return fallback
  for (let k = 1; k < curve.length; k++) {
    const [z0, y0] = curve[k - 1]
    const [z1, y1] = curve[k]
    if ((z <= z0 && z >= z1) || (z >= z0 && z <= z1)) return y0 + ((z - z0) * (y1 - y0)) / (z1 - z0)
  }
  return fallback
}

/**
 * Contract bones with rest heads refitted to the landmarks.
 * @returns {{ name: string, parent: string | null, role: string, restHead: number[] }[]}
 */
export function fitSkeleton(contract, landmarks, overrides = {}) {
  const f = heightMap(landmarks)
  const legScale = landmarks.legX / NOMINAL.legX
  const armScale = landmarks.hand[0] / NOMINAL.handX
  const tailRoot = contract.skeleton.bones.find((b) => b.name === 'tail_01').restHead
  const tailSpan = NOMINAL.tailTipZ - tailRoot[2]
  // The measured body may sit deeper or shallower than the nominal one.
  const dz = landmarks.torsoFrontZ - NOMINAL.torsoFrontZ

  return contract.skeleton.bones.map((bone) => {
    const [x0, y0, z0] = bone.restHead
    let head
    if (bone.role === 'leg') head = [x0 * legScale, f(y0), z0 + dz]
    else if (bone.role === 'arm') head = [x0 * armScale, f(y0), z0 + dz]
    else if (bone.role === 'tail' && bone.name !== 'tail_01') {
      const u = (z0 - tailRoot[2]) / tailSpan
      const z = tailRoot[2] + dz + u * (landmarks.tailTip[2] - tailRoot[2] - dz)
      head = [0, tailHeightAt(landmarks, z, f(y0)), z]
    } else head = [x0, f(y0), z0 + dz]
    const override = overrides[bone.name]
    return { ...bone, restHead: (override ?? head).map(round) }
  })
}
