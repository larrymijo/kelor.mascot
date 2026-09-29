# QA and release gate

The release gate from the website-orchestrator workflow, as a matrix. Each check is `pass`, `fail`, `accepted risk`, `blocked` or `not applicable`, with its evidence. Re-run it before every release; phase 8 (launch) adds the production checks.

Last run: 2026-09-29, branch `feat/phase-7-performance-qa`.

## How to run

```bash
corepack pnpm check   # typecheck, lint, format, unit tests, strict model validation, build, budgets
corepack pnpm e2e     # every Playwright spec on the mobile, tablet and desktop profiles (after build)
corepack pnpm perf    # load and frame-rate probe: the owner's laptop and a throttled phone (after build)
```

In CI (on every pull request): the same check and e2e suite, Lighthouse on the mobile preset, the smoke spec in WebKit (iPhone) and Firefox, and `pnpm audit --prod`.

On real devices: open a preview with `?qa`, press **Start**, keep the tab in front, then **Copy report** and paste it into the PR.

## Matrix

| Area                  | Check                                                                         | Status         | Evidence                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Journeys              | Land, watch the cinematic, reach "Escríbenos"                                 | pass           | `cinematic.spec.ts` plays every act against the script's checkpoints on three profiles; `smoke.spec.ts`                                                                   |
| Journeys              | Direct link to an unknown URL                                                 | pass           | Spanish 404 with status 404 and a way back (`resilience.spec.ts`, `smoke.spec.ts`)                                                                                        |
| Failure states        | 3D chunk, lite model or WebGL fails                                           | pass           | The page stays a readable document with the brand mark and contact link (`resilience.spec.ts`)                                                                            |
| Failure states        | Full model fails                                                              | pass           | The lite Kelo stays (`resilience.spec.ts`)                                                                                                                                |
| Failure states        | GPU context lost and restored                                                 | pass           | Brand mark while lost, scene back after (`resilience.spec.ts`)                                                                                                            |
| Failure states        | Page or layout error                                                          | pass           | Spanish `error.tsx` with retry and `global-error.tsx`                                                                                                                     |
| Failure states        | Offline, vendor outage                                                        | not applicable | No third parties: every request is same-origin (`loading.spec.ts` asserts it)                                                                                             |
| Keyboard              | Brand mark, sound switch and contact link reachable with a visible focus ring | pass           | `hero.spec.ts`; focusing the link brings the finale into view (`cinematic.spec.ts`)                                                                                       |
| Screen reader         | A short, labelled document                                                    | pass           | Accessibility-tree snapshot (`accessibility.spec.ts`): scene description, brand link, sound switch with `aria-pressed`, the "Conoce a Kelo" region and the contact region |
| Zoom                  | 200% and reflow at 320 px                                                     | pass           | No sideways scroll, controls, heading and link inside the viewport (`accessibility.spec.ts`)                                                                              |
| Forced colours        | Windows high contrast                                                         | pass           | Words and link on system backplates, sound switch on a backplate, letterbox kept black (`accessibility.spec.ts`; fixed in this phase)                                     |
| Reduced motion        | No scaling, orbit, particles or grain; acts cut with a fade                   | pass           | `hero.spec.ts`, `cinematic.spec.ts`                                                                                                                                       |
| Touch                 | Native scrolling, tap targets of 44 px                                        | pass           | Mobile and tablet profiles (`hasTouch`); real phone: see the device reports below                                                                                         |
| Contrast              | Text against its background                                                   | pass           | The © line moved to ink-300 (about 7.9:1); Lighthouse accessibility ≥ 0.95 in CI                                                                                          |
| Metadata              | Title, description, `lang="es"`, icon                                         | pass           | `smoke.spec.ts`; indexing stays off until launch (phase 8)                                                                                                                |
| Fonts and images      | Self-hosted fonts with `swap`; fixed-size LCP image                           | pass           | `next/font`; the brand mark is a sized `<img>` (D-083); CLS 0                                                                                                             |
| Core Web Vitals (lab) | LCP < 2.0 s on a throttled phone                                              | pass           | LCP equals FCP, about 1.1 to 1.3 s (`pnpm perf`), down from 13.3 s                                                                                                        |
| Core Web Vitals (lab) | CLS 0                                                                         | pass           | 0 on every profile                                                                                                                                                        |
| Core Web Vitals (lab) | TBT: page ≤ 200 ms, 3D boot ≤ 2 s (D-094)                                     | pass           | 191 and 1444 ms on the throttled phone (`pnpm perf:budget`, median of 3); see [TBT](#tbt)                                                                                 |
| Frame rate            | Medium at 60 fps on the owner's laptop                                        | accepted risk  | Medium at 150% measures 49 to 53 fps uncapped; the ladder now trades resolution below 54 fps (D-089). Confirm with the laptop's `?qa` report                              |
| JS budgets            | Initial ≤ 150 kB, 3D ≤ 420 kB, cinematic ≤ 70 kB                              | pass           | 138.0, 389.1 and 51 kB (`pnpm size`)                                                                                                                                      |
| Model budgets         | Lite ≤ 250 kB, full ≤ 1500 kB, contract                                       | pass           | 212 and 1302 kB; strict validation of both tiers                                                                                                                          |
| Caching               | Heavy files cached for good                                                   | pass           | Models and transcoder versioned by content and `immutable` (`loading.spec.ts`, D-088)                                                                                     |
| Security              | Content Security Policy                                                       | pass           | Zero violations over the whole cinematic, sound included (`security.spec.ts`, D-084)                                                                                      |
| Security              | Other headers                                                                 | pass           | `nosniff`, `DENY` framing, referrer and permissions policies; HSTS from Vercel                                                                                            |
| Security              | Secrets                                                                       | pass           | None in the repo; no environment variables are needed                                                                                                                     |
| Privacy               | Cookies, consent, analytics                                                   | not applicable | No cookies and no analytics until launch (phase 8)                                                                                                                        |
| Dependencies          | `pnpm audit --prod` at high severity                                          | blocked        | Runs in CI when the pull request opens                                                                                                                                    |
| Cross-browser         | Safari (WebKit) and Firefox                                                   | blocked        | The smoke spec runs in CI when the pull request opens                                                                                                                     |
| Build                 | Typecheck, lint, format, unit tests, build                                    | pass           | `pnpm check`: 233 unit tests                                                                                                                                              |
| Real devices          | The owner's laptop and phone                                                  | blocked        | Waiting for the `?qa` reports                                                                                                                                             |

## TBT

Lighthouse measures Total Blocking Time from first paint until the page is quiet, and the 3D boot happens inside that window: the 3D chunk runs, the scene is built and its shaders compile while the egg is on screen. On a phone throttled to a quarter of a laptop's CPU, that is seconds of main-thread work, so the owner split the budget (D-094):

- **Page: ≤ 200 ms**, from first paint until `StageMount` requests the 3D chunk (the `kelor:3d-import` mark). It delays the words, the contact link and the first tap. It measures about 190 ms, almost all of it one task: React and Next evaluating their chunk and hydrating the page. Weigh any new client code in the shell against it.
- **3D boot: ≤ 2 s**, from that request until 3 s after Kelo is ready. It runs behind the egg once the page is usable. It measures about 1.3 to 1.8 s on an idle laptop, and several times more when other apps use the GPU, so measure on an idle machine.

`corepack pnpm perf:budget` checks both on the phone profile (median of 3 runs); `perf --tasks` lists the page's long tasks and the scripts in them. Lighthouse reports TBT without asserting it: its window mixes the two, and CI renders WebGL in software.

## Device reports

Paste the `?qa` reports here.
