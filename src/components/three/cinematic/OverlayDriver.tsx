'use client'

/**
 * Writes the cinematic's screen-space layers each frame, as CSS variables on
 * #cinematic-ui: letterbox bars, the iris that closes on Kelo's mouth, the
 * dip to black used for reduced-motion cuts, the scroll cue and the two
 * text layers. Runs after the camera has moved, so the iris follows the
 * mouth exactly. Only writes a variable when its value changes. It also
 * exposes the act and Kelo's scale as data-act and data-scale for tests.
 */
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3 } from 'three'
import { clamp, smoothstep } from '@/lib/math/damp'
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
    // For tests and review tooling: the act on screen and Kelo's scale.
    if (root.dataset.act !== sample.act) root.dataset.act = sample.act
    const scale = sample.scale.toFixed(2)
    if (root.dataset.scale !== scale) root.dataset.scale = scale

    // The iris: a circle centred on the scaled, turned mouth, projected to the screen.
    if (sample.iris > 0) {
      _mouth.copy(cinematic.mouth).project(state.camera)
      const { width, height } = state.size
      // Kept on screen, and centred if the mouth is ever behind the lens, so
      // the circle never opens or closes out of sight.
      const behind = _mouth.z > 1
      const x = behind ? width / 2 : clamp(((_mouth.x + 1) / 2) * width, 0, width)
      const y = behind ? height / 2 : clamp(((1 - _mouth.y) / 2) * height, 0, height)
      set('--iris-on', '1')
      set('--iris-x', `${x.toFixed(1)}px`)
      set('--iris-y', `${y.toFixed(1)}px`)
      // Past fully closed, the edge moves beyond the centre so no soft dot is left.
      const feather = 0.03 * Math.max(width, height)
      const radius = (1 - sample.iris) * Math.hypot(width, height) - sample.iris * feather
      set('--iris-r', `${radius.toFixed(1)}px`)
    } else {
      set('--iris-on', '0')
    }
  })
  return null
}
