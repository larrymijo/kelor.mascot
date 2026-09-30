import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { synth, createSynth } = vi.hoisted(() => {
  const synth = { setMode: vi.fn(), woke: vi.fn() }
  return { synth, createSynth: vi.fn(() => synth) }
})
vi.mock('./synth', () => ({ createSynth }))

/** A fresh module per test: the sound state lives at module level. */
async function load() {
  vi.resetModules()
  return import('./control')
}

describe('sound control', () => {
  const contexts: { resume: ReturnType<typeof vi.fn> }[] = []
  beforeEach(() => {
    contexts.length = 0
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function (this: { resume: ReturnType<typeof vi.fn> }) {
        this.resume = vi.fn(async () => {})
        contexts.push(this)
      }),
    )
    vi.stubGlobal('window', { AudioContext })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('starts in auto: silent except for the bite', async () => {
    const control = await load()
    expect(control.soundMode()).toBe('auto')
  })

  it('creates the engine on the first press only, and wakes it on every press', async () => {
    const control = await load()
    expect(control.wakeAudio()).toBe(true)
    expect(control.wakeAudio()).toBe(true)
    expect(contexts).toHaveLength(1)
    expect(contexts[0]!.resume).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(createSynth).toHaveBeenCalledWith(contexts[0], 'auto'))
    await vi.waitFor(() => expect(synth.woke).toHaveBeenCalledTimes(2))
  })

  it('tells listeners and the engine when the switch changes the state', async () => {
    const control = await load()
    const listener = vi.fn()
    const off = control.onSoundMode(listener)
    control.wakeAudio()
    control.setSoundMode('on')
    expect(control.soundMode()).toBe('on')
    expect(listener).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(synth.setMode).toHaveBeenCalledWith('on'))
    control.setSoundMode('on')
    expect(listener).toHaveBeenCalledTimes(1)
    off()
    control.setSoundMode('off')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('creates nothing once the visitor turned the sound off', async () => {
    const control = await load()
    control.setSoundMode('off')
    expect(control.wakeAudio()).toBe(false)
    expect(contexts).toHaveLength(0)
  })
})
