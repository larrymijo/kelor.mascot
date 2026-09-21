# KELOR Interactive: 3D mascot site

Promotional website for KELOR Interactive, starring a purple chibi dinosaur mascot that follows the cursor inside a cinematic, scroll-driven 3D experience.

**Status:** phase 1 (foundation). The site is a monochrome placeholder; 3D starts in phase 2.

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

| Script                         | What it does                                                       |
| ------------------------------ | ------------------------------------------------------------------ |
| `corepack pnpm dev`            | Development server (Turbopack)                                     |
| `corepack pnpm build`          | Production build                                                   |
| `corepack pnpm start`          | Serve the production build                                         |
| `corepack pnpm typecheck`      | Generate route types, then `tsc --noEmit`                          |
| `corepack pnpm lint`           | ESLint (Next.js core web vitals + TypeScript rules)                |
| `corepack pnpm format`         | Prettier write (`format:check` to verify only)                     |
| `corepack pnpm test`           | Vitest unit tests (character contract, GLB validator)              |
| `corepack pnpm e2e`            | Playwright captures at 375, 768 and 1280 px (run `build` first)    |
| `corepack pnpm validate:model` | Validate the mascot GLBs against `character.json`                  |
| `corepack pnpm check`          | Everything CI runs: typecheck, lint, format, test, validate, build |

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

## Workflow

- One branch and one PR per phase (`feat/phase-<n>-<slug>`), Conventional Commits, one commit per logical unit.
- CI (`.github/workflows/ci.yml`) runs typecheck, lint, format check, unit tests, model validation and a production build on every PR.
- Every PR gets a Vercel preview and follows `.github/pull_request_template.md`, including the performance and accessibility checklists.
- No secrets in the repository. Configuration that needs a key is documented with the variable name and where to set it.

## Deploying on Vercel

1. Go to https://vercel.com/new and import `larrymijo/kelor-mascot`.
2. Keep the detected framework preset (Next.js) and the default build settings.
3. Add the environment variable `ENABLE_EXPERIMENTAL_COREPACK` with value `1` (all environments), so Vercel uses the exact pnpm version from `packageManager`.
4. Deploy. Node.js 24 is selected automatically from `engines` in `package.json`.

Pull requests then get preview deployments automatically, and `main` deploys to production.

## Docs

- [Scroll script](docs/scroll-script.md): acts, camera, director states and QA checkpoints (filled in phase 6).
- [Decisions log](docs/decisions.md): every decision and assumption, with the reason.
