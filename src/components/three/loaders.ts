'use client'

/**
 * GLTF decoding without a CDN. Models load through three's own GLTFLoader
 * with its Meshopt decoder, which is inlined WebAssembly. KTX2 needs a Basis
 * transcoder, served from public/basis (a copy of three's, kept in sync by a
 * test) under a versioned folder, and a loader that owns a worker pool, so
 * there is one per renderer.
 *
 * Nothing KTX2-related touches the lite model's first paint: the loader code
 * is a separate chunk imported when the upgrade starts, and the transcoder
 * itself is fetched on the first KTX2 texture.
 */
import { useLoader, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import type { Camera, Object3D, Scene, WebGLRenderer } from 'three'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { transcoderPath } from '@/lib/assets/versions'

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
    loader = new module.KTX2Loader().setTranscoderPath(transcoderPath()).detectSupport(renderer)
    ktx2Loaders.set(renderer, loader)
  }
  return loader
}

/** Terminates the transcoder workers; the stage calls it when it unmounts. */
export function disposeKtx2Loader(renderer: WebGLRenderer) {
  ktx2Loaders.get(renderer)?.dispose()
  ktx2Loaders.delete(renderer)
}

type LoaderExtension = (loader: GLTFLoader) => void

/**
 * Loads a model with the Meshopt decoder, cached by URL, suspending like any
 * R3F loader. `extend` adds what a model needs beyond that (KTX2 for the full
 * one). drei's useGLTF did the same, but it bundled three-stdlib's copy of
 * the loader and a DRACOLoader these models never use.
 */
export function useModel(url: string, extend?: LoaderExtension): GLTF {
  return useLoader(GLTFLoader, url, (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder)
    extend?.(loader)
  })
}

/** The loader extension that decodes KTX2 textures with this canvas' renderer. */
export function useKtx2Extension(module: KTX2Module) {
  const gl = useThree((s) => s.gl)
  return useMemo<LoaderExtension>(
    () => (loader) => {
      loader.setKTX2Loader(ktx2LoaderFor(gl, module))
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
