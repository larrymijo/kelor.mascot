# Review tooling

Evidence for PR reviews. Output goes to `scripts/review/out/` (git-ignored); attach the relevant images to the PR, or download the `review-captures` artifact from the CI run.

- **Captures**: `corepack pnpm build && corepack pnpm e2e` writes the egg and the idle mascot at 375, 768 and 1280 px (`hero-egg-*.png`, `hero-ready-*.png`) plus a debug panel capture. Playwright uses the locally installed Chrome (`channel: 'chrome'`), so nothing is downloaded, and runs 2 workers locally to spare the integrated GPU.
- **Bundle report**: `corepack pnpm size` classifies the home page chunks as initial, deferred 3D, on demand and legacy, measures them with gzip, lists the model sizes and fails over budget (initial 150 kB, deferred 3D 420 kB).

Later phases add scroll-act frame captures and performance traces here.
