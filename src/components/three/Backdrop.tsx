'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { Color, ShaderMaterial } from 'three'
import { character } from '@/lib/character'
import { smoothstep } from '@/lib/math/damp'
import { live } from './live/LiveDriver'

const INK = character.colors.brandMono.ink900
/** The halo: the page's ink lifted a little, with a trace of the mascot's violet. */
const HALO = new Color(INK).lerp(new Color('#3a3448'), 0.55)
/** Where the halo sits on screen (0..1 from the bottom left), and its radius in screen heights. */
const CENTRE = { x: 0.5, y: 0.56 }
const RADIUS = 0.78
/** Kelo's scale over which the halo dims in the gulp, so the inside of his mouth stays dark. */
const GULP_SCALE = { from: 1.2, to: 3 }

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    // Straight to clip space, on the far plane: it is always the backdrop.
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uInk;
  uniform vec3 uHalo;
  uniform vec2 uCentre;
  uniform float uRadius;
  uniform float uAspect;
  uniform float uStrength;
  varying vec2 vUv;

  void main() {
    vec2 d = (vUv - uCentre) * vec2(uAspect, 1.0);
    float t = smoothstep(uRadius, 0.0, length(d));
    gl_FragColor = vec4(mix(uInk, uHalo, t * t * uStrength), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * A seamless studio backdrop: a soft halo of light behind Kelo that fades
 * into the page's ink at the edges, instead of a flat void. Screen-space, so
 * it frames every shot the same way, and one full-screen draw before
 * everything else.
 */
export function Backdrop() {
  const material = useRef<ShaderMaterial>(null)
  // Stable, so the material is built once: R3F rebuilds it when its args change.
  const parameters = useMemo(
    () => ({
      uniforms: {
        uInk: { value: new Color(INK) },
        uHalo: { value: HALO.clone() },
        uCentre: { value: [CENTRE.x, CENTRE.y] },
        uRadius: { value: RADIUS },
        uAspect: { value: 1 },
        uStrength: { value: 1 },
      },
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    }),
    [],
  )

  useFrame((state) => {
    const u = material.current?.uniforms
    if (!u) return
    u.uAspect!.value = state.size.width / state.size.height
    u.uStrength!.value = 1 - smoothstep(GULP_SCALE.from, GULP_SCALE.to, live.sample.scale)
  })

  return (
    <mesh frustumCulled={false} renderOrder={-1000}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={material} args={[parameters]} />
    </mesh>
  )
}
