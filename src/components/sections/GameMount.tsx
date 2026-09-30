'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { onGameRequest } from '@/lib/showcase/state'

/** The runner is a chunk of its own: nobody downloads it until the ninth tap. */
const RunnerGame = dynamic(() => import('@/components/game/RunnerGame'), { ssr: false })

/**
 * Opens the pixel runner when the scene asks (the ninth tap in a row on a
 * touch screen), and closes it when the player does.
 */
export function GameMount() {
  const [open, setOpen] = useState(false)
  useEffect(() => onGameRequest(() => setOpen(true)), [])
  if (!open) return null
  return <RunnerGame onClose={() => setOpen(false)} />
}
