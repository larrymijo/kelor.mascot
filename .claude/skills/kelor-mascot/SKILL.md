---
name: kelor-mascot
description: Character bible, canonical names and budgets for the KELOR Interactive 3D mascot (purple chibi bipedal dinosaur). Use for any work that touches the mascot - concept art briefs, the Blender pipeline, GLB export and validation, R3F runtime code (gaze, blink, expressions, director), animation clips, colours, naming, or reviewing whether a design stays on-model and original.
---

# KELOR mascot

The machine-readable contract is `character.json` at the repo root. This skill explains the intent behind it. When the two disagree, `character.json` wins and this file must be updated in the same PR.

## Identity

An adorable, chibi, bipedal dinosaur hatched from a hexagonal egg. Curious, warm, a little clumsy; it notices you (the eyes follow the cursor) and reacts with small, readable gestures. It is the living version of the KELOR logo: the logo's isometric hexagon becomes its egg and its dorsal plates.

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
- **No** hair, fur, feathers, thin spikes, horns, wings, claws, teeth rows, separate fingers or toes.
- **No** morph targets and **no** articulated jaw. Mouth shapes live in the expression atlas.
- Dorsal plates are the only "sharp" element, and they are hexagons with rounded corners.

## Colour

Purple is the accent over the monochrome logo base. Tokens (mirrored in `src/app/globals.css`):

| Token                                        | Hex                                           | Use                                              |
| -------------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| `mascot-700`                                 | `#4A1FA8`                                     | shadow side, plate base, deep accents            |
| `mascot-500`                                 | `#7A3FE4`                                     | main skin, CTA background                        |
| `mascot-300`                                 | `#B794FF`                                     | belly, cheeks, rim light tint                    |
| `mascot-glow`                                | `#D9C7FF`                                     | emissive plates, egg cracks, particles           |
| `ink-900` / `ink-500` / `ink-300` / `ink-50` | `#151515` / `#545454` / `#A6A6A6` / `#F7F7F7` | logo greys: UI, egg shell, eye sclera and pupils |

- The **UI stays monochrome**. Purple only appears on the mascot, glows and the primary CTA.
- White text on `mascot-500` passes WCAG AA (≈ 5.7:1). Never put purple text on the dark background for body copy.

## Brand DNA

- **Hexagonal dorsal plates** along spine and tail, 5 to 7 plates decreasing in size. They glow (`plates` material, emissive `mascot-glow`), driven by a runtime uniform: breathing pulse at idle, full glow on roar and CTA hover.
- **Hexagonal egg** as its origin: a bevelled hexagonal prism whose three visible faces use the logo greys, so it reads as the logo's isometric cube. It is procedural in code (0 KB of assets) and never ships in the GLB.

## Eyes

- Separate geometry: two spheres in one `eyes` mesh, each weighted 100 % to `eye_L` / `eye_R`. Iris and pupil are in the `eyes_basecolor` texture.
- Upper eyelids in one `eyelids` mesh, weighted to `eyelid_L` / `eyelid_R`, rotating closed by `gaze.blink.closedAngleDeg`.
- Catchlights in `eye_highlights`: unlit quads weighted to `head`, so they stay fixed while the eyes rotate.
- Eye and eyelid bones are **procedural**. Animation clips must never key them; the validator fails the GLB if they do.

## Expressions

A 2x2 atlas (`face_atlas`) on the `face` shell, switched by UV offset:

| Expression  | Cell [col, row] | Notes                                       |
| ----------- | --------------- | ------------------------------------------- |
| `neutral`   | [0, 0]          | soft closed smile, default                  |
| `happy`     | [1, 0]          | open smile, blush                           |
| `surprised` | [0, 1]          | small round mouth, raised brows             |
| `roar`      | [1, 1]          | wide open mouth, no teeth, determined brows |

## Canonical names

Use these names exactly, in Blender, in the GLB and in code.

- **Bones (28)**: `root`, `hips`, `spine_01`, `spine_02`, `chest`, `neck_01`, `neck_02`, `head`, `eye_L`, `eye_R`, `eyelid_L`, `eyelid_R`, `tail_01`…`tail_04`, `thigh_L/R`, `shin_L/R`, `foot_L/R`, `upperarm_L/R`, `forearm_L/R`, `hand_L/R`. Left is +X; the character faces +Z.
- **Meshes (6)**: `body`, `face`, `eyes`, `eyelids`, `eye_highlights`, `plates`.
- **Materials (5)**: `body`, `face`, `eyes`, `highlight`, `plates`.
- **Textures (5)**: `body_basecolor`, `body_orm` (AO baked in R), `body_normal` (full tier only), `face_atlas`, `eyes_basecolor`.
- **Clips (6)**: `idle`, `hatch`, `look_around`, `roar`, `jump`, `wave`. 30 fps, no root motion.
- **Files**: `public/models/mascot.full.glb`, `public/models/mascot.lite.glb`.

## Budgets

|                       | lite             | full             |
| --------------------- | ---------------- | ---------------- |
| File size             | ≤ 500 kB         | ≤ 1.5 MB         |
| Triangles             | ≤ 8 000          | ≤ 24 000         |
| Bones                 | ≤ 32             | ≤ 32             |
| Influences per vertex | ≤ 4              | ≤ 4              |
| Draw calls            | ≤ 6              | ≤ 6              |
| Materials             | ≤ 5              | ≤ 5              |
| Textures              | ≤ 4, max 1024 px | ≤ 5, max 2048 px |
| Morph targets         | 0                | 0                |
| Total clip length     | ≤ 30 s           | ≤ 30 s           |

Compression: Meshopt geometry, KTX2 (UASTC for normals and the face atlas, ETC1S for the rest). Check any GLB with:

```bash
corepack pnpm validate:model --file path/to/model.glb --tier full
```

## Runtime behaviour (phases 5 and 6)

- **Gaze** is a layer applied after `AnimationMixer.update`, added on top of the clip pose, never replacing it. Eyes are fast (λ 14, ±35° yaw, ±25° pitch). Neck and head share the slow rotation (λ 5, ±40° yaw, ±25° pitch; shares 0.2 / 0.2 / 0.6). Damping is frame-rate independent: `x += (target - x) * (1 - exp(-λ·dt))`.
- **Life**: breathing (`idle`), tail inertia, random blinks every 2 to 6 s, return to camera after 4 s without a pointer, look at the CTA on hover, hop (`jump`) on click. On touch devices it follows the finger and runs `look_around` when idle.
- **Director**: state machine `egg → hatch → tracking → scroll pose`, blending clip weights.
- **Reduced motion**: no camera orbit, no particles or grain, the hatch is a cut, gaze is calmer (λ × 0.5). Content never depends on the animation.

## Originality guardrails

There are famous purple dinosaurs and dragons. The mascot must never be mistaken for one. Avoid:

- A green or yellow belly, a toothy wide grin, spots, a rounded "T. rex costume" posture with tiny head (children's TV purple dinosaur).
- Wings, horns, a pointed snout or a flame-tipped tail (video-game purple dragon).
- Saddles, shells, collars, big noses or a long neck (other famous cartoon dinosaurs).

What makes it ours: violet-blue hue (not red-purple), glowing **hexagonal** plates, the logo-grey hexagonal egg, huge low-set eyes, mitten limbs, and the tail as the main body-language channel. When reviewing concept art, compare the silhouette side by side with those references and reject anything that could be confused with them.

## Concept art brief (the owner generates the images)

Ask for a character turnaround that an image-to-3D service can reconstruct:

- Views: front, three-quarter, side, back. Same character, same scale, **A-pose** (arms 30° down), mouth closed, neutral expression.
- Flat, even lighting, no cast shadows, plain light-grey background, no text or watermark.
- Clean, stylised 3D render look (soft clay/vinyl toy), not a painting.
- Prompt skeleton: _"Character turnaround sheet of an original chibi bipedal baby dinosaur mascot, violet-blue skin (#7A3FE4) with lavender belly (#B794FF), huge round eyes set low, mitten hands and feet, thick tapering tail, five rounded hexagonal glowing plates along the spine, soft vinyl-toy 3D render, A-pose, front, side, three-quarter and back views, flat studio lighting, plain light grey background."_
- Save chosen images in `assets/concept/` as `concept-<view>-<nn>.png` (≤ 2 MB each).

## Name candidates (pending the owner's choice)

1. **Kelo**: derived from KELOR, so the mascot carries the studio name.
2. **Mora**: Spanish for blackberry, a purple fruit loved in Ecuador; warm and local.
3. **Ovi**: from _ovum_ and a nod to the oviraptor; it was born from the egg.
4. **Hexi**: from the hexagon of the logo, the egg and the plates.
5. **Tesi**: from _tesela_, a tile of a tessellation, like the hexagonal plates.

When a name is chosen, set `meta.name` in `character.json` and update this section.

## Review checklist for mascot work

- [ ] `corepack pnpm validate:model` passes for both tiers.
- [ ] Names match this file exactly (bones, meshes, materials, clips).
- [ ] Silhouette reads at 64 px and passes the originality guardrails.
- [ ] Purple stays on the mascot, glows and the CTA only.
- [ ] Reduced-motion behaviour verified.
- [ ] Budgets unchanged, or the change is justified in `docs/decisions.md`.
