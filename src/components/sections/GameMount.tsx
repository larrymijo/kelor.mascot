'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { onGameRequest, setGameOpen } from '@/lib/showcase/state'

/** The runner is a chunk of its own: nobody downloads it until it is asked for. */
const RunnerGame = dynamic(() => import('@/components/game/RunnerGame'), { ssr: false })

/**
 * Opens the pixel runner when it is asked for (the ninth tap in a row on a
 * touch screen, or the dock's button on desktop), and closes it when the
 * player does. While it is open the stage stops drawing behind it.
 */
export function GameMount() {
  const [open, setOpen] = useState(false)
  useEffect(
    () =>
      onGameRequest(() => {
        setOpen(true)
        setGameOpen(true)
      }),
    [],
  )
  if (!open) return null
  return (
    <RunnerGame
      onClose={() => {
        setOpen(false)
        setGameOpen(false)
      }}
    />
  )
}
