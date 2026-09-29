'use client'

import { useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import {
  Color,
  CubeCamera,
  DoubleSide,
  HalfFloatType,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  Scene,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
} from 'three'

/** An emissive panel of the studio, like drei's Lightformer; it faces Kelo at the origin. */
export interface StudioPanel {
  form: 'rect' | 'circle'
  intensity: number
  color?: string
  position: readonly [number, number, number]
  scale: number | readonly [number, number, number]
}

/** Renders the panels once into a cube map, as drei's Environment does with frames={1}. */
function bake(gl: WebGLRenderer, panels: readonly StudioPanel[], resolution: number) {
  const target = new WebGLCubeRenderTarget(resolution)
  target.texture.type = HalfFloatType
  const studio = new Scene()
  const disposables: { dispose(): void }[] = []
  for (const panel of panels) {
    const geometry =
      panel.form === 'circle' ? new RingGeometry(0, 0.5, 64) : new PlaneGeometry(1, 1)
    const material = new MeshBasicMaterial({
      color: new Color(panel.color ?? 'white').multiplyScalar(panel.intensity),
      side: DoubleSide,
      toneMapped: false,
    })
    const mesh = new Mesh(geometry, material)
    mesh.position.set(...panel.position)
    if (typeof panel.scale === 'number') mesh.scale.setScalar(panel.scale)
    else mesh.scale.set(...panel.scale)
    mesh.lookAt(0, 0, 0)
    studio.add(mesh)
    disposables.push(geometry, material)
  }
  const autoClear = gl.autoClear
  gl.autoClear = true
  new CubeCamera(0.1, 1000, target).update(gl, studio)
  gl.autoClear = autoClear
  for (const item of disposables) item.dispose()
  return target
}

/**
 * The studio's reflections: a few emissive panels baked once into a small
 * cube map that becomes the scene's environment. drei's Environment did the
 * same, but its module also bundles the HDR, EXR and gain-map loaders, which
 * a studio made of panels never uses.
 */
export function useStudioEnvironment(
  panels: readonly StudioPanel[],
  resolution: number,
  intensity: number,
) {
  const gl = useThree((s) => s.gl)
  const get = useThree((s) => s.get)

  useLayoutEffect(() => {
    const { scene } = get()
    const target = bake(gl, panels, resolution)
    const previous = scene.environment
    scene.environment = target.texture
    return () => {
      scene.environment = previous
      target.dispose()
    }
  }, [gl, get, panels, resolution])

  useLayoutEffect(() => {
    get().scene.environmentIntensity = intensity
  }, [get, intensity])
}
