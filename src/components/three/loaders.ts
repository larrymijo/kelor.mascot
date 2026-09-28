'use client'

/**
 * GLTF decoding without a CDN. Meshopt needs nothing here: drei's useGLTF
 * enables the decoder bundled in three-stdlib by default. KTX2 needs a Basis
 * transcoder, served from public/basis (a copy of three's, kept in sync by a
 * test), and a loader that owns a worker pool, so there is one per renderer.
 *
 * Nothing KTX2-related touches the lite model's first paint: the loader code
 * is a separate chunk imported when the upgrade starts, and the transcoder
 * itself is fetched on the first KTX2 texture.
 */
import type { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import type { Camera, Object3D, Scene, WebGLRenderer } from 'three'
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'

export const TRANSCODER_PATH = '/basis/'

export type KTX2Module = typeof import('three/examples/jsm/loaders/KTX2Loader.js')

let ktx2Module: Promise<KTX2Module> | null = null

/** One shared promise, so React's use() can suspend on it across renders. */
export function loadKtx2Module() {
  ktx2Module ??= import('three/examples/jsm/loaders/KTX2Loader.js')
  return ktx2Module
}

const ktx2Loaders = new WeakMap<WebGLRenderer, KTX2Loader>()

export function ktx2LoaderFor(renderer: WebGLRenderer, module: KTX2Module) {
  let loader = ktx2Loaders.get(renderer)
  if (!loader) {
    loader = new module.KTX2Loader().setTranscoderPath(TRANSCODER_PATH).detectSupport(renderer)
    ktx2Loaders.set(renderer, loader)
  }
  return loader
}

/** Terminates the transcoder workers; the stage calls it when it unmounts. */
export function disposeKtx2Loader(renderer: WebGLRenderer) {
  ktx2Loaders.get(renderer)?.dispose()
  ktx2Loaders.delete(renderer)
}

/** drei's extendLoader callback and the three-stdlib GLTFLoader it receives. */
type ExtendLoader = NonNullable<Parameters<typeof useGLTF>[3]>
type StdlibKTX2Loader = Parameters<Parameters<ExtendLoader>[0]['setKTX2Loader']>[0]

/** The extendLoader argument for drei's useGLTF, bound to this canvas' renderer. */
export function useKtx2Extension(module: KTX2Module) {
  const gl = useThree((s) => s.gl)
  return useMemo<ExtendLoader>(
    () => (loader) => {
      // three-stdlib types its own KTX2Loader. three's has the same runtime
      // shape, and it is the one that pairs with the transcoder we serve.
      loader.setKTX2Loader(ktx2LoaderFor(gl, module) as unknown as StdlibKTX2Loader)
    },
    [gl, module],
  )
}

/**
 * Compile an object's shader programs against the stage's lights before it
 * is shown, so neither the first hatch frame nor the lite to full swap stalls
 * on an integrated GPU. Hidden objects compile too: three gathers materials
 * with a full traverse. compileAsync uses parallel shader compilation where
 * the driver offers it; older Safari only has the synchronous compile.
 */
export async function warmUp(
  renderer: WebGLRenderer,
  object: Object3D,
  camera: Camera,
  scene: Scene,
) {
  if (typeof renderer.compileAsync === 'function')
    await renderer.compileAsync(object, camera, scene)
  else renderer.compile(object, camera, scene)
}
