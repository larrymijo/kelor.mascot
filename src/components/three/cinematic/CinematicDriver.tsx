'use client'

/**
 * Samples the scroll script once per frame, before anything else in the
 * scene, into one shared object every component reads. Runs at a negative
 * useFrame priority, which keeps R3F's own rendering on.
 */
import { useFrame } from '@react-three/fiber'
import { scrollProgress } from '@/lib/cinematic/progress'
import { createSample, sampleTimeline, type Variant } from '@/lib/cinematic/timeline'
import { useScene } from '../store'

export const cinematic = {
  sample: sampleTimeline(0, 'desktop', createSample()),
  progress: 0,
  variant: 'desktop' as Variant,
}

/** Before every other frame callback. */
export const CINEMATIC_PRIORITY = -2

export function CinematicDriver() {
  useFrame((state) => {
    const scene = useScene.getState()
    const portrait = state.size.width < state.size.height
    cinematic.variant = scene.reducedMotion ? 'reduced' : portrait ? 'mobile' : 'desktop'
    cinematic.progress = scrollProgress.value
    sampleTimeline(cinematic.progress, cinematic.variant, cinematic.sample)
  }, CINEMATIC_PRIORITY)
  return null
}
