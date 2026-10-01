@AGENTS.md

# KELOR Interactive: promotional site with a 3D mascot

Promotional website for KELOR Interactive, a minimal dark showcase for the studio's prospective clients. The star is a 3D mascot, **Kelo**: an adorable chibi bipedal dinosaur, purple, that hatches from the egg the visitor drops and lives on one screen: it follows the cursor with its eyes, reacts to taps, can be carried around, orbited, lit and x-rayed on desktop, bites the screen when pestered, and opens a pixel-art runner on the ninth tap on a phone. Goals, in order: it must look very 3D, load exceptionally fast, and feel alive.

The site copy is **Spanish** (`lang="es"`). Code, file names, commits, PRs and repo docs are **English**.

## Stack (pinned; see `docs/decisions.md` for why)

| Area                  | Choice                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| Framework             | Next.js 16.3 (App Router, Turbopack), React 19.2.x, TypeScript 5.9                                   |
| Styling               | Tailwind CSS v4 (tokens in `src/app/globals.css`)                                                    |
| 3D (phase 2+)         | three r186, @react-three/fiber 9, @react-three/drei 10, @react-three/postprocessing 3 (bundles N8AO) |
| Interaction (phase 8) | Pure state machines and physics in `src/lib/behaviour` and `src/lib/live`; no animation library      |
| Debug                 | leva (dev only, never in production bundles)                                                         |
| Tests                 | Vitest 5 for pure logic, Playwright for captures (uses installed Chrome)                             |
| Assets (phase 3+)     | gltf-transform, KTX-Software 4.4+, sharp, headless Blender (CPU)                                     |
| Tooling               | pnpm 12 via corepack, ESLint 9 flat config, Prettier 3                                               |
| Hosting               | Vercel; the models ship from `public/` on Vercel's CDN                                               |

Version constraints that matter:

- React stays on **19.2.x** because @react-three/fiber 9.7 requires `react <19.3`.
- TypeScript stays on **5.9** and ESLint on **9** until Next 16 officially supports TS 7 and ESLint 10.
- three is pinned to **0.186.x** because postprocessing 6.39 requires `three <0.187`. Upgrade both together.
- Studio reflections are emissive panels baked once into a cube map (`src/components/three/studioEnvironment.ts`). No HDR files: drei's `Environment` presets download from a CDN, and its module bundles HDR, EXR and gain-map loaders.

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

| Metric                                            | Budget                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| Initial JS (excluding the lazily loaded 3D chunk) | ≤ 150 kB gzip                                                        |
| Deferred 3D JS (the stage chunk)                  | ≤ 420 kB gzip                                                        |
| LCP (4G, mid-range phone)                         | < 2.0 s                                                              |
| CLS                                               | 0                                                                    |
| TBT (throttled phone, `pnpm perf:budget`)         | page < 200 ms until the 3D chunk is requested; 3D boot ≤ 2 s (D-094) |
| Mascot GLB                                        | lite ≤ 250 kB (Meshopt + WebP), full ≤ 3600 kB (Meshopt + KTX2)      |
| Frame rate                                        | 60 fps on Intel integrated GPU at quality `medium`                   |
| Lighthouse accessibility                          | ≥ 95                                                                 |

Model budgets (triangles, bones, textures, draw calls, clips) live in `character.json` and are enforced by `pnpm validate:model`. JS budgets are enforced by `pnpm size` after a build.

## Character bible (summary)

Full bible, canonical names and name candidates: `.claude/skills/kelor-mascot/SKILL.md`.

- Chibi bipedal dinosaur: big head (~40 % of height), rounded body, short legs, small arms, expressive tail with 4 bones.
- Purple is the accent (tokens `mascot-700/500/300` + `mascot-glow`) over the logo's monochrome base. **UI stays monochrome**; purple is for the mascot, glows and the CTA.
- Brand DNA: hexagonal dorsal plates that can light up, and a rounded dinosaur egg as his origin.
- Big eyes as separate geometry (spheres with pupils and eyelids) plus fixed highlights. The eyes follow the cursor.
- Expressions via a UV-offset texture atlas (neutral, happy, surprised, roar). No morph targets.
- A T-rex jaw: one `jaw` bone opens the mouth on blade teeth in gums; four tusks show over the lips even with the mouth shut; he bites the screen when pestered.
- No hair, thin spikes or separate fingers: closed, rounded shapes only.
- Must be clearly original. Never resemble well-known purple dinosaurs or dragons.

## Character contract (summary)

`character.json` is the single source of truth, validated by `src/lib/character/schema.ts` (Zod) in tests. Never hard-code its values elsewhere.

- Units metres, +Y up, +Z forward, origin at the feet, height 1.2 m.
- 29 bones with exact names (`root`, `hips`, `spine_01`… `tail_04`, `eye_L`, `eyelid_R`, `jaw`…). Eye, eyelid and jaw bones are procedural: clips must not key them.
- Meshes: `body`, `face`, `eyes`, `eyelids`, `eye_highlights`, `plates`, `teeth`, `tusks`, `mouth` (9 draw calls, 7 materials). The egg is procedural and never ships in the GLB.
- Clips: `idle`, `hatch`, `look_around`, `roar`, `jump`, `wave`, at 30 fps, no root motion.
- Gaze: eyes fast (±35°/±25°), neck + head slow (±40°/±25°), frame-rate independent damping, applied after the mixer as a layer on top of the clip.
- Quality tiers `high` / `medium` / `low`, picked at boot and adjusted with drei's `PerformanceMonitor` along a ladder that lowers the pixel ratio before the tier.

## Layout

```
src/app                 routes, layout, global CSS tokens
src/components/sections page sections (the live screen, notices)
src/components/three/live the live pose driver and the screen-space overlays
src/components/three    R3F scene, mascot, egg, effects (client only)
src/components/ui       monochrome UI primitives
src/components/game     the pixel runner (phones, loaded when it opens)
src/lib                 pure logic (character contract, copy, math, behaviour, carry physics, the bite, sound, showcase state, the runner); unit tested
scripts/assets          GLB validation and asset processing (Node)
scripts/blender         headless Blender pipeline (Python, phase 3)
scripts/review          capture and review tooling
assets/concept          concept art chosen by the owner (input to phase 3)
docs/                   interaction script, decisions log, QA matrix
assets/source           image-to-3D sources: kelo-raw.glb is the real one, standin-raw.glb exercises the pipeline
assets/model            fit.json: how the pipeline turns a source into the contract model
assets/review           committed review renders and pipeline logs
public/models           compressed GLBs built by the model pipeline, validated against character.json
public/basis            three's Basis transcoder for KTX2, served locally (kept in sync by a test)
```

## Stage architecture (phase 2)

- `src/components/sections/StageMount.tsx` is the client boundary: it lazy-loads `src/components/three/Experience.tsx` with `next/dynamic` (`ssr: false`) and keeps the static brand mark until the first frame.
- `src/components/three/Stage.tsx` is the only place that creates the Canvas. It picks the boot tier, pauses off screen, and drives the boot sequence.
- Scene state lives in the zustand store `src/components/three/store.ts`; pure logic (boot sequence, quality tiers, framing, damping) lives in `src/lib` and is unit tested.
- The mascot is wrapped by `MascotRig` (clips, expressions, plate glow); all lookups use contract names.
- React Compiler lint rules forbid mutating hook values: keep three.js mutations inside classes like `MascotRig` or read objects with `get()` inside effects.
- `?debug` opens the leva panel and FPS meter on local and preview builds, never on production.

## Behaviour and director (phase 5)

- Pure logic lives in `src/lib/behaviour`: gaze angles and soft limits, the blink scheduler, the tail spring and the director state machine (`egg → hatch → tracking ⇄ acting`; while an interaction leads it may impose gaze and expression). All of it is unit tested and reads its numbers from `character.json` (`gaze`, `life`, `accessibility.reducedMotion`).
- `MascotRig` layers the behaviour: `update()` resets the layered bones to their bind pose and runs the mixer, then `behave()` multiplies the carried pose, gaze, blink, tail and jaw offsets on top. Never set layered bones anywhere else.
- `BehaviourController` runs the director each frame and turns attention into a world target; `useBehaviourInput` feeds it from window events. It outlives model swaps.
- Mark any element with `data-gaze-target` to draw Kelo's look on hover and keyboard focus.
- `StageMount` also exposes `data-attention` and `data-clip` for tests; `?debug` has a gaze switch, a blink button and an attention readout.

## Live screen (phase 8)

- `docs/interaction-script.md` is the source of the behaviour; change it first, then `character.json` `interaction` (taps, reactions, carry, fall, hop) or the bite's keys in `src/lib/live/bite.ts`.
- Pure logic: `src/lib/behaviour/interaction.ts` (the tap streak, reactions, the bite on the sixth tap, drag versus tap, desktop gating), `carry.ts` (fixed 240 Hz physics: the spring and pendulum while held, the fall, bounces, landing squash, hops), `src/lib/live` (the rest pose and the bite).
- `LiveDriver` (priority -2) fills the shared `live` object every frame: the rest pose, or the bite's keys and cues. The camera, mascot, lights, effects and backdrop read it. `OverlayDriver` writes the screen-space layers (letterbox, iris, words, hint, Kelo's place for the keyboard button) as CSS variables on `#live-ui`, plus data attributes for tests (`data-kelo`, `data-reaction`, `data-kelo-x/y`, `data-scale`, `data-biting`). Nothing re-renders React per frame.
- `BehaviourController` reads presses on the window (`useBehaviourInput`): a tap, a pick-up past 6 px on desktop, or a click on the stage that makes him hop; the Kelo button gives the keyboard Enter or Space and the arrows. It steps the physics and hands `Mascot` his root pose: a pivot at the grab point (swing, lean), the squash, then the hatch and bite scale.
- `StageMount` sets `html.live` while the stage draws, which shows the stage's extras (overlays, hint, sound switch), `html.waiting` until the egg is dropped (the drop prompt) and `html.hatched` once he is ready (the Kelo button, the dock). The words have their fixed places from the first paint, so nothing shifts (CLS 0); without live mode the page is the words alone. Phones keep the lite model.
- Sounds go through `src/lib/sound/bus.ts`. `src/lib/sound/control.ts` holds the state: `auto` (every visit starts silent except for the bite and the pixel runner), `on` and `off` from the switch. The audio engine is created inside a press: the switch's, on desktop the press on Kelo that bites, or the press that opens the runner (earlier presses only preload its code); `BehaviourController.nextTapWakesAudio` says which tap. Turning the sound on sets iOS's audio session to `playback`, so the ringer switch does not mute it.
- Effects follow the tier: MSAA 4x on high, FXAA on medium, no ambient occlusion on medium, no depth of field; desktops get 2048 px shadows on medium too. The skin's soft-skin shading patches three's physical lighting chunk (`finish.ts`; a test watches the line it replaces). Measure with `?tier=low|medium|high`.
- `tests/e2e/interaction.spec.ts` plays taps, the bite, carrying and hops on every profile and captures each stage to `scripts/review/out`.

## Showcase (phase 9)

- The boot runs `waiting → egg → hatching → ready` (`src/lib/scene/boot.ts`): nothing hatches until the visitor drops the egg. `DropPrompt` turns a press on the stage (or on the prompt) into `dropEgg({ clientX, clientY })`, and the button from the keyboard into `dropEgg()` (the middle); `Egg.tsx`, outside the mascot's Suspense boundary, answers it, so the egg falls at once even while the model loads, and `BehaviourController` keeps Kelo at `live.egg.x` until he is ready. `src/lib/showcase/targets.ts` says which presses belong to the stage. `beforeHatch(phase)` covers `waiting` and `egg`. The fall, bounces and squash are pure (`src/lib/scene/drop.ts`, `character.json` `egg.drop`); `Egg.tsx` stays mounted hidden while waiting so its shader compiles early.
- `src/lib/showcase/state.ts` is the module singleton the page and the 3D chunk share (like the sound bus): the dock's state (lighting, spin, x-ray), its commands (actions, bite, reset view), the drop and the runner request. `ShowcaseDriver` (priority -1) eases the lighting looks and the view into `live.look` and `live.view`.
- `src/lib/showcase/layout.ts` frames Kelo small (`layoutFraming`) and the bite large (`BITE_FRAMING`); `CameraRig` applies them with a lens shift (`setViewOffset`) and the sandbox's orbit and zoom.
- The desktop sandbox is the Tailwind variant `sandbox` (`SANDBOX_QUERY`: 1024 px or wider, hover, fine pointer). `ShowcaseDock` is icon-only; each button has an accessible name and a `data-tip` tooltip.
- The runner: the ninth tap in a row on a touch screen (`interaction.taps.gameAt`) returns `{ kind: 'game' }`, and the dock's Jugar asks on desktop; both call `requestGame`, and `GameMount` loads `RunnerGame` (a dynamic import) inside `ConsoleShell`, the KELOR K-89 handheld (CSS only, variant `handheld-wide` for the sideways layout). `setGameOpen` stops the stage's frame loop while it is open. Its logic and sprites are pure (`src/lib/game`).
- `tests/e2e/helpers.ts` `hatch()` drops the egg with a bare click event on the drop button, so it leaves focus and the pointer alone; `tests/e2e/showcase.spec.ts` covers the real drop, the dock and the runner.

## Progressive loading (phase 4)

- Every tier paints the lite model first (`firstPaintUrl` in `src/lib/scene/model.ts`). Its shaders compile while the egg is still up, and `modelReady` waits for that.
- After the hatch, `shouldUpgrade` in `src/lib/scene/upgrade.ts` decides whether to stream the full model: never on the low tier, with save-data, or on 2G-class connections.
- `Mascot.tsx` loads the full model inside its own Suspense boundary, compiles it, and swaps it in; `MascotRig.snapshot` and `restore` carry the clip, its time and the expression across.
- `src/components/three/loaders.ts` owns decoding without a CDN: `useModel` loads through three's GLTFLoader with its Meshopt decoder (not drei's `useGLTF`, which bundles Draco), the KTX2 loader is a lazy chunk, and the Basis transcoder is served from `public/basis`.
- `StageMount` exposes `data-scene-state`, `data-model` and `data-tier` for tests; `Stage` exposes the live tier as `data-quality`.

## Model pipeline (phase 3)

- `assets/model/fit.json` names the image-to-3D source (`assets/source/*.glb`) and every model-specific knob; `scripts/assets/fit.ts` validates it.
- `corepack pnpm build:model` runs normalise and skeleton fit (Node), retopology, UVs, bakes and weights (Blender 5.2 LTS), assembly with the shared placeholder code (Node), compression (Meshopt on both tiers, KTX2 on full through KTX-Software 4.4.2), strict validation and review renders (Blender, from the uncompressed assembly, because its importer cannot read KTX2).
- Blender never runs locally. The Model workflow runs on feature-branch pushes that touch the source, fit, pipeline or contract, and commits `public/models` plus `assets/review/phase-3` (renders, `pipeline.log`, `summary.json`) back to the branch: `git pull` before pushing again.
- Review every run through the committed renders: rest views, face close-up, topology, bone heads and each clip at mid-pose.
- Locally, `node scripts/assets/model/run.mjs --until rig` runs the Node steps into `build/model`.
- `node scripts/assets/model/reassemble.mjs [--public] [--raw]` rebuilds the lite model from HEAD's committed body with the current assembly code, no Blender, to tune the jaw, eyes or plates before spending a CI run. `--public` overwrites the committed lite model for a preview: `git checkout -- public/models/mascot.lite.glb` before committing.

## Performance and QA (phase 7)

- Resilience: `StageMount` wraps the 3D experience in an error boundary. A failed chunk, model or WebGL leaves `data-scene-state="unavailable"` and the brand mark; a failed full model keeps lite. A lost WebGL context shows the brand mark until it is restored. `not-found.tsx`, `error.tsx` and `global-error.tsx` are Spanish.
- The loading brand mark is an `<img>` data URI, so it is the LCP element at first paint.
- `src/lib/quality/ladder.ts` builds the quality ladder (tier and pixel-ratio steps); `QualityController` walks it one step at a time.
- `src/lib/security/csp.ts` builds the Content Security Policy that `next.config.ts` sends in production builds; see its comment before adding any source.
- `next.config.ts` hashes the models and the Basis transcoder (`src/lib/assets`): models load as `?v=<hash>`, the transcoder from `/basis/<hash>/`, both cached `immutable`. Run Next from the repo root: the config imports `./src/...`, which Next resolves from the working directory.
- The studio is `Backdrop.tsx` (a faint screen-space halo on near-black), `Floor.tsx` (the shadow only), `studioEnvironment.ts` (reflection panels baked into a cube map) and `StudioLights.tsx` (key, rim and fill, blended between the lighting looks in `looks.ts`).
- `?qa` (local and preview builds) opens a panel that plays the live moments (idle, carrying, the bite; taps on touch screens), measures frames through each and copies a report; the owner runs it on real devices. `docs/qa.md` is the release-gate matrix.

## Commands

```bash
corepack pnpm dev              # local dev server
corepack pnpm check            # typecheck, lint, format, tests, strict model validation, placeholder freshness, build, bundle budget
corepack pnpm validate:model   # validate GLBs in public/models against character.json (strict)
corepack pnpm build:model      # full model pipeline (CI; needs Blender)
corepack pnpm build:placeholder # placeholder GLBs into build/placeholder (--public to overwrite the model)
corepack pnpm size             # bundle report and JS budgets (after build)
corepack pnpm e2e              # Playwright: hero, interaction, showcase, loading, resilience, CSP, accessibility, captures (after build)
corepack pnpm perf             # load and frame-rate probe: owner's laptop and a throttled phone (after build)
corepack pnpm perf:budget      # the TBT budgets on the throttled phone: page and 3D boot (after build)
```

CI (`.github/workflows/ci.yml`) runs the same checks plus the e2e suite on every PR and uploads the captures as an artifact. It also runs Lighthouse (mobile, pinned `npx @lhci/cli`, config in `lighthouserc.json`), the smoke spec in WebKit and Firefox (`CROSS_BROWSER=1`), and `pnpm audit --prod`.
