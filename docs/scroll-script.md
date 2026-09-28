# Scroll script

The cinematic, scroll-driven experience, act by act. The scene timeline (`src/lib/cinematic/acts.ts`) and the GSAP engine read their numbers from here, so keep the two in step: change this file first, then the code.

The direction, from the owner: very polished, built on the mascot's impact, its definition and good graphics, with almost no text.

## How to read it

- **Progress** is the page scroll position from `0` (top) to `1` (bottom). Ranges are contiguous and never overlap.
- **Camera** is given as an orbit around Kelo: azimuth in degrees (0 in front, on +Z; positive towards his left, +X), elevation in degrees, and distance as a multiple of the hero framing that `frameSubject` computes for the current screen, so every value works on any aspect. The target is a height in metres (Kelo is 1.2 m tall, origin at his feet). The field of view is 30° unless stated.
- **Copy** is Spanish and lives in real HTML in `src/components/sections`, never inside the canvas.
- **Director state** is one of `egg`, `hatch`, `tracking` or `scroll` (`src/lib/behaviour/director.ts`). **Gaze** names the attention: `camera`, `pointer`, `cta` or `off`.
- Every act has a **reduced-motion** and a **mobile** variant, and ends with a **checkpoint** that the review tooling captures.

## Global settings

| Setting                   | Value                                                                                                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total scroll length       | 600 `svh`: the first screen, then five more of scroll.                                                                                                                                                                 |
| Smooth scroll (Lenis)     | On fine pointers only, lerp 0.09. Off on touch devices and with reduced motion.                                                                                                                                        |
| Pinning strategy          | The stage is one fixed, full-viewport layer behind the page. The acts are tall sections that carry the text. One ScrollTrigger scrubs a single progress value over the whole document, smoothed over 0.6 s.            |
| Letterbox (ratio, timing) | Bars grow to 7% of the height each by 0.04, reach 11% at the gulp's peak, return to 7% for Meet and Detail, and open to nothing by 0.90. Mobile peaks at 4%. None with reduced motion.                                 |
| Particles (count by tier) | Purple, 600, 250 or 80 by tier (`character.json`). They drift upwards, burst at the hatch, and swirl into his mouth during the gulp. None with reduced motion.                                                         |
| Film grain and vignette   | Grain follows the tier and is off with reduced motion. Vignette darkness is 0.6 at rest, 0.8 at the gulp's peak and 0.5 in the finale.                                                                                 |
| Sound (default off)       | A toggle with `aria-pressed`, off by default. Web Audio synthesises an ambient hum, the hatch crack, the gulp and act whooshes. Nothing is created before the first press.                                             |
| Reduced-motion strategy   | No smooth scroll, and Kelo never scales or orbits. Acts cut between still shots with a short fade: hero, three-quarter, eyes, finale. No particles, grain, shake or chromatic aberration. Text appears without moving. |
| Mobile strategy           | Portrait framings from `frameSubject`, native scrolling, particles by tier, depth of field on the high tier only, letterbox at 4%.                                                                                     |

## Acts

### Act 0: Egg (loading)

| Field                   | Value                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------- |
| Progress                | 0, while loading                                                                        |
| Trigger                 | Page load, until the lite model is ready and the egg's minimum display time has passed. |
| Camera                  | Azimuth 0°, elevation 7°, distance 1.15, target 0.45 m.                                 |
| Director state          | `egg`                                                                                   |
| Clip and weights        | None: the mascot is hidden.                                                             |
| Expression              | `neutral`                                                                               |
| Gaze                    | `off`                                                                                   |
| Plates glow             | Off                                                                                     |
| Post FX                 | Key light as a narrow spotlight on the egg; bloom on the cracks; vignette 0.7.          |
| Copy (Spanish)          | None                                                                                    |
| Sound                   | Ambient hum                                                                             |
| Reduced motion          | Same shot; the wobble stays small.                                                      |
| Mobile                  | Same, portrait framing.                                                                 |
| Checkpoint and criteria | CP-0 `cp0-egg`: the egg is visible and the scene reports `egg`.                         |

### Act 1: Hatch

| Field                   | Value                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Progress                | 0, once loaded                                                                                                            |
| Trigger                 | The boot sequence's hatch, on load.                                                                                       |
| Camera                  | Pushes in from distance 1.15 to 1.0 over the hatch, with a short kick when the shell bursts.                              |
| Director state          | `hatch`, then `tracking`                                                                                                  |
| Clip and weights        | `hatch`, then `idle`                                                                                                      |
| Expression              | `surprised`, then `happy`                                                                                                 |
| Gaze                    | `off` during the hatch, then `pointer` or `camera`                                                                        |
| Plates glow             | Three quick flashes, then the breathing glow                                                                              |
| Post FX                 | Crack light flares, a bloom spike and a particle burst at the pop.                                                        |
| Copy (Spanish)          | A small "Desliza" cue appears once he is out.                                                                             |
| Sound                   | Crack, then pop                                                                                                           |
| Reduced motion          | The hatch is a cut: no push-in, no kick, no burst.                                                                        |
| Mobile                  | Same, portrait framing.                                                                                                   |
| Checkpoint and criteria | CP-1 `cp1-hatched`: the scene reports `ready`, Kelo is on screen and looking at the camera, the "Desliza" cue is visible. |

### Act 2: Gulp

| Field                   | Value                                                                                                                                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Progress                | 0.04–0.32                                                                                                                                                                                                                                             |
| Trigger                 | Scroll                                                                                                                                                                                                                                                |
| Camera                  | 0.04–0.16: he grows from scale 1 to 5 while the camera dollies to his face, target rising to the mouth. 0.16–0.20: the camera closes on the mouth. 0.20–0.24: held in black. 0.24–0.32: pulls back to the hero framing as he shrinks back to scale 1. |
| Director state          | `scroll`                                                                                                                                                                                                                                              |
| Clip and weights        | `idle`                                                                                                                                                                                                                                                |
| Expression              | `roar` from 0.10 to 0.24, then `happy`, with a blink at 0.30                                                                                                                                                                                          |
| Gaze                    | `camera`                                                                                                                                                                                                                                              |
| Plates glow             | Rising to twice the rest level at 0.16                                                                                                                                                                                                                |
| Post FX                 | Letterbox to 11%, vignette to 0.8, a touch of chromatic aberration rising to 0.16. An iris closes on the mouth from 0.16 to 0.20 and opens from 0.24 to 0.28. Particles swirl towards the mouth.                                                      |
| Copy (Spanish)          | None                                                                                                                                                                                                                                                  |
| Sound                   | A rising rumble, then the gulp                                                                                                                                                                                                                        |
| Reduced motion          | Skipped: he stays at scale 1 in the hero shot, and a short fade marks the act.                                                                                                                                                                        |
| Mobile                  | Same, portrait framing.                                                                                                                                                                                                                               |
| Checkpoint and criteria | CP-2a `cp2-gulp-mouth` at 0.15: his face fills the screen with the roar face. CP-2b `cp2-gulp-black` at 0.22: the screen is black.                                                                                                                    |

### Act 3: Meet

| Field                   | Value                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Progress                | 0.32–0.55                                                                                                                                               |
| Trigger                 | Scroll                                                                                                                                                  |
| Camera                  | A full orbit, azimuth 0° to 360°, eased, elevation 10°, distance 1.05, target 0.55 m. On desktop Kelo sits right of centre to leave room for the words. |
| Director state          | `scroll`                                                                                                                                                |
| Clip and weights        | `idle`                                                                                                                                                  |
| Expression              | `happy`                                                                                                                                                 |
| Gaze                    | `camera`: he looks back over his shoulder as the camera passes behind him, within his limits.                                                           |
| Plates glow             | 1.4 times the rest level                                                                                                                                |
| Post FX                 | Hero lighting with a purple rim; letterbox 7%.                                                                                                          |
| Copy (Spanish)          | **Conoce a Kelo** (the page `h1`), then _la mascota de KELOR Interactive_. Revealed at 0.36, gone by 0.52.                                              |
| Sound                   | A soft whoosh on entry                                                                                                                                  |
| Reduced motion          | A still three-quarter shot at azimuth 35°, no orbit.                                                                                                    |
| Mobile                  | Same orbit, portrait framing; the words sit in the lower third.                                                                                         |
| Checkpoint and criteria | CP-3 `cp3-meet` at 0.42: the heading and its line are visible and readable, and Kelo is in frame.                                                       |

### Act 4: Detail

| Field                   | Value                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Progress                | 0.55–0.80                                                                                                                                                                |
| Trigger                 | Scroll                                                                                                                                                                   |
| Camera                  | 0.55–0.67: eyes close-up, azimuth 10°, elevation 4°, distance 0.3, target 0.98 m. 0.67–0.80: plates close-up, azimuth 150°, elevation 18°, distance 0.45, target 0.62 m. |
| Director state          | `scroll`                                                                                                                                                                 |
| Clip and weights        | `idle`                                                                                                                                                                   |
| Expression              | `happy`, with a blink at 0.62                                                                                                                                            |
| Gaze                    | `camera` during the eyes, `off` during the plates                                                                                                                        |
| Plates glow             | Twice the rest level during the plates                                                                                                                                   |
| Post FX                 | Bokeh depth of field focused on the eyes, then on the plates, on medium and high. Letterbox 7%.                                                                          |
| Copy (Spanish)          | None                                                                                                                                                                     |
| Sound                   | A soft whoosh on each shot                                                                                                                                               |
| Reduced motion          | The same two shots as stills.                                                                                                                                            |
| Mobile                  | Same shots, portrait framing; depth of field on high only.                                                                                                               |
| Checkpoint and criteria | CP-4a `cp4-eyes` at 0.61: both eyes sharp and filling the frame. CP-4b `cp4-plates` at 0.74: the plates sharp and glowing.                                               |

### Act 5: Finale

| Field                   | Value                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Progress                | 0.80–1.00                                                                                                                                                                                  |
| Trigger                 | Scroll                                                                                                                                                                                     |
| Camera                  | A low hero angle: azimuth 20°, elevation −6°, distance 1.05, target 0.6 m.                                                                                                                 |
| Director state          | `scroll`                                                                                                                                                                                   |
| Clip and weights        | `idle`, with a one-shot `wave` at 0.88                                                                                                                                                     |
| Expression              | `happy`                                                                                                                                                                                    |
| Gaze                    | `cta`, else `pointer`                                                                                                                                                                      |
| Plates glow             | 1.2 times the rest level                                                                                                                                                                   |
| Post FX                 | The two egg halves, which are the halves of the KELOR mark, fly in from 0.82 and lock together behind him by 0.90, dark grey with a purple rim. The letterbox opens by 0.90; vignette 0.5. |
| Copy (Spanish)          | Tiny, from 0.86: _¿Quieres una web a medida?_ **Escríbenos**, linking to `https://kelor-interactive.vercel.app/contacto`.                                                                  |
| Sound                   | A low chord as the mark locks                                                                                                                                                              |
| Reduced motion          | A still low angle, with the mark already assembled.                                                                                                                                        |
| Mobile                  | Same, portrait framing; the tiny line sits at the bottom.                                                                                                                                  |
| Checkpoint and criteria | CP-5 `cp5-finale` at 0.95: the mark is assembled behind him, and the contact link is visible and reachable with the keyboard.                                                              |

## Checkpoints summary

One row per checkpoint, used by `scripts/review` and the Playwright cinematic spec to capture frames, and by the phase 7 QA pass.

| ID    | Act | Progress | Capture name     | Pass criteria                                               |
| ----- | --- | -------- | ---------------- | ----------------------------------------------------------- |
| CP-0  | 0   | egg      | `cp0-egg`        | Egg visible; scene reports `egg`                            |
| CP-1  | 1   | hatched  | `cp1-hatched`    | Scene `ready`; Kelo looking at the camera; cue visible      |
| CP-2a | 2   | 0.15     | `cp2-gulp-mouth` | Face fills the screen with the roar face                    |
| CP-2b | 2   | 0.22     | `cp2-gulp-black` | Screen black                                                |
| CP-3  | 3   | 0.42     | `cp3-meet`       | "Conoce a Kelo" and its line visible; Kelo in frame         |
| CP-4a | 4   | 0.61     | `cp4-eyes`       | Eyes sharp and filling the frame                            |
| CP-4b | 4   | 0.74     | `cp4-plates`     | Plates sharp and glowing                                    |
| CP-5  | 5   | 0.95     | `cp5-finale`     | Mark assembled; contact link visible and keyboard-reachable |
