/**
 * Kelo's sound, synthesised with Web Audio, so there are no files to
 * download (docs/interaction-script.md): a low hum whose rumble opens as he
 * grows in the bite, the crack and pop of the hatch, a boop when tapped, a
 * growl when he gets grumpy, the whoosh of the lunge, the clack and gulp of
 * the bite, and a thud when he lands. The scene asks for them through the
 * sound bus (bus.ts); this module plays them.
 *
 * A chunk of its own, loaded on the first press of the sound toggle. The
 * toggle creates the AudioContext inside that click, as Safari requires, and
 * hands it over: this module never creates one, and nothing here runs
 * before createSynth() is called.
 */
import { onSound, soundLevels, type SoundCue } from './bus'

/** The shell bursts 30% into the 1.2 s hatch (character.json egg.hatchDurationS). */
const POP_DELAY_S = 0.36
const VOLUME = 0.6

export interface Synth {
  setEnabled(on: boolean): void
}

export function createSynth(ctx: AudioContext): Synth {
  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)

  // One second of white noise, shared by every noisy sound.
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const samples = noise.getChannelData(0)
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1

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

  /** A gain that rises to `peak` and dies away, feeding the master. */
  const envelope = (at: number, peak: number, attack: number, decay: number) => {
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(peak, at + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
    gain.connect(master)
    return gain
  }
  const noiseBurst = (at: number, duration: number, filter: BiquadFilterNode, out: GainNode) => {
    const source = ctx.createBufferSource()
    source.buffer = noise
    source.connect(filter).connect(out)
    source.start(at)
    source.stop(at + duration)
  }
  const tone = (at: number, from: number, to: number, duration: number, out: GainNode) => {
    const oscillator = ctx.createOscillator()
    oscillator.frequency.setValueAtTime(from, at)
    oscillator.frequency.exponentialRampToValueAtTime(to, at + duration)
    oscillator.connect(out)
    oscillator.start(at)
    oscillator.stop(at + duration + 0.05)
  }
  const filter = (type: BiquadFilterType, frequency: number, q = 1) => {
    const node = ctx.createBiquadFilter()
    node.type = type
    node.frequency.value = frequency
    node.Q.value = q
    return node
  }

  const sounds = {
    crack(at: number) {
      noiseBurst(at, 0.12, filter('highpass', 1800), envelope(at, 0.5, 0.002, 0.1))
      noiseBurst(at + 0.07, 0.08, filter('highpass', 2600), envelope(at + 0.07, 0.3, 0.002, 0.06))
    },
    pop(at: number) {
      tone(at, 520, 180, 0.15, envelope(at, 0.3, 0.005, 0.15))
    },
    gulp(at: number) {
      // The teeth clack shut, then the swallow.
      noiseBurst(at, 0.05, filter('highpass', 2400), envelope(at, 0.55, 0.001, 0.045))
      tone(at, 160, 45, 0.45, envelope(at, 0.5, 0.02, 0.5))
      noiseBurst(at, 0.4, filter('lowpass', 400), envelope(at, 0.25, 0.03, 0.35))
    },
    whoosh(at: number) {
      const band = filter('bandpass', 400, 1.2)
      band.frequency.setValueAtTime(400, at)
      band.frequency.exponentialRampToValueAtTime(2400, at + 0.3)
      band.frequency.exponentialRampToValueAtTime(600, at + 0.65)
      noiseBurst(at, 0.7, band, envelope(at, 0.18, 0.25, 0.4))
    },
    boop(at: number) {
      // A soft, round blip that rises: a poke on a vinyl toy.
      tone(at, 520, 880, 0.11, envelope(at, 0.22, 0.004, 0.13))
    },
    growl(at: number) {
      // A low, rough rumble: a buzzing tone and dark noise, shaken by a tremolo.
      const out = envelope(at, 0.32, 0.06, 0.55)
      const tremolo = ctx.createGain()
      tremolo.gain.value = 0.7
      tremolo.connect(out)
      const wobble = ctx.createOscillator()
      wobble.frequency.value = 23
      const depth = ctx.createGain()
      depth.gain.value = 0.3
      wobble.connect(depth).connect(tremolo.gain)
      wobble.start(at)
      wobble.stop(at + 0.7)
      const buzz = ctx.createOscillator()
      buzz.type = 'sawtooth'
      buzz.frequency.setValueAtTime(92, at)
      buzz.frequency.exponentialRampToValueAtTime(68, at + 0.6)
      buzz.connect(filter('lowpass', 420)).connect(tremolo)
      buzz.start(at)
      buzz.stop(at + 0.7)
      noiseBurst(at, 0.65, filter('lowpass', 300), tremolo)
    },
    thud(at: number) {
      tone(at, 110, 42, 0.22, envelope(at, 0.4, 0.004, 0.22))
      noiseBurst(at, 0.12, filter('lowpass', 250), envelope(at, 0.2, 0.002, 0.1))
    },
  } satisfies Record<SoundCue | 'crack' | 'pop', (at: number) => void>

  let enabled = false
  let frame = 0

  const loop = () => {
    const now = ctx.currentTime
    // The rumble: louder and brighter as he grows in the bite.
    const grow = soundLevels.rumble
    humFilter.frequency.setTargetAtTime(260 + 900 * grow, now, 0.1)
    humGain.gain.setTargetAtTime(0.08 + 0.12 * grow, now, 0.1)
    frame = requestAnimationFrame(loop)
  }
  // Everything the scene asks for, while the sound is on.
  onSound((cue) => {
    if (enabled) sounds[cue](ctx.currentTime)
  })

  // The hatch, if the sound is already on while the egg is up.
  const stage = document.querySelector('[data-scene-state]')
  const hatch = new MutationObserver(() => {
    if (!enabled || stage?.getAttribute('data-scene-state') !== 'hatching') return
    const now = ctx.currentTime
    sounds.crack(now)
    sounds.pop(now + POP_DELAY_S)
  })
  if (stage) hatch.observe(stage, { attributeFilter: ['data-scene-state'] })

  // Quiet while the tab is hidden.
  document.addEventListener('visibilitychange', () => {
    if (!enabled) return
    if (document.hidden) void ctx.suspend()
    else void ctx.resume()
  })

  return {
    setEnabled(on) {
      if (on === enabled) return
      enabled = on
      const now = ctx.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.setTargetAtTime(on ? VOLUME : 0, now, on ? 0.15 : 0.06)
      if (on) {
        void ctx.resume()
        frame = requestAnimationFrame(loop)
      } else {
        cancelAnimationFrame(frame)
        // After the fade, stop the audio thread altogether.
        setTimeout(() => {
          if (!enabled) void ctx.suspend()
        }, 400)
      }
    },
  }
}
