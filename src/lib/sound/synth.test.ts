import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSynth, crossedSounds } from './synth'

describe('crossedSounds', () => {
  it('plays the bite and gulp going forwards only', () => {
    expect(crossedSounds(0.17, 0.18)).toEqual(['gulp'])
    expect(crossedSounds(0.18, 0.17)).toEqual([])
  })

  it('plays act whooshes in both directions', () => {
    expect(crossedSounds(0.32, 0.34)).toEqual(['whoosh'])
    expect(crossedSounds(0.34, 0.32)).toEqual(['whoosh'])
  })

  it('plays the chord as the mark locks', () => {
    expect(crossedSounds(0.89, 0.91)).toEqual(['chord'])
  })

  it('stays quiet on a jump, such as keyboard focus sending the page to the finale', () => {
    expect(crossedSounds(0.1, 0.95)).toEqual([])
  })
})

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
})
