'use client'

/**
 * Writes the screen-space layers each frame, as CSS variables on #live-ui:
 * the letterbox bars and the iris of the bite, the words' opacity, the hint
 * until someone touches Kelo, and where Kelo is on screen, so the keyboard
 * button sits on him. Runs after the camera has moved, so the iris and the
 * button follow him exactly. Only writes a value when it changes.
 *
 * For tests it also exposes data-scale, data-biting, data-kelo (what he is
 * doing), data-reaction, and his screen position as data-kelo-x and -y.
 */
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3 } from 'three'
import { clamp } from '@/lib/math/damp'
import { useScene } from '../store'
import { live } from './LiveDriver'

const _point = new Vector3()

export function OverlayDriver() {
  const element = useRef<HTMLElement | null>(null)
  const written = useRef(new Map<string, string>())

  useFrame((state) => {
    element.current ??= document.getElementById('live-ui')
    const root = element.current
    if (!root) return
    const cache = written.current
    const set = (name: string, value: string) => {
      if (cache.get(name) === value) return
      cache.set(name, value)
      root.style.setProperty(name, value)
    }
    const data = (name: string, value: string) => {
      if (root.dataset[name] !== value) root.dataset[name] = value
    }
    const { sample, kelo } = live
    const { width, height } = state.size
    const ready = useScene.getState().boot.phase === 'ready'

    set('--letterbox', sample.letterbox.toFixed(4))
    // The words wait for him to hatch.
    set('--text', ready ? sample.text.toFixed(3) : '0')
    set('--hint', ready && !kelo.touched ? sample.text.toFixed(3) : '0')

    // Kelo on screen: the keyboard button covers him from head to feet.
    const toScreen = (world: Vector3) => {
      _point.copy(world).project(state.camera)
      return { x: ((_point.x + 1) / 2) * width, y: ((1 - _point.y) / 2) * height }
    }
    const top = toScreen(kelo.top)
    const feet = toScreen(kelo.feet)
    const centre = toScreen(kelo.centre)
    const tall = Math.max(40, feet.y - top.y)
    set('--kelo-x', `${centre.x.toFixed(0)}px`)
    set('--kelo-y', `${((top.y + feet.y) / 2).toFixed(0)}px`)
    set('--kelo-h', `${tall.toFixed(0)}px`)
    set('--kelo-w', `${(tall * 0.62).toFixed(0)}px`)
    data('keloX', centre.x.toFixed(0))
    data('keloY', centre.y.toFixed(0))
    data('kelo', kelo.state)
    data('reaction', kelo.reaction)
    data('scale', sample.scale.toFixed(2))
    data('biting', String(sample.biteS !== null))

    // The iris: a circle centred on the scaled, turned mouth, projected to the screen.
    if (sample.iris > 0) {
      _point.copy(live.mouth).project(state.camera)
      // Kept on screen, and centred if the mouth is ever behind the lens, so
      // the circle never opens or closes out of sight.
      const behind = _point.z > 1
      const x = behind ? width / 2 : clamp(((_point.x + 1) / 2) * width, 0, width)
      const y = behind ? height / 2 : clamp(((1 - _point.y) / 2) * height, 0, height)
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
