# Review tooling

Evidence for PR reviews. Output goes to `scripts/review/out/` (git-ignored); attach the relevant images to the PR, or download the `review-captures` artifact from the CI run.

- **Captures**: `corepack pnpm build && corepack pnpm e2e` writes the egg and the idle mascot at 375, 768 and 1280 px (`hero-egg-*.png`, `hero-ready-*.png`) plus a debug panel capture. Playwright uses the locally installed Chrome (`channel: 'chrome'`), so nothing is downloaded, and runs 2 workers locally to spare the integrated GPU.
- **Bundle report**: `corepack pnpm size` classifies the home page chunks as initial, deferred 3D, on demand and legacy, measures them with gzip, lists the model sizes and fails over budget (initial 150 kB, deferred 3D 420 kB).

- **Scroll checkpoints**: the cinematic spec (`tests/e2e/cinematic.spec.ts`) captures every checkpoint of the scroll script per profile, `cp0-egg` to `cp5-finale`.
- **Performance probe**: `corepack pnpm perf` serves the existing build and measures, with the installed Chrome, frames per second at each checkpoint on the owner's screen (1280x650 at DPR 1.5, tier pinned with `?tier=`), and the load of the page on that laptop and on a phone with Lighthouse's mobile throttling: FCP, LCP and its element, CLS, an estimate of TBT, when the egg and Kelo appear, and bytes by kind. `--profile laptop-medium,phone-load` picks profiles, `--runs 3` takes medians of the load runs. GPU numbers move with power and heat, so compare runs made back to back. Results also go to `out/perf.json`.
