@AGENTS.md

# KELOR Interactive: promotional site with a 3D mascot

Promotional website for KELOR Interactive. The star is a 3D mascot, **Kelo**: an adorable chibi bipedal dinosaur, purple, that follows the cursor with its eyes inside a cinematic, scroll-driven experience. Goals, in order: it must look very 3D, load exceptionally fast, and feel cinematic.

The site copy is **Spanish** (`lang="es"`). Code, file names, commits, PRs and repo docs are **English**.

## Stack (pinned; see `docs/decisions.md` for why)

| Area              | Choice                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| Framework         | Next.js 16.3 (App Router, Turbopack), React 19.2.x, TypeScript 5.9                                   |
| Styling           | Tailwind CSS v4 (tokens in `src/app/globals.css`)                                                    |
| 3D (phase 2+)     | three r186, @react-three/fiber 9, @react-three/drei 10, @react-three/postprocessing 3 (bundles N8AO) |
| Motion (phase 5+) | GSAP 3.15 (ScrollTrigger, SplitText), Lenis                                                          |
| Debug             | leva (dev only, never in production bundles)                                                         |
| Tests             | Vitest 5 for pure logic, Playwright for captures (uses installed Chrome)                             |
| Assets (phase 3+) | gltf-transform, KTX-Software 4.4+, sharp, headless Blender (CPU)                                     |
| Tooling           | pnpm 12 via corepack, ESLint 9 flat config, Prettier 3                                               |
| Hosting           | Vercel; heavy media on Cloudflare R2 or Vercel Blob (decided in phase 4)                             |

Version constraints that matter:

- React stays on **19.2.x** because @react-three/fiber 9.7 requires `react <19.3`.
- TypeScript stays on **5.9** and ESLint on **9** until Next 16 officially supports TS 7 and ESLint 10.
- three is pinned to **0.186.x** because postprocessing 6.39 requires `three <0.187`. Upgrade both together.
- Studio lighting uses drei `Lightformer`s only: `Environment` presets download HDR files from a CDN.

## Hard constraints

- **Nothing heavy runs on the owner's machine** (Intel i5, integrated GPU, little disk, no Blender). Blender, KTX encoding, renders and heavy builds run in GitHub Actions or a cloud session.
- Reviews happen on **Vercel previews**, in Chrome on an integrated GPU and on a phone. Performance targets assume that hardware.
- **No secrets in the repo.** If a key is needed, name the env var and where to create it (Vercel project settings or GitHub Actions secrets).
- **`prefers-reduced-motion` and accessibility are day-one requirements**, not polish.

## Working conventions

- Enter plan mode before every phase and wait for approval before implementing.
- One branch and one PR per phase (`feat/phase-<n>-<slug>`). One commit per logical unit, Conventional Commits.
- PR description: what changes, why, how to test, preview link, performance and accessibility checklist (template in `.github/pull_request_template.md`).
- Never add AI attribution (co-author trailers, "generated with" lines) to commits or PRs.
- The owner creates GitHub repos and imports into Vercel; `gh` is not installed locally.
- Run commands through corepack: `corepack pnpm <script>` (pnpm is not installed globally).

## Budgets

| Metric                                            | Budget                                             |
| ------------------------------------------------- | -------------------------------------------------- |
| Initial JS (excluding the lazily loaded 3D chunk) | ≤ 150 kB gzip                                      |
| Deferred 3D JS (the stage chunk)                  | ≤ 420 kB gzip                                      |
| LCP (4G, mid-range phone)                         | < 2.0 s                                            |
| CLS                                               | 0                                                  |
| TBT                                               | < 200 ms                                           |
| Mascot GLB                                        | lite ≤ 500 kB, full ≤ 1.5 MB (Meshopt + KTX2)      |
| Frame rate                                        | 60 fps on Intel integrated GPU at quality `medium` |
| Lighthouse accessibility                          | ≥ 95                                               |

Model budgets (triangles, bones, textures, draw calls, clips) live in `character.json` and are enforced by `pnpm validate:model`. JS budgets are enforced by `pnpm size` after a build.

## Character bible (summary)

Full bible, canonical names and name candidates: `.claude/skills/kelor-mascot/SKILL.md`.

- Chibi bipedal dinosaur: big head (~40 % of height), rounded body, short legs, small arms, expressive tail with 4 bones.
- Purple is the accent (tokens `mascot-700/500/300` + `mascot-glow`) over the logo's monochrome base. **UI stays monochrome**; purple is for the mascot, glows and the CTA.
- Brand DNA: hexagonal dorsal plates that can light up, and a hexagonal egg as its origin.
- Big eyes as separate geometry (spheres with pupils and eyelids) plus fixed highlights. The eyes follow the cursor.
- Expressions via a UV-offset texture atlas (neutral, happy, surprised, roar). No sculpted morph targets, no articulated jaw.
- No hair, thin spikes or separate fingers: closed, rounded shapes only.
- Must be clearly original. Never resemble well-known purple dinosaurs or dragons.

## Character contract (summary)

`character.json` is the single source of truth, validated by `src/lib/character/schema.ts` (Zod) in tests. Never hard-code its values elsewhere.

- Units metres, +Y up, +Z forward, origin at the feet, height 1.2 m.
- 28 bones with exact names (`root`, `hips`, `spine_01`… `tail_04`, `eye_L`, `eyelid_R`…). Eye and eyelid bones are procedural: clips must not key them.
- Meshes: `body`, `face`, `eyes`, `eyelids`, `eye_highlights`, `plates`. The egg is procedural and never ships in the GLB.
- Clips: `idle`, `hatch`, `look_around`, `roar`, `jump`, `wave`, at 30 fps, no root motion.
- Gaze: eyes fast (±35°/±25°), neck + head slow (±40°/±25°), frame-rate independent damping, applied after the mixer as a layer on top of the clip.
- Quality tiers `high` / `medium` / `low`, picked at boot and adjusted with drei's `PerformanceMonitor`.

## Layout

```
src/app                 routes, layout, global CSS tokens
src/components/sections page sections (scroll acts)
src/components/three    R3F scene, mascot, egg, effects (client only)
src/components/ui       monochrome UI primitives
src/lib                 pure logic (character contract, copy, math); unit tested
scripts/assets          GLB validation and asset processing (Node)
scripts/blender         headless Blender pipeline (Python, phase 3)
scripts/review          capture and review tooling
assets/concept          concept art chosen by the owner (input to phase 3)
docs/                   scroll script, decisions log
assets/source           image-to-3D sources (stand-in until the owner delivers kelo-raw.glb)
assets/model            fit.json: how the pipeline turns a source into the contract model
assets/review           committed review renders and pipeline logs
public/models           GLBs built by the model pipeline, validated against character.json
```

## Stage architecture (phase 2)

- `src/components/sections/StageMount.tsx` is the client boundary: it lazy-loads `src/components/three/Experience.tsx` with `next/dynamic` (`ssr: false`) and keeps the static brand mark until the first frame.
- `src/components/three/Stage.tsx` is the only place that creates the Canvas. It picks the boot tier, pauses off screen, and drives the boot sequence.
- Scene state lives in the zustand store `src/components/three/store.ts`; pure logic (boot sequence, quality tiers, framing, damping) lives in `src/lib` and is unit tested.
- The mascot is wrapped by `MascotRig` (clips, expressions, plate glow); all lookups use contract names.
- React Compiler lint rules forbid mutating hook values: keep three.js mutations inside classes like `MascotRig` or read objects with `get()` inside effects.
- `?debug` opens the leva panel and FPS meter on local and preview builds, never on production.

## Model pipeline (phase 3)

- `assets/model/fit.json` names the image-to-3D source (`assets/source/*.glb`) and every model-specific knob; `scripts/assets/fit.ts` validates it.
- `corepack pnpm build:model` runs normalise and skeleton fit (Node), retopology, UVs, bakes and weights (Blender 5.2 LTS), assembly with the shared placeholder code (Node), strict validation and review renders (Blender).
- Blender never runs locally. The Model workflow runs on feature-branch pushes that touch the source, fit, pipeline or contract, and commits `public/models` plus `assets/review/phase-3` (renders, `pipeline.log`, `summary.json`) back to the branch: `git pull` before pushing again.
- Review every run through the committed renders: rest views, face close-up, topology, bone heads and each clip at mid-pose.
- Locally, `node scripts/assets/model/run.mjs --until rig` runs the Node steps into `build/model`.

## Commands

```bash
corepack pnpm dev              # local dev server
corepack pnpm check            # typecheck, lint, format, tests, strict model validation, placeholder freshness, build, bundle budget
corepack pnpm validate:model   # validate GLBs in public/models against character.json (strict)
corepack pnpm build:model      # full model pipeline (CI; needs Blender)
corepack pnpm build:placeholder # placeholder GLBs into build/placeholder (--public to overwrite the model)
corepack pnpm size             # bundle report and JS budgets (after build)
corepack pnpm e2e              # Playwright: 3D hero, reduced motion, keyboard, debug panel, captures (after build)
```

CI (`.github/workflows/ci.yml`) runs the same checks plus the e2e suite on every PR and uploads the captures as an artifact.
