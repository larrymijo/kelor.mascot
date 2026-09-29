---
name: kelor-mascot
description: Character bible, canonical names and budgets for the KELOR Interactive 3D mascot (purple chibi bipedal dinosaur). Use for any work that touches the mascot - concept art briefs, the Blender pipeline, GLB export and validation, R3F runtime code (gaze, blink, expressions, director), animation clips, colours, naming, or reviewing whether a design stays on-model and original.
---

# Kelo, the KELOR mascot

The machine-readable contract is `character.json` at the repo root. This skill explains the intent behind it. When the two disagree, `character.json` wins and this file must be updated in the same PR.

## Identity

An adorable, chibi, bipedal dinosaur hatched from a real dinosaur egg. Curious, warm, a little clumsy; it notices you (the eyes follow the cursor) and reacts with small, readable gestures, and it has a T-rex bite. It is the living version of the KELOR logo: the logo's isometric hexagon becomes its dorsal plates and, in the finale, the mark that frames it.

## Silhouette and proportions

| Trait  | Rule                                                                    |
| ------ | ----------------------------------------------------------------------- |
| Height | 1.2 m in scene units (metres), origin between the feet                  |
| Head   | ~40 % of total height, wide and round, slightly forward of the body     |
| Body   | pear-shaped and soft, belly lighter than the back                       |
| Legs   | short and thick, planted wide, three-toe mitten feet (no separate toes) |
| Arms   | small, rounded, mitten hands (no separate fingers)                      |
| Tail   | thick at the base, tapering, 4 bones, reads clearly in profile          |
| Eyes   | big, set wide and low on the head, the main expressive feature          |

The silhouette must read at 64 px: big head, round body, tail. If it does not read in a black fill, fix the shape, not the texture.

## Shape language (hard rules)

- Closed, rounded, soft forms only. Minimum bevel on every edge.
- **No** hair, fur, feathers, thin spikes, horns, wings, claws, separate fingers or toes.
- **No** morph targets. The mouth is a T-rex jaw on one `jaw` bone: shut at rest behind a smiling lip line, it opens on a row of sharp teeth with two tusks for the roar and the bite. Teeth never show at rest.
- The dorsal plates and the teeth are the only sharp elements; the plates are hexagons with rounded corners.

## Colour

Purple is the accent over the monochrome logo base. Tokens (mirrored in `src/app/globals.css`):

| Token                                        | Hex                                           | Use                                    |
| -------------------------------------------- | --------------------------------------------- | -------------------------------------- |
| `mascot-700`                                 | `#4A1FA8`                                     | shadow side, plate base, deep accents  |
| `mascot-500`                                 | `#7A3FE4`                                     | main skin, CTA background              |
| `mascot-300`                                 | `#B794FF`                                     | belly, cheeks, rim light tint          |
| `mascot-glow`                                | `#D9C7FF`                                     | emissive plates, egg cracks, particles |
| `ink-900` / `ink-500` / `ink-300` / `ink-50` | `#151515` / `#545454` / `#A6A6A6` / `#F7F7F7` | logo greys: UI, eye sclera and pupils  |
| egg shell / speckles                         | `#E6DED0` / `#7E7468`                         | the egg, a warm dinosaur-egg cream     |
| teeth / mouth / tongue                       | `#F4EEE2` / `#2A0E33` / `#D9709F`             | inside the jaw (`colors.mouth`)        |

- The **UI stays monochrome**. Purple only appears on the mascot, glows and the primary CTA.
- White text on `mascot-500` passes WCAG AA (≈ 5.7:1). Never put purple text on the dark background for body copy.

## Brand DNA

- **Hexagonal dorsal plates** along spine and tail, 5 to 7 plates decreasing in size. They glow (`plates` material, emissive `mascot-glow`), driven by a runtime uniform: breathing pulse at idle, full glow on roar and CTA hover.
- **Dinosaur egg** as its origin: a rounded ovoid (0.7 m tall, 0.27 m radius) whose shader draws a cream shell with plates, tubercles and speckles, and glowing cracks along which it opens into a cap and two halves. It is procedural in code (0 KB of assets) and never ships in the GLB.
- The **KELOR mark** closes the story: its two halves lock together behind him in the finale.

## Eyes

- Separate geometry: two spheres in one `eyes` mesh, each weighted 100 % to `eye_L` / `eye_R`. Iris and pupil are in the `eyes_basecolor` texture.
- Upper eyelids in one `eyelids` mesh, weighted to `eyelid_L` / `eyelid_R`, rotating closed by `gaze.blink.closedAngleDeg`.
- Catchlights in `eye_highlights`: unlit discs weighted to `head`, so they stay fixed while the eyes rotate. They sit on the iris of an eye looking at the viewer (the main one upper left, 14 mm, a small one lower right), clear of the open lid; on the white sclera a catchlight is invisible. At runtime they skip tone mapping so they stay pure white.
- On medium and high tiers the eyes get a glassy clearcoat cornea and the skin a soft clearcoat and sheen, the vinyl-toy finish; low keeps the GLB's plain materials.
- Eye, eyelid and jaw bones are **procedural**. Animation clips must never key them; the validator fails the GLB if they do.

## Expressions

A 2x2 atlas (`face_atlas`) on the `face` shell carries the lip line and the blush, switched by UV offset; the jaw opens the mouth (`character.json` `jaw.openDeg`):

| Expression  | Cell [col, row] | Notes                                             |
| ----------- | --------------- | ------------------------------------------------- |
| `neutral`   | [0, 0]          | closed smiling lip line, blush; jaw shut, default |
| `happy`     | [1, 0]          | lifted smile, stronger blush; jaw shut            |
| `surprised` | [0, 1]          | jaw open 12°, light blush                         |
| `roar`      | [1, 1]          | jaw open 30° on the teeth and tusks, light blush  |

The scroll script can open the jaw to its full 38°, and a bite snaps it shut and holds it for 0.35 s.

## Canonical names

Use these names exactly, in Blender, in the GLB and in code.

- **Bones (29)**: `root`, `hips`, `spine_01`, `spine_02`, `chest`, `neck_01`, `neck_02`, `head`, `jaw`, `eye_L`, `eye_R`, `eyelid_L`, `eyelid_R`, `tail_01`…`tail_04`, `thigh_L/R`, `shin_L/R`, `foot_L/R`, `upperarm_L/R`, `forearm_L/R`, `hand_L/R`. Left is +X; the character faces +Z.
- **Meshes (8)**: `body`, `face`, `eyes`, `eyelids`, `eye_highlights`, `plates`, `teeth`, `mouth`.
- **Materials (7)**: `body`, `face`, `eyes`, `highlight`, `plates`, `teeth`, `mouth`.
- **Textures (5)**: `body_basecolor`, `body_orm` (AO baked in R), `body_normal` (full tier only), `face_atlas`, `eyes_basecolor`.
- **Clips (6)**: `idle`, `hatch`, `look_around`, `roar`, `jump`, `wave`. 30 fps, no root motion.
- **Files**: `public/models/mascot.full.glb`, `public/models/mascot.lite.glb`.

## Budgets

|                       | lite             | full             |
| --------------------- | ---------------- | ---------------- |
| File size             | ≤ 250 kB         | ≤ 1500 kB        |
| Triangles             | ≤ 8 000          | ≤ 24 000         |
| Bones                 | ≤ 32             | ≤ 32             |
| Influences per vertex | ≤ 4              | ≤ 4              |
| Draw calls            | ≤ 8              | ≤ 8              |
| Materials             | ≤ 7              | ≤ 7              |
| Textures              | ≤ 4, max 1024 px | ≤ 5, max 2048 px |
| Morph targets         | 0                | 0                |
| Total clip length     | ≤ 30 s           | ≤ 30 s           |

Compression: Meshopt geometry, KTX2 (UASTC for normals and the face atlas, ETC1S for the rest). Check any GLB with:

```bash
corepack pnpm validate:model --file path/to/model.glb --tier full
```

## Model pipeline (phase 3)

The real Kelo comes from the owner's image-to-3D source through `corepack pnpm build:model` (see `scripts/blender/README.md`): normalise, fit the 29-bone rig to measured landmarks, retopologise with Quadriflow, bake base colour, AO and normals, bind with automatic weights capped per role, then add the procedural eyes, lids, catchlights, plates, face shell and jaw (the lip cut, jaw weights, teeth, tusks and mouth cavity) with the same code as the phase 2 placeholder. Tune it through `assets/model/fit.json`, never by hand-editing GLBs. The review renders in `assets/review/phase-3` are the acceptance evidence. The placeholder generator stays as a fallback (`build:placeholder --public`). On stage the body stands in a 22 degree three-quarter turn and the gaze layer turns the head back to the viewer.

## Runtime behaviour (phases 5 and 6)

- **Gaze** is a layer applied after `AnimationMixer.update`, added on top of the clip pose, never replacing it. Eyes are fast (λ 14, ±35° yaw, ±25° pitch). Neck and head share the slow rotation (λ 5, ±40° yaw, ±25° pitch; shares 0.2 / 0.2 / 0.6). Damping is frame-rate independent: `x += (target - x) * (1 - exp(-λ·dt))`. Looking at the camera aims at a point at least 3 m away (times his scale) on the same line, so the eyes stay parallel instead of crossing in the close-ups.
- **Life**: breathing (`idle`), tail inertia, random blinks every 2 to 6 s, return to camera after 4 s without a pointer, look at the CTA on hover, hop (`jump`) on click. On touch devices it follows the finger and runs `look_around` when idle.
- **Director**: state machine `egg → hatch → tracking → scroll pose`, blending clip weights. Implemented in phase 5 (`src/lib/behaviour/director.ts`). In phase 6 the scroll state takes gaze and expression from the scroll script (`docs/scroll-script.md`): the roar face and an opening jaw as he swallows the screen, a bite on the viewer at 0.175, happy afterwards, a blink as he comes back out, the wave in the finale. The hop plays only when a click or tap lands on Kelo, and `data-gaze-target` elements draw his look on hover and keyboard focus.
- **Reduced motion**: no camera orbit, no particles or grain, the hatch is a cut, gaze is calmer (λ × 0.5). Content never depends on the animation.

## Originality guardrails

There are famous purple dinosaurs and dragons. The mascot must never be mistaken for one. Avoid:

- A green or yellow belly, a toothy grin at rest, spots, a rounded "T. rex costume" posture with tiny head (children's TV purple dinosaur).
- Wings, horns, a pointed snout or a flame-tipped tail (video-game purple dragon).
- Saddles, shells, collars, big noses or a long neck (other famous cartoon dinosaurs).

What makes it ours: violet-blue hue (not red-purple), glowing **hexagonal** plates, the speckled cream egg that opens along glowing cracks, huge low-set eyes, mitten limbs, and the tail as the main body-language channel. When reviewing concept art, compare the silhouette side by side with those references and reject anything that could be confused with them.

## Concept art brief (the owner generates the images)

Two images per design, both generated and chosen by the owner:

1. **Hero concept** (for approval): a turnaround sheet with front, three-quarter, side and back views at the same scale, **A-pose** (arms 30° down), mouth closed, neutral expression, the full face and the dorsal plates. Flat even lighting, plain light-grey background, no text or watermark, soft vinyl-toy 3D render look.
   _"Character turnaround sheet of Kelo, an original chibi bipedal baby dinosaur mascot: big round head, pear-shaped soft body, short thick legs with mitten feet, small mitten arms, thick tapering tail, violet-blue skin (#7A3FE4) with a lavender belly (#B794FF), huge round eyes set low on the face, small closed smile, five rounded hexagonal glowing plates along the spine and tail. Soft vinyl-toy 3D render, A-pose, front, three-quarter, side and back views at the same scale, flat even studio lighting, plain light grey background, no text."_
2. **Base image** (input to image-to-3D): the same character and pose with a **blank face (no eyes, mouth or blush) and no dorsal plates**, because eyes, lids, mouth shapes and plates are separate geometry or the expression atlas in the contract.
   _"Same character, same proportions and A-pose, but with a completely smooth blank face (no eyes, no mouth, no blush) and no plates on its back. Full body, centred, flat even lighting, no shadows, plain light grey background."_

Files: `assets/concept/concept-sheet-01.png` and `assets/concept/concept-base-{front,side,back}-01.png` (PNG, at least 1024 px, at most 2 MB). The image-to-3D output goes to `assets/source/kelo-raw.glb`: textured GLB, symmetry on, highest detail, no rig, animation or low-poly remesh, at most 50 MB, on a plan that allows commercial use.

## Name

The mascot is **Kelo** (chosen on 2026-09-22 from Kelo, Mora, Ovi, Hexi and Tesi): derived from KELOR, so the mascot carries the studio name. `meta.name` in `character.json` holds it.

## Review checklist for mascot work

- [ ] `corepack pnpm validate:model` passes for both tiers.
- [ ] Names match this file exactly (bones, meshes, materials, clips).
- [ ] Silhouette reads at 64 px and passes the originality guardrails.
- [ ] Purple stays on the mascot, glows and the CTA only.
- [ ] Reduced-motion behaviour verified.
- [ ] Budgets unchanged, or the change is justified in `docs/decisions.md`.
