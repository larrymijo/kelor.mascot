/**
 * Kelo's sound, synthesised with Web Audio, so there are no files to
 * download (docs/interaction-script.md). The scene asks for sounds through
 * the bus (bus.ts); this module plays them, when the sound state allows
 * (control.ts):
 *
 * - the bite, heard from the start: a deep growl as he crouches, the rush of
 *   the lunge over a rumble that grows with him, a rattle with the jaw at
 *   its widest, the chomp (two rows of teeth clacking shut over a heavy
 *   thump and a crunch, with the room answering), and a cheeky chirp when he
 *   is back;
 * - once the sound is on, everything else: the runner's 8-bit blips, a voice per tap reaction
 *   (giggle, boing, "hm?", growl, roar), a squeak when he is picked up, a
 *   whoosh when he is tossed, a thud or a pat when he lands, the crack and
 *   pop of the hatch, and a low hum.
 *
 * The output runs through a limiter, so the chomp is loud but never clips,
 * and a short room echo from a generated impulse. Closed, the output fades
 * out and the audio thread is suspended, so a silent page costs nothing.
 *
 * A chunk of its own, created by control.ts inside a press with an
 * AudioContext it hands over: this module never creates one.
 */
import { BITE_SOUNDS, onSound, soundLevels, soundState, type SoundCue } from './bus'
import type { SoundMode } from './control'

/** The shell bursts 30% into the 1.2 s hatch (character.json egg.hatchDurationS). */
const POP_DELAY_S = 0.36
const VOLUME = 0.7
/** After the bite ends, its echo rings out before the output closes. */
const TAIL_MS = 900
/** A press woke the engine for a bite that may follow: sleep again after this. */
const SLEEP_MS = 3000
/** Once closed, the audio thread stops after the fade. */
const SUSPEND_MS = 400

const BITE = new Set<SoundCue>(BITE_SOUNDS)

export interface Synth {
  setMode(mode: SoundMode): void
  /** A press woke the audio thread: let it sleep again soon unless the output opens. */
  woke(): void
}

export function createSynth(ctx: AudioContext, initial: SoundMode): Synth {
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -10
  limiter.knee.value = 6
  limiter.ratio.value = 12
  limiter.attack.value = 0.002
  limiter.release.value = 0.15
  limiter.connect(ctx.destination)
  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(limiter)

  // One second of white noise, shared by every noisy sound.
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const samples = noise.getChannelData(0)
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1

  // The room: a short, dark echo from a decaying noise impulse, mono and
  // under a second, so the convolution stays light on the CPU.
  const room = ctx.createConvolver()
  const length = Math.round(ctx.sampleRate * 0.8)
  const impulse = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = impulse.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp((-4.5 * i) / length) ** 1.6
  }
  room.buffer = impulse
  const roomLevel = ctx.createGain()
  roomLevel.gain.value = 0.3
  room.connect(roomLevel).connect(master)

  // Soft clipping, for grit on the growls and punch on the chomp's thump.
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(2.5 * (i / 511.5 - 1))
  const drive = () => {
    const shaper = ctx.createWaveShaper()
    shaper.curve = curve
    return shaper
  }

  // The hum: two low sines through a lowpass that opens as he fills the screen.
  const humFilter = ctx.createBiquadFilter()
  humFilter.type = 'lowpass'
  humFilter.frequency.value = 260
  const humGain = ctx.createGain()
  humGain.gain.value = 0.08
  humFilter.connect(humGain).connect(master)
  for (const frequency of [55, 82.4]) {
    const oscillator = ctx.createOscillator()
    oscillator.frequency.value = frequency
    oscillator.connect(humFilter)
    oscillator.start()
  }

  /** A gain that rises to `peak` and dies away, feeding the master and, `wet` of it, the room. */
  const envelope = (at: number, peak: number, attack: number, decay: number, wet = 0) => {
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(peak, at + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
    gain.connect(master)
    if (wet > 0) {
      const send = ctx.createGain()
      send.gain.value = wet
      gain.connect(send).connect(room)
    }
    return gain
  }
  const noiseBurst = (at: number, duration: number, filter: AudioNode, out: AudioNode) => {
    const source = ctx.createBufferSource()
    source.buffer = noise
    source.connect(filter).connect(out)
    source.start(at)
    source.stop(at + duration)
  }
  const tone = (
    at: number,
    from: number,
    to: number,
    duration: number,
    out: AudioNode,
    type: OscillatorType = 'sine',
  ) => {
    const oscillator = ctx.createOscillator()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(from, at)
    oscillator.frequency.exponentialRampToValueAtTime(to, at + duration)
    oscillator.connect(out)
    oscillator.start(at)
    oscillator.stop(at + duration + 0.05)
    return oscillator
  }
  const filter = (type: BiquadFilterType, frequency: number, q = 1) => {
    const node = ctx.createBiquadFilter()
    node.type = type
    node.frequency.value = frequency
    node.Q.value = q
    return node
  }
  /** A gain wobbled by a low oscillator: the rattle in a growl. */
  const tremolo = (at: number, duration: number, rate: number, depth: number, out: AudioNode) => {
    const gain = ctx.createGain()
    gain.gain.value = 1 - depth
    gain.connect(out)
    const wobble = ctx.createOscillator()
    wobble.frequency.value = rate
    const amount = ctx.createGain()
    amount.gain.value = depth
    wobble.connect(amount).connect(gain.gain)
    wobble.start(at)
    wobble.stop(at + duration)
    return gain
  }
  /** A rough, buzzing voice: detuned saws and dark noise through a tremolo. */
  const rumbleVoice = (
    at: number,
    duration: number,
    pitch: readonly [from: number, to: number],
    brightness: readonly [from: number, to: number],
    rate: number,
    out: AudioNode,
  ) => {
    const shake = tremolo(at, duration, rate, 0.35, out)
    const dark = filter('lowpass', brightness[0])
    dark.frequency.setValueAtTime(brightness[0], at)
    dark.frequency.exponentialRampToValueAtTime(brightness[1], at + duration)
    const grit = drive()
    dark.connect(grit).connect(shake)
    for (const detune of [1, 1.05]) {
      tone(at, pitch[0] * detune, pitch[1] * detune, duration, dark, 'sawtooth')
    }
    noiseBurst(at, duration, filter('lowpass', 380), shake)
  }

  const sounds = {
    // The hatch.
    crack(at: number) {
      noiseBurst(at, 0.12, filter('highpass', 1800), envelope(at, 0.5, 0.002, 0.1))
      noiseBurst(at + 0.07, 0.08, filter('highpass', 2600), envelope(at + 0.07, 0.3, 0.002, 0.06))
    },
    pop(at: number) {
      tone(at, 520, 180, 0.15, envelope(at, 0.3, 0.005, 0.15))
    },

    // Taps, in order of annoyance.
    giggle(at: number) {
      // Three quick blips, each a little higher: a tickled chuckle.
      const blips = [
        [620, 820],
        [700, 940],
        [800, 1100],
      ] as const
      blips.forEach(([from, to], i) => {
        const start = at + i * 0.09
        tone(start, from, to, 0.07, envelope(start, 0.16, 0.004, 0.08), 'triangle')
      })
    },
    boing(at: number) {
      // A springy rise with a wobble.
      const oscillator = tone(at, 180, 520, 0.18, envelope(at, 0.24, 0.005, 0.34))
      const wobble = ctx.createOscillator()
      wobble.frequency.value = 18
      const depth = ctx.createGain()
      depth.gain.value = 25
      wobble.connect(depth).connect(oscillator.frequency)
      wobble.start(at)
      wobble.stop(at + 0.4)
    },
    hm(at: number) {
      // "Hm?": a short hum, then a questioning rise.
      const out = envelope(at, 0.14, 0.02, 0.32)
      const voice = filter('lowpass', 1200)
      voice.connect(out)
      tone(at, 300, 290, 0.12, voice, 'triangle')
      tone(at + 0.13, 290, 420, 0.14, voice, 'triangle')
    },
    growl(at: number) {
      rumbleVoice(at, 0.7, [92, 68], [420, 420], 23, envelope(at, 0.32, 0.06, 0.55))
    },
    roar(at: number) {
      rumbleVoice(at, 1.0, [84, 60], [760, 480], 26, envelope(at, 0.45, 0.05, 0.85, 0.25))
    },

    // Carried, tossed and landing.
    squeak(at: number) {
      // A rubber toy picked up.
      const out = envelope(at, 0.12, 0.004, 0.13)
      const band = filter('bandpass', 1500, 2)
      band.connect(out)
      const oscillator = tone(at, 900, 1400, 0.07, band, 'triangle')
      oscillator.frequency.exponentialRampToValueAtTime(1100, at + 0.14)
    },
    toss(at: number) {
      const band = filter('bandpass', 600, 1.1)
      band.frequency.setValueAtTime(600, at)
      band.frequency.exponentialRampToValueAtTime(2600, at + 0.25)
      noiseBurst(at, 0.35, band, envelope(at, 0.2, 0.08, 0.25))
    },
    thud(at: number) {
      tone(at, 110, 42, 0.22, envelope(at, 0.4, 0.004, 0.22))
      noiseBurst(at, 0.12, filter('lowpass', 250), envelope(at, 0.2, 0.002, 0.1))
    },
    pat(at: number) {
      tone(at, 160, 70, 0.12, envelope(at, 0.22, 0.003, 0.12))
      noiseBurst(at, 0.05, filter('lowpass', 400), envelope(at, 0.1, 0.002, 0.04))
    },

    // Kelo Run: square-wave chips, like an old handheld.
    blip(at: number) {
      tone(at, 420, 840, 0.09, envelope(at, 0.1, 0.003, 0.08), 'square')
    },
    coin(at: number) {
      tone(at, 988, 988, 0.06, envelope(at, 0.09, 0.002, 0.06), 'square')
      tone(at + 0.07, 1319, 1319, 0.14, envelope(at + 0.07, 0.09, 0.002, 0.14), 'square')
    },
    crash(at: number) {
      tone(at, 330, 70, 0.4, envelope(at, 0.14, 0.004, 0.4), 'square')
      noiseBurst(at, 0.18, filter('lowpass', 1200), envelope(at, 0.12, 0.002, 0.16))
    },

    // The bite.
    biteGrowl(at: number) {
      // Deep and rough, rising while he crouches and turns to you.
      rumbleVoice(at, 1.3, [68, 96], [480, 900], 17, envelope(at, 0.55, 0.3, 1.0, 0.15))
    },
    lunge(at: number) {
      // The rush of air as he grows at you, over a swelling sub.
      const band = filter('bandpass', 250, 0.9)
      band.frequency.setValueAtTime(250, at)
      band.frequency.exponentialRampToValueAtTime(3200, at + 0.55)
      band.frequency.exponentialRampToValueAtTime(700, at + 0.9)
      noiseBurst(at, 0.95, band, envelope(at, 0.4, 0.35, 0.55, 0.2))
      tone(at, 42, 75, 0.85, envelope(at, 0.35, 0.5, 0.45))
    },
    rattle(at: number) {
      // The jaw at its widest, trembling.
      const shake = tremolo(at, 0.2, 32, 0.5, envelope(at, 0.22, 0.01, 0.17))
      const band = filter('bandpass', 900, 1.2)
      band.connect(shake)
      tone(at, 120, 110, 0.18, band, 'sawtooth')
    },
    chomp(at: number) {
      // Two rows of teeth meet: sharp clacks, a beat apart.
      noiseBurst(at, 0.03, filter('highpass', 2600), envelope(at, 0.9, 0.001, 0.028, 0.45))
      const second = at + 0.016
      noiseBurst(second, 0.03, filter('highpass', 2000), envelope(second, 0.7, 0.001, 0.03, 0.45))
      // The weight of the jaws: a heavy low thump, driven into soft clipping.
      const punch = drive()
      punch.connect(envelope(at, 1, 0.003, 0.45, 0.35))
      tone(at, 95, 36, 0.4, punch)
      // A crunchy middle: three quick bursts, each lower.
      for (let i = 0; i < 3; i++) {
        const start = at + 0.01 + i * 0.028
        const band = filter('bandpass', 1100 - i * 200, 0.9)
        noiseBurst(start, 0.05, band, envelope(start, 0.5 - i * 0.12, 0.002, 0.05, 0.4))
      }
    },
    smug(at: number) {
      // Back at his size, pleased with himself: two cheeky chirps.
      tone(at, 660, 990, 0.08, envelope(at, 0.15, 0.004, 0.09), 'triangle')
      const second = at + 0.11
      tone(second, 880, 1320, 0.1, envelope(second, 0.15, 0.004, 0.11), 'triangle')
    },
  } satisfies Record<
    Exclude<SoundCue, 'biteStart' | 'biteEnd'> | 'crack' | 'pop',
    (at: number) => void
  >

  let mode = initial
  // Created by the press that bites, it may join the bite a frame late.
  let biting = soundState.biting
  let open = false
  let frame = 0
  let closing: ReturnType<typeof setTimeout> | undefined
  let sleeping: ReturnType<typeof setTimeout> | undefined
  let suspending: ReturnType<typeof setTimeout> | undefined

  const loop = () => {
    const now = ctx.currentTime
    // The rumble: louder and brighter as he grows in the bite.
    const grow = soundLevels.rumble
    humFilter.frequency.setTargetAtTime(260 + 900 * grow, now, 0.1)
    humGain.gain.setTargetAtTime(0.08 + 0.12 * grow, now, 0.1)
    frame = requestAnimationFrame(loop)
  }

  /** Open the output while the sound is on, or while the bite plays in 'auto'. */
  const update = () => {
    const next = mode === 'on' || (mode === 'auto' && biting)
    if (next === open) return
    open = next
    document.documentElement.toggleAttribute('data-sound-open', open)
    const now = ctx.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setTargetAtTime(open ? VOLUME : 0, now, open ? 0.08 : 0.06)
    clearTimeout(suspending)
    clearTimeout(sleeping)
    if (open) {
      void ctx.resume()
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(loop)
    } else {
      cancelAnimationFrame(frame)
      // After the fade, stop the audio thread altogether.
      suspending = setTimeout(() => {
        if (!open) void ctx.suspend()
      }, SUSPEND_MS)
    }
  }

  onSound((cue) => {
    if (cue === 'biteStart') {
      clearTimeout(closing)
      biting = true
      update()
      return
    }
    if (cue === 'biteEnd') {
      clearTimeout(closing)
      closing = setTimeout(() => {
        biting = false
        update()
      }, TAIL_MS)
      return
    }
    const heard = mode === 'on' || (mode === 'auto' && biting && BITE.has(cue))
    if (heard) sounds[cue](ctx.currentTime)
  })

  // The hatch, if the sound is already on while the egg is up.
  const stage = document.querySelector('[data-scene-state]')
  const hatch = new MutationObserver(() => {
    if (mode !== 'on' || stage?.getAttribute('data-scene-state') !== 'hatching') return
    const now = ctx.currentTime
    sounds.crack(now)
    sounds.pop(now + POP_DELAY_S)
  })
  if (stage) hatch.observe(stage, { attributeFilter: ['data-scene-state'] })

  // Quiet while the tab is hidden.
  document.addEventListener('visibilitychange', () => {
    if (!open) return
    if (document.hidden) void ctx.suspend()
    else void ctx.resume()
  })

  const synth: Synth = {
    setMode(next) {
      mode = next
      update()
    },
    woke() {
      if (open) return
      clearTimeout(sleeping)
      sleeping = setTimeout(() => {
        if (!open) void ctx.suspend()
      }, SLEEP_MS)
    },
  }
  update()
  // Created inside a press, the thread runs: sleep until a bite or the switch opens the output.
  if (!open) synth.woke()
  return synth
}
