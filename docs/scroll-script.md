# Scroll script

The cinematic, scroll-driven experience, act by act. This is a **template**: every `TBD` is filled in phase 6, before any timeline code is written. The scene director and the GSAP timelines read their numbers from here, so keep it current.

## How to fill it

- **Progress** is the page scroll position from `0` (top) to `1` (bottom). Ranges must be contiguous and not overlap.
- **Camera** positions are in metres in character space (origin at the feet, character faces +Z, height 1.2 m).
- **Copy** is Spanish and lives in real HTML in `src/components/sections`, never inside the canvas.
- Every act needs a **reduced-motion** variant and a **mobile** variant, even if it is "same as desktop".
- Every act ends with a **checkpoint**: a scroll position that the review tooling captures and a pass/fail criterion.

## Global settings

| Setting                   | Value |
| ------------------------- | ----- |
| Total scroll length       | TBD   |
| Smooth scroll (Lenis)     | TBD   |
| Pinning strategy          | TBD   |
| Letterbox (ratio, timing) | TBD   |
| Particles (count by tier) | TBD   |
| Film grain and vignette   | TBD   |
| Sound (default off)       | TBD   |
| Reduced-motion strategy   | TBD   |
| Mobile strategy           | TBD   |

## Acts

### Act 0: Egg (loading)

| Field                   | Value |
| ----------------------- | ----- |
| Progress                | TBD   |
| Trigger                 | TBD   |
| Camera                  | TBD   |
| Director state          | TBD   |
| Clip and weights        | TBD   |
| Expression              | TBD   |
| Gaze                    | TBD   |
| Plates glow             | TBD   |
| Post FX                 | TBD   |
| Copy (Spanish)          | TBD   |
| Sound                   | TBD   |
| Reduced motion          | TBD   |
| Mobile                  | TBD   |
| Checkpoint and criteria | TBD   |

### Act 1: Hatch

| Field                   | Value |
| ----------------------- | ----- |
| Progress                | TBD   |
| Trigger                 | TBD   |
| Camera                  | TBD   |
| Director state          | TBD   |
| Clip and weights        | TBD   |
| Expression              | TBD   |
| Gaze                    | TBD   |
| Plates glow             | TBD   |
| Post FX                 | TBD   |
| Copy (Spanish)          | TBD   |
| Sound                   | TBD   |
| Reduced motion          | TBD   |
| Mobile                  | TBD   |
| Checkpoint and criteria | TBD   |

### Act 2: Introduction (orbiting camera)

| Field                   | Value |
| ----------------------- | ----- |
| Progress                | TBD   |
| Trigger                 | TBD   |
| Camera                  | TBD   |
| Director state          | TBD   |
| Clip and weights        | TBD   |
| Expression              | TBD   |
| Gaze                    | TBD   |
| Plates glow             | TBD   |
| Post FX                 | TBD   |
| Copy (Spanish)          | TBD   |
| Sound                   | TBD   |
| Reduced motion          | TBD   |
| Mobile                  | TBD   |
| Checkpoint and criteria | TBD   |

### Act 3: Close-ups (depth of field)

| Field                   | Value |
| ----------------------- | ----- |
| Progress                | TBD   |
| Trigger                 | TBD   |
| Camera                  | TBD   |
| Director state          | TBD   |
| Clip and weights        | TBD   |
| Expression              | TBD   |
| Gaze                    | TBD   |
| Plates glow             | TBD   |
| Post FX                 | TBD   |
| Copy (Spanish)          | TBD   |
| Sound                   | TBD   |
| Reduced motion          | TBD   |
| Mobile                  | TBD   |
| Checkpoint and criteria | TBD   |

### Act 4: Roar

| Field                   | Value |
| ----------------------- | ----- |
| Progress                | TBD   |
| Trigger                 | TBD   |
| Camera                  | TBD   |
| Director state          | TBD   |
| Clip and weights        | TBD   |
| Expression              | TBD   |
| Gaze                    | TBD   |
| Plates glow             | TBD   |
| Post FX                 | TBD   |
| Copy (Spanish)          | TBD   |
| Sound                   | TBD   |
| Reduced motion          | TBD   |
| Mobile                  | TBD   |
| Checkpoint and criteria | TBD   |

### Act 5: Logo assembly

| Field                   | Value |
| ----------------------- | ----- |
| Progress                | TBD   |
| Trigger                 | TBD   |
| Camera                  | TBD   |
| Director state          | TBD   |
| Clip and weights        | TBD   |
| Expression              | TBD   |
| Gaze                    | TBD   |
| Plates glow             | TBD   |
| Post FX                 | TBD   |
| Copy (Spanish)          | TBD   |
| Sound                   | TBD   |
| Reduced motion          | TBD   |
| Mobile                  | TBD   |
| Checkpoint and criteria | TBD   |

### Act 6: Call to action

| Field                   | Value |
| ----------------------- | ----- |
| Progress                | TBD   |
| Trigger                 | TBD   |
| Camera                  | TBD   |
| Director state          | TBD   |
| Clip and weights        | TBD   |
| Expression              | TBD   |
| Gaze                    | TBD   |
| Plates glow             | TBD   |
| Post FX                 | TBD   |
| Copy (Spanish)          | TBD   |
| Sound                   | TBD   |
| Reduced motion          | TBD   |
| Mobile                  | TBD   |
| Checkpoint and criteria | TBD   |

## Checkpoints summary

One row per checkpoint, used by `scripts/review` to capture frames and by the phase 7 QA pass.

| ID   | Act | Progress | Capture name | Pass criteria |
| ---- | --- | -------- | ------------ | ------------- |
| CP-0 | 0   | TBD      | TBD          | TBD           |
| CP-1 | 1   | TBD      | TBD          | TBD           |
| CP-2 | 2   | TBD      | TBD          | TBD           |
| CP-3 | 3   | TBD      | TBD          | TBD           |
| CP-4 | 4   | TBD      | TBD          | TBD           |
| CP-5 | 5   | TBD      | TBD          | TBD           |
| CP-6 | 6   | TBD      | TBD          | TBD           |
