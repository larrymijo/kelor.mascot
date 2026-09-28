'use client'

/**
 * Writes the cinematic's screen-space layers each frame, as CSS variables on
 * #cinematic-ui: letterbox bars, the iris that closes on Kelo's mouth, the
 * dip to black used for reduced-motion cuts, the scroll cue and the two
 * text layers. Runs after the camera has moved, so the iris follows the
 * mouth exactly. Only writes a variable when its value changes.
 */
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3 } from 'three'
import { MOUTH } from '@/lib/cinematic/acts'
import { degToRad, smoothstep } from '@/lib/math/damp'
import { useScene } from '../store'
import { cinematic } from './CinematicDriver'

const _mouth = new Vector3()

export function OverlayDriver() {
  const element = useRef<HTMLElement | null>(null)
  const contact = useRef<HTMLElement | null>(null)
  const written = useRef(new Map<string, string>())

  useFrame((state) => {
    element.current ??= document.getElementById('cinematic-ui')
    contact.current ??= document.getElementById('contact')
    const root = element.current
    if (!root) return
    const cache = written.current
    const set = (name: string, value: string) => {
      if (cache.get(name) === value) return
      cache.set(name, value)
      root.style.setProperty(name, value)
    }
    const { sample, progress } = cinematic
    const ready = useScene.getState().boot.phase === 'ready'

    set('--letterbox', sample.letterbox.toFixed(4))
    set('--fade', sample.fade.toFixed(3))
    set('--cue', (ready ? 1 - smoothstep(0.005, 0.03, progress) : 0).toFixed(3))
    set('--meet', sample.meetText.toFixed(3))
    set('--contact', sample.contactText.toFixed(3))
    contact.current?.toggleAttribute('data-shown', sample.contactText > 0.5)

    // The iris: a circle centred on the scaled, turned mouth, projected to the screen.
    if (sample.iris > 0) {
      const yaw = degToRad(sample.bodyYawDeg)
      const z = MOUTH.z * sample.scale
      _mouth.set(Math.sin(yaw) * z, MOUTH.y * sample.scale, Math.cos(yaw) * z).project(state.camera)
      const { width, height } = state.size
      const x = ((_mouth.x + 1) / 2) * width
      const y = ((1 - _mouth.y) / 2) * height
      set('--iris-on', '1')
      set('--iris-x', `${x.toFixed(1)}px`)
      set('--iris-y', `${y.toFixed(1)}px`)
      set('--iris-r', `${((1 - sample.iris) * Math.hypot(width, height)).toFixed(1)}px`)
    } else {
      set('--iris-on', '0')
    }
  })
  return null
}
