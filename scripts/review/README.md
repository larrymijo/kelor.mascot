# Review tooling

Scripts that produce evidence for PR reviews: Playwright captures at 375, 768 and 1280 px, and later scroll-act frame captures and performance traces.

- Output goes to `scripts/review/out/` (git-ignored). Attach the relevant images to the PR instead of committing them.
- Captures use the locally installed Chrome (`channel: 'chrome'`), so no browser download is needed.
