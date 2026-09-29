'use client'

/**
 * A few soft purple motes around Kelo, moved entirely on the GPU: one draw
 * call and no per-particle work on the CPU. They are accents close to him,
 * not a star field: they drift slowly up around him, are blown
 * outwards when the shell bursts, and spiral into his mouth in the gulp
 * (the script's particleSwirl), streaming back out as he shrinks.
 *
 * The count follows the tier (character.json quality.tiers.*.particles);
 * reduced motion shows none (accessibility.reducedMotion.particles).
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  ShaderMaterial,
  type PerspectiveCamera,
} from 'three'
import { character } from '@/lib/character'
import { degToRad } from '@/lib/math/damp'
import { seededRandom } from '@/lib/math/random'
import { live } from './live/LiveDriver'
import { useScene } from './store'

/** World size of a mote, in metres. */
const SIZE_M = 0.022
/** The motes live in a ring around Kelo: inner and outer radius, and height, in metres. */
const VOLUME = { inner: 0.5, outer: 1.25, height: 2 }
/** Motes closer to the camera than this fade out, so none crosses the lens (metres). */
const NEAR_FADE = { from: 0.5, to: 1.3 }
/** Mixed into the pale violet so the motes stay saturated. */
const MOTE_500 = new Color(character.colors.mascot['500'])
/** Where the burst blows them from: the middle of the egg. */
const EGG_CENTRE_Y = character.egg.heightM / 2

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uBurst;
  uniform float uSwirl;
  uniform vec3 uMouth;
  uniform float uSize;
  uniform float uEggY;
  uniform float uHeight;
  uniform vec2 uNearFade;
  attribute vec4 seed;
  varying float vAlpha;

  void main() {
    vec3 p = seed.xyz;
    float r = seed.w;

    // Rise slowly and wrap, swaying a little; fade in and out at the wrap.
    p.y = mod(p.y + uTime * (0.015 + 0.025 * r), uHeight);
    float edge = smoothstep(0.0, 0.4, p.y) * (1.0 - smoothstep(uHeight - 0.5, uHeight, p.y));
    p.x += sin(uTime * 0.25 + r * 40.0) * 0.05;
    p.z += cos(uTime * 0.2 + r * 30.0) * 0.05;

    // The burst: blown out from the egg, then settling back.
    vec3 away = normalize(p - vec3(0.0, uEggY, 0.0) + 1e-4);
    p += away * sin(3.14159 * uBurst) * (1.0 - 0.5 * uBurst) * (0.3 + 0.5 * r);

    // The gulp: each mote in turn spirals into the mouth and vanishes there.
    float s = clamp(uSwirl * 1.6 - r * 0.6, 0.0, 1.0);
    s = s * s * (3.0 - 2.0 * s);
    vec3 rel = p - uMouth;
    float a = s * 6.0 * (0.6 + r);
    rel.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * rel.xz;
    p = uMouth + rel * (1.0 - s);

    vec4 view = modelViewMatrix * vec4(p, 1.0);
    // Nothing slides past the lens, in the wide shots or the close-ups.
    float near = smoothstep(uNearFade.x, uNearFade.y, -view.z);
    vAlpha = edge * near * (0.3 + 0.4 * fract(r * 7.13)) * (1.0 - s * s);
    gl_PointSize = uSize * (0.6 + 0.8 * fract(r * 3.7)) / -view.z;
    gl_Position = projectionMatrix * view;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    // A soft round falloff, brighter in the middle: bokeh, not a hard dot.
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float glow = exp(-3.5 * d * d) * (1.0 - smoothstep(0.7, 1.0, d));
    gl_FragColor = vec4(uColor, glow * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function buildMotes(count: number) {
  const random = seededRandom(0x6b656c6f)
  const seeds = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    // Uniform over the ring's area, all around him.
    const t = random()
    const radius = Math.sqrt(VOLUME.inner ** 2 + t * (VOLUME.outer ** 2 - VOLUME.inner ** 2))
    const angle = random() * Math.PI * 2
    seeds.set(
      [Math.cos(angle) * radius, random() * VOLUME.height, Math.sin(angle) * radius, random()],
      i * 4,
    )
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('seed', new Float32BufferAttribute(seeds, 4))
  // The shader reads `seed`; three still needs a position attribute to draw.
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 3), 3))
  return geometry
}

export function Particles() {
  const tier = useScene((s) => s.tier)
  const reducedMotion = useScene((s) => s.reducedMotion)
  const count = character.quality.tiers[tier].particles
  const hidden = reducedMotion && !character.accessibility.reducedMotion.particles
  const geometry = useMemo(() => buildMotes(count), [count])
  const material = useRef<ShaderMaterial>(null)
  const time = useRef(0)

  useEffect(() => () => geometry.dispose(), [geometry])

  // Stable, so the material is built once: R3F rebuilds it when its args change.
  const parameters = useMemo(
    () => ({
      uniforms: {
        uTime: { value: 0 },
        uBurst: { value: 0 },
        uSwirl: { value: 0 },
        uMouth: { value: live.mouth.clone() },
        uSize: { value: 1 },
        uEggY: { value: EGG_CENTRE_Y },
        uHeight: { value: VOLUME.height },
        uNearFade: { value: [NEAR_FADE.from, NEAR_FADE.to] },
        // Kept below 1: brighter, AgX desaturated them to white, like stars.
        uColor: { value: new Color(character.colors.mascot['300']).lerp(MOTE_500, 0.3) },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
    [],
  )

  useFrame((state, delta) => {
    const shader = material.current
    if (!shader) return
    const { boot } = useScene.getState()
    time.current += Math.min(delta, 0.1)
    const camera = state.camera as PerspectiveCamera
    const u = shader.uniforms
    u.uTime!.value = time.current
    // From the moment the shell bursts to the end of the hatch.
    u.uBurst!.value =
      boot.phase === 'hatching' ? Math.min(1, Math.max(0, (boot.hatchProgress - 0.3) / 0.7)) : 0
    u.uSwirl!.value = live.sample.particleSwirl
    ;(u.uMouth!.value as typeof live.mouth).copy(live.mouth)
    // Pixels per metre at 1 m for this lens and canvas.
    u.uSize!.value =
      (SIZE_M * state.size.height * state.gl.getPixelRatio()) /
      (2 * Math.tan(degToRad(camera.fov) / 2))
  })

  if (hidden || count === 0) return null

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial ref={material} args={[parameters]} />
    </points>
  )
}
