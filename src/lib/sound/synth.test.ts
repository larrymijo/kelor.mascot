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
    threshold: param(),
    knee: param(),
    ratio: param(),
    attack: param(),
    release: param(),
    buffer: null,
    curve: null,
    connect: <T>(next: T) => next,
    start: vi.fn(),
    stop: vi.fn(),
  })
  const gains: ReturnType<typeof node>[] = []
  const sources: ReturnType<typeof node>[] = []
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
    createDynamicsCompressor: node,
    createConvolver: node,
    createWaveShaper: node,
    createOscillator: () => {
      const source = node()
      sources.push(source)
      return source
    },
    createBufferSource: () => {
      const source = node()
      sources.push(source)
      return source
    },
    createBuffer: (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    resume: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
  }
  const create = (mode: Parameters<typeof createSynth>[1]) => {
    const synth = createSynth(context as unknown as AudioContext, mode)
    // The master is the first gain; everything created so far is the hum.
    return { synth, master: gains[0]!, idle: sources.length }
  }
  return { context, sources, create }
}

/** Plays one cue and says whether it made any sound. */
function heard(sources: unknown[], cue: Parameters<typeof playSound>[0]) {
  const before = sources.length
  playSound(cue)
  return sources.length > before
}

describe('createSynth', () => {
  const unsubscribe: (() => void)[] = []
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('AudioContext', vi.fn())
    vi.stubGlobal('document', {
      hidden: false,
      querySelector: () => null,
      addEventListener: vi.fn(),
      documentElement: { toggleAttribute: vi.fn() },
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
    // Every synth stays subscribed to the bus: silence the old ones.
    for (const off of unsubscribe) off()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('never creates an AudioContext: control.ts hands one over from a press', () => {
    const { create } = fakeContext()
    const { synth } = create('auto')
    unsubscribe.push(() => synth.setMode('off'))
    expect(AudioContext).not.toHaveBeenCalled()
  })

  it('starts closed and lets the audio thread sleep, until the bite plays', () => {
    const { context, sources, create } = fakeContext()
    const { synth, master } = create('auto')
    unsubscribe.push(() => synth.setMode('off'))
    expect(master.gain.value).toBe(0)
    expect(master.gain.setTargetAtTime).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3000)
    expect(context.suspend).toHaveBeenCalled()

    // Taps, carrying and landing stay silent before the sound is on...
    for (const cue of ['giggle', 'growl', 'squeak', 'thud'] as const) {
      expect(heard(sources, cue)).toBe(false)
    }
    // ...and so do the bite's sounds outside the bite.
    expect(heard(sources, 'chomp')).toBe(false)

    playSound('biteStart')
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(expect.any(Number), 0, 0.08)
    expect(context.resume).toHaveBeenCalled()
    expect(document.documentElement.toggleAttribute).toHaveBeenLastCalledWith(
      'data-sound-open',
      true,
    )
    for (const cue of ['biteGrowl', 'lunge', 'rattle', 'chomp', 'smug'] as const) {
      expect(heard(sources, cue)).toBe(true)
    }
    // A tap reaction during the bite is still not the bite.
    expect(heard(sources, 'giggle')).toBe(false)

    // The echo rings out, then the output closes.
    playSound('biteEnd')
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(expect.any(Number), 0, 0.08)
    vi.advanceTimersByTime(1000)
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.06)
    expect(heard(sources, 'chomp')).toBe(false)
  })

  it('plays the runner from the start while it is open, and nothing else', () => {
    const { sources, create } = fakeContext()
    const { synth, master } = create('auto')
    unsubscribe.push(() => synth.setMode('off'))
    expect(heard(sources, 'blip')).toBe(false)

    playSound('gameStart')
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(expect.any(Number), 0, 0.08)
    expect(document.documentElement.toggleAttribute).toHaveBeenLastCalledWith(
      'data-sound-open',
      true,
    )
    for (const cue of ['blip', 'coin', 'crash'] as const) expect(heard(sources, cue)).toBe(true)
    // Kelo's own sounds wait for the switch, and the bite's for the bite.
    expect(heard(sources, 'giggle')).toBe(false)
    expect(heard(sources, 'chomp')).toBe(false)

    // Closed, the last crash rings out, then the output closes.
    playSound('gameEnd')
    vi.advanceTimersByTime(500)
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.06)
    expect(heard(sources, 'blip')).toBe(false)

    // Once the visitor turned the sound off, the runner is silent too.
    synth.setMode('off')
    playSound('gameStart')
    expect(heard(sources, 'coin')).toBe(false)
    playSound('gameEnd')
  })

  it('joins a bite already playing when the biting press creates it', () => {
    playSound('biteStart')
    const { sources, create } = fakeContext()
    const { synth, master } = create('auto')
    unsubscribe.push(() => synth.setMode('off'))
    expect(master.gain.setTargetAtTime).toHaveBeenCalledWith(expect.any(Number), 0, 0.08)
    expect(heard(sources, 'lunge')).toBe(true)
    playSound('biteEnd')
  })

  it('plays everything once on, and nothing once off, the bite included', () => {
    const { sources, create } = fakeContext()
    const { synth, master } = create('on')
    unsubscribe.push(() => synth.setMode('off'))
    expect(master.gain.setTargetAtTime).toHaveBeenCalledWith(expect.any(Number), 0, 0.08)
    expect(requestAnimationFrame).toHaveBeenCalled()
    for (const cue of ['giggle', 'boing', 'hm', 'growl', 'roar', 'toss', 'pat', 'chomp'] as const) {
      expect(heard(sources, cue)).toBe(true)
    }

    synth.setMode('off')
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, 0.06)
    expect(cancelAnimationFrame).toHaveBeenCalled()
    playSound('biteStart')
    expect(heard(sources, 'chomp')).toBe(false)
    expect(heard(sources, 'giggle')).toBe(false)
    playSound('biteEnd')
  })
})
