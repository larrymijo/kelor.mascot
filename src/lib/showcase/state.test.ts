import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SHOWCASE,
  dropEgg,
  onCommand,
  onDropEgg,
  onGameRequest,
  onShowcase,
  requestGame,
  sendCommand,
  setShowcase,
  showcase,
} from './state'

describe('showcase state', () => {
  afterEach(() => setShowcase(DEFAULT_SHOWCASE))

  it('carries the drop to the scene, and keeps one made before the scene listens', () => {
    const early = vi.fn()
    dropEgg({ clientX: 120, clientY: 300 })
    const offEarly = onDropEgg(early)
    expect(early).toHaveBeenCalledWith({ clientX: 120, clientY: 300 })
    offEarly()

    const listener = vi.fn()
    const off = onDropEgg(listener)
    expect(listener).not.toHaveBeenCalled()
    dropEgg()
    expect(listener).toHaveBeenCalledWith(undefined)
    off()
  })

  it('starts in the studio light, still and solid', () => {
    expect(showcase()).toEqual({ lighting: 'studio', spin: false, xray: false })
  })

  it('tells listeners of real changes only, and stops when unsubscribed', () => {
    const listener = vi.fn()
    const off = onShowcase(listener)
    setShowcase({ lighting: 'neon' })
    setShowcase({ lighting: 'neon' })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(showcase().lighting).toBe('neon')
    // A new object each change, as useSyncExternalStore needs.
    const before = showcase()
    setShowcase({ xray: true })
    expect(showcase()).not.toBe(before)
    off()
    setShowcase({ spin: true })
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('carries the dock commands and the game request to their listeners', () => {
    const commands = vi.fn()
    const games = vi.fn()
    const offCommands = onCommand(commands)
    const offGames = onGameRequest(games)
    sendCommand({ kind: 'action', name: 'wave' })
    sendCommand({ kind: 'bite' })
    requestGame()
    expect(commands.mock.calls).toEqual([[{ kind: 'action', name: 'wave' }], [{ kind: 'bite' }]])
    expect(games).toHaveBeenCalledTimes(1)
    offCommands()
    offGames()
    sendCommand({ kind: 'resetView' })
    requestGame()
    expect(commands).toHaveBeenCalledTimes(2)
    expect(games).toHaveBeenCalledTimes(1)
  })
})
