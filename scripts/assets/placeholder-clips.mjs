/**
 * Animation clips of the placeholder, as data.
 *
 * Each track keys one bone: `rotation` values are XYZ Euler degrees relative
 * to the rest pose, `translation` values are metre offsets from the rest
 * position. Key times are normalised (0 to 1) and scaled by the clip's
 * durationS from character.json. Looping clips end where they start.
 *
 * The same shape is meant to drive the Blender pipeline in phase 3, so keep
 * it free of three.js types. Never key `root` or the procedural eye bones.
 */

/** Sine sway sampled into keys, closing the loop exactly at t = 1. */
function sway(bone, axis, amplitudeDeg, phase = 0, samples = 8) {
  const index = { x: 0, y: 1, z: 2 }[axis]
  const keys = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const value = [0, 0, 0]
    value[index] =
      i === samples ? keys[0][1][index] : amplitudeDeg * Math.sin(2 * Math.PI * (t + phase))
    keys.push([t, value])
  }
  return { bone, path: 'rotation', keys }
}

/** Keys for one axis from parallel arrays of times and values. */
const axisKeys = (times, axis, values) =>
  times.map((t, i) => {
    const v = [0, 0, 0]
    v[{ x: 0, y: 1, z: 2 }[axis]] = values[i]
    return [t, v]
  })

const rot = (bone, times, axis, values) => ({
  bone,
  path: 'rotation',
  keys: axisKeys(times, axis, values),
})
const lift = (bone, times, values) => ({
  bone,
  path: 'translation',
  keys: axisKeys(times, 'y', values),
})
const mirror = (values) => values.map((v) => -v)

const TAIL = ['tail_01', 'tail_02', 'tail_03', 'tail_04']

const idle = (() => {
  const t = [0, 0.5, 1]
  return [
    lift('hips', t, [0, -0.006, 0]),
    rot('spine_02', t, 'x', [0, 2, 0]),
    rot('chest', t, 'x', [0, -1.5, 0]),
    rot('head', t, 'x', [0, -1.5, 0]),
    rot('upperarm_L', t, 'z', [0, 3, 0]),
    rot('upperarm_R', t, 'z', [0, -3, 0]),
    ...TAIL.map((bone, i) => sway(bone, 'y', 5 + i * 2, -0.08 * i)),
  ]
})()

const hatch = (() => {
  const t = [0, 0.25, 0.45, 0.65, 1]
  const legs = ['L', 'R'].flatMap((s) => [
    rot(`thigh_${s}`, t, 'x', [-70, -65, -5, -10, 0]),
    rot(`shin_${s}`, t, 'x', [110, 100, 10, 15, 0]),
  ])
  return [
    lift('hips', t, [-0.22, -0.2, 0.06, -0.02, 0]),
    rot('spine_01', t, 'x', [30, 28, -8, 3, 0]),
    rot('spine_02', t, 'x', [20, 18, -6, 2, 0]),
    rot('neck_01', t, 'x', [15, 14, -10, 2, 0]),
    rot('head', t, 'x', [20, 18, -15, 4, 0]),
    rot('upperarm_L', t, 'z', [-20, -15, 60, 10, 0]),
    rot('upperarm_R', t, 'z', mirror([-20, -15, 60, 10, 0])),
    rot('tail_01', t, 'x', [-25, -20, 15, -3, 0]),
    ...legs,
  ]
})()

const lookAround = (() => {
  const t = [0, 0.12, 0.3, 0.42, 0.62, 0.75, 0.9, 1]
  const yaw = [0, 22, 22, 0, -22, -22, 0, 0]
  return [
    rot(
      'neck_01',
      t,
      'y',
      yaw.map((v) => v * 0.2),
    ),
    rot(
      'neck_02',
      t,
      'y',
      yaw.map((v) => v * 0.2),
    ),
    {
      bone: 'head',
      path: 'rotation',
      keys: t.map((time, i) => [time, [[0, -4, -4, 0, 3, 3, 0, 0][i], yaw[i] * 0.6, 0]]),
    },
    ...TAIL.map((bone, i) => sway(bone, 'y', 4 + i * 1.5, -0.06 * i, 4)),
  ]
})()

const roar = (() => {
  const t = [0, 0.2, 0.4, 0.75, 1]
  return [
    lift('hips', t, [0, -0.02, 0.01, 0.01, 0]),
    rot('spine_02', t, 'x', [0, 6, -8, -6, 0]),
    rot('chest', t, 'x', [0, 10, -12, -10, 0]),
    rot('neck_02', t, 'x', [0, 8, -10, -8, 0]),
    rot('head', t, 'x', [0, 12, -22, -20, 0]),
    rot('upperarm_L', t, 'z', [0, 10, 50, 45, 0]),
    rot('upperarm_R', t, 'z', mirror([0, 10, 50, 45, 0])),
    rot('forearm_L', t, 'z', [0, 0, 20, 20, 0]),
    rot('forearm_R', t, 'z', mirror([0, 0, 20, 20, 0])),
    rot('tail_01', t, 'x', [0, -5, 20, 18, 0]),
    rot('tail_02', t, 'x', [0, 0, 10, 8, 0]),
  ]
})()

const jump = (() => {
  const t = [0, 0.22, 0.45, 0.72, 0.88, 1]
  const legs = ['L', 'R'].flatMap((s) => [
    rot(`thigh_${s}`, t, 'x', [0, -30, -15, -10, -20, 0]),
    rot(`shin_${s}`, t, 'x', [0, 50, 30, 15, 35, 0]),
    rot(`foot_${s}`, t, 'x', [0, -20, 15, -5, -15, 0]),
  ])
  return [
    lift('hips', t, [0, -0.06, 0.2, 0.02, -0.03, 0]),
    rot('spine_01', t, 'x', [0, 12, -6, 0, 8, 0]),
    rot('upperarm_L', t, 'z', [0, -10, 40, 20, 0, 0]),
    rot('upperarm_R', t, 'z', mirror([0, -10, 40, 20, 0, 0])),
    rot('tail_01', t, 'x', [0, -10, 15, 5, -8, 0]),
    ...legs,
  ]
})()

const wave = (() => {
  const t = [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1]
  return [
    rot('upperarm_R', t, 'z', [0, -110, -115, -110, -115, -110, 0]),
    rot('forearm_R', t, 'z', [0, -20, 15, -20, 15, -20, 0]),
    rot('head', t, 'z', [0, 5, 5, 5, 5, 5, 0]),
    rot('spine_02', t, 'z', [0, -3, -3, -3, -3, -3, 0]),
  ]
})()

/** Tracks per clip name; durations and loop flags come from character.json. */
export const PLACEHOLDER_CLIPS = {
  idle,
  hatch,
  look_around: lookAround,
  roar,
  jump,
  wave,
}
