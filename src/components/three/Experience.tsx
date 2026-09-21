'use client'

import { Stats } from '@react-three/drei'
import dynamic from 'next/dynamic'
import { Suspense, useState } from 'react'
import { Egg } from './egg/Egg'
import { Mascot } from './mascot/Mascot'
import Stage, { type StageProps } from './Stage'

/** leva lives in its own chunk and only loads with ?debug. */
const DebugPanel = dynamic(() => import('./debug/DebugPanel'), { ssr: false })

/** Vercel exposes NEXT_PUBLIC_VERCEL_ENV; the panel never exists on production. */
const debugAllowed = process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production'

/**
 * Entry point of the lazily loaded 3D chunk: the stage with the procedural
 * egg (visible immediately) and the mascot (suspends while its GLB loads).
 */
export default function Experience(props: Omit<StageProps, 'children'>) {
  // Client-only chunk (ssr: false), so reading the URL while initialising is safe.
  const [debug] = useState(
    () => debugAllowed && new URLSearchParams(window.location.search).has('debug'),
  )

  return (
    <>
      <Stage {...props}>
        <Egg />
        <Suspense fallback={null}>
          <Mascot />
        </Suspense>
        {debug && <Stats />}
      </Stage>
      {debug && <DebugPanel />}
    </>
  )
}
