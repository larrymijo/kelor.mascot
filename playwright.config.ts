import { defineConfig, devices } from '@playwright/test'

const PORT = 3100

/**
 * CROSS_BROWSER=1 (the cross-browser CI job) runs the smoke spec in WebKit
 * on an iPhone profile and in Firefox. Those browsers are installed in CI
 * only; local runs use the installed Chrome.
 */
const crossBrowser = process.env.CROSS_BROWSER === '1'

/**
 * Review captures at phone, tablet and desktop widths. Uses the locally
 * installed Chrome, so no browser download is needed. Run `pnpm build` first:
 * the tests hit the production server, like a Vercel preview.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  // GPU-less CI runners render WebGL in software, which is slow; give the 3D hero room.
  timeout: 60_000,
  outputDir: 'test-results',
  fullyParallel: true,
  // The owner's machine is an i5 with integrated graphics: keep local runs light.
  workers: process.env.CI ? undefined : 2,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Playwright skips undefined when merging project options, so the cross-browser
    // projects can only drop the Chrome channel here.
    channel: crossBrowser ? undefined : 'chrome',
    trace: 'retain-on-failure',
  },
  projects: crossBrowser
    ? [
        {
          name: 'webkit-iphone',
          testMatch: 'smoke.spec.ts',
          use: devices['iPhone 14'],
        },
        {
          name: 'firefox',
          testMatch: 'smoke.spec.ts',
          use: devices['Desktop Firefox'],
        },
      ]
    : [
        {
          name: 'mobile',
          use: {
            viewport: { width: 375, height: 812 },
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true,
          },
        },
        { name: 'tablet', use: { viewport: { width: 768, height: 1024 }, hasTouch: true } },
        { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
      ],
  webServer: {
    command: `node ./node_modules/next/dist/bin/next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
