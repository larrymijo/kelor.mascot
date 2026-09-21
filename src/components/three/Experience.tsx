'use client'

import { Suspense } from 'react'
import { Egg } from './egg/Egg'
import { Mascot } from './mascot/Mascot'
import Stage, { type StageProps } from './Stage'

/**
 * Entry point of the lazily loaded 3D chunk: the stage with the procedural
 * egg (visible immediately) and the mascot (suspends while its GLB loads).
 */
export default function Experience(props: Omit<StageProps, 'children'>) {
  return (
    <Stage {...props}>
      <Egg />
      <Suspense fallback={null}>
        <Mascot />
      </Suspense>
    </Stage>
  )
}
