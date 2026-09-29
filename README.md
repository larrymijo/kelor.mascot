# KELOR Interactive: 3D mascot site

Promotional website for KELOR Interactive, starring Kelo, a purple chibi dinosaur mascot who hatches from his egg and lives on one screen: he follows the cursor with his eyes, reacts to taps, can be carried around on desktop, and bites the screen when pestered.

**Status:** phase 8, the live Kelo. The launch (domain, indexing, analytics, monitoring, runbook and handover) is phase 9. `CLAUDE.md` describes the architecture, `docs/interaction-script.md` the behaviour, `docs/decisions.md` every decision and `docs/qa.md` the release gate.

## Requirements

- Node.js 24 (see `.node-version`). Corepack ships with Node, so pnpm needs no global install.
- Google Chrome, only for the Playwright captures.

## Getting started

```bash
corepack pnpm install
corepack pnpm dev
```

Open http://localhost:3000.

## Scripts

| Script                            | What it does                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `corepack pnpm dev`               | Development server (Turbopack)                                                           |
| `corepack pnpm build`             | Production build                                                                         |
| `corepack pnpm start`             | Serve the production build                                                               |
| `corepack pnpm typecheck`         | Generate route types, then `tsc --noEmit`                                                |
| `corepack pnpm lint`              | ESLint (Next.js core web vitals, TypeScript, React Compiler rules)                       |
| `corepack pnpm format`            | Prettier write (`format:check` to verify only)                                           |
| `corepack pnpm test`              | Vitest unit tests (contract, validator, generator, scene logic)                          |
| `corepack pnpm validate:model`    | Validate the mascot GLBs against `character.json` (strict)                               |
| `corepack pnpm build:placeholder` | Regenerate the placeholder GLBs (`--check` only verifies)                                |
| `corepack pnpm size`              | Bundle report and JS budgets (run `build` first)                                         |
| `corepack pnpm e2e`               | Playwright: 3D hero, reduced motion, keyboard, debug panel, captures (run `build` first) |
| `corepack pnpm check`             | Typecheck, lint, format, tests, models, build and bundle budget                          |

## Project layout

```
character.json          mascot contract: skeleton, meshes, clips, gaze, budgets, colours
src/app                 routes, layout, Tailwind tokens (globals.css)
src/components          sections, three (R3F, phase 2+), ui
src/lib                 pure logic: typed contract, copy, site URL
scripts/assets          GLB validator (zero dependencies) and, later, asset processing
scripts/blender         headless Blender pipeline (phase 3)
scripts/review          capture tooling; output in scripts/review/out (git-ignored)
assets/concept          concept art chosen by the owner
docs                    scroll script template, decisions log
tests/e2e               Playwright specs
```

`CLAUDE.md` summarises stack, conventions, budgets and the character bible. The full bible lives in `.claude/skills/kelor-mascot/SKILL.md`.

## The character contract

`character.json` is the single source of truth for the mascot. Tests validate it against a strict Zod schema (`src/lib/character/schema.ts`), the runtime reads it through `@/lib/character`, and the validator enforces it on every GLB:

```bash
corepack pnpm validate:model                                  # both tiers from character.json
corepack pnpm validate:model --file path/to/model.glb --tier lite
corepack pnpm validate:model --strict                         # fail if a tier file is missing
corepack pnpm validate:model --json
```

Each failed rule prints the measured value, the budget and a hint on how to fix it. Until phase 3 produces the model, the default run skips with exit code 0.

## Debug panel

Append `?debug` to any local or preview URL to open a leva panel (lights, bloom, grain, plate glow, quality tier, expressions, every clip) and an FPS meter. It never loads on the production deployment, and visitors never download it.

## Docs

- [Scroll script](docs/scroll-script.md): acts, camera, director states and QA checkpoints (filled in phase 6).
- [Decisions log](docs/decisions.md): every decision and assumption, with the reason.
