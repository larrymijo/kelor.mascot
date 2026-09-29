import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { playSound } from './bus'
import { createSynth } from './synth'

type Param = Record<
  'setValueAtTime' | 'exponentialRampToValueAtTime' | 'setTargetAtTime' | 'cancelScheduledValues',
  ReturnType<typeof vi.fn>
> & { value: number }

function fakeContext() {
  const param = (): Param => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  })
  const node = () => ({
    type: '',
    gain: param(),
    frequency: param(),
    Q: param(),
    buffer: null,
    connect: <T>(next: T) => next,
    start: vi.fn(),
    stop: vi.fn(),
  })
  const gains: ReturnType<typeof node>[] = []
  const context = {
    currentTime: 0,
    sampleRate: 8000,
    destination: node(),
    createGain: () => {
      const gain = node()
      gains.push(gain)
      return gain
    },
    createBiquadFilter: node,
    createOscillator: node,
    createBufferSource: node,
    createBuffer: (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    resume: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
  }
  return { context, gains }
}

describe('createSynth', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', vi.fn())
    vi.stubGlobal('document', {
      hidden: false,
      querySelector: () => null,
      addEventListener: vi.fn(),
    })
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe() {}
      },
    )
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('never creates an AudioContext: the toggle creates one on the first press', () => {
    const { context } = fakeContext()
    createSynth(context as unknown as AudioContext)
    expect(AudioContext).not.toHaveBeenCalled()
  })

  it('stays silent until it is enabled', () => {
    const { context, gains } = fakeContext()
    const synth = createSynth(context as unknown as AudioContext)
    const master = gains[0]!
    expect(master.gain.value).toBe(0)
    expect(master.gain.setTargetAtTime).not.toHaveBeenCalled()
    expect(requestAnimationFrame).not.toHaveBeenCalled()

    synth.setEnabled(true)
    expect(master.gain.setTargetAtTime).toHaveBeenCalledWith(expect.any(Number), 0, 0.15)
    expect(context.resume).toHaveBeenCalled()
    expect(requestAnimationFrame).toHaveBeenCalled()

    synth.setEnabled(false)
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.06)
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })

  it('plays what the scene asks for only while it is on', () => {
    const { context } = fakeContext()
    const oscillators: unknown[] = []
    const make = context.createOscillator
    context.createOscillator = () => {
      const oscillator = make()
      oscillators.push(oscillator)
      return oscillator
    }
    const synth = createSynth(context as unknown as AudioContext)
    const humOscillators = oscillators.length
    playSound('boop')
    expect(oscillators.length).toBe(humOscillators)
    synth.setEnabled(true)
    playSound('boop')
    expect(oscillators.length).toBe(humOscillators + 1)
    synth.setEnabled(false)
  })
})
