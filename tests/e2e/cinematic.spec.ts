import { expect, test, type Page } from '@playwright/test'

/**
 * The scroll cinematic, act by act, against the checkpoints in
 * docs/scroll-script.md. Each checkpoint is captured into
 * scripts/review/out as <id>-<profile>.png for review.
 */

const stage = (page: Page) => page.locator('[data-scene-state]')
const ui = (page: Page) => page.locator('#cinematic-ui')

/** Checkpoints reached by scrolling (CP-0 and CP-1 happen on load). */
const CHECKPOINTS = [
  { id: 'cp2-gulp-mouth', progress: 0.15, act: 'gulp' },
  { id: 'cp2-gulp-black', progress: 0.22, act: 'gulp' },
  { id: 'cp3-meet', progress: 0.42, act: 'meet' },
  { id: 'cp4-eyes', progress: 0.61, act: 'detail' },
  { id: 'cp4-plates', progress: 0.74, act: 'detail' },
  { id: 'cp5-finale', progress: 0.95, act: 'finale' },
] as const

/** Requests that leave the site, and console errors. */
function watch(page: Page, baseURL: string) {
  const foreign: string[] = []
  const errors: string[] = []
  const origin = new URL(baseURL).origin
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol.startsWith('http') && url.origin !== origin) foreign.push(url.href)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return { foreign, errors }
}

/** Waits until the stage is drawing and the lazy engine has switched the page into cinematic mode. */
async function cinematicReady(page: Page) {
  await expect(stage(page)).toHaveAttribute('data-scene-state', 'ready', { timeout: 40_000 })
  await expect(page.locator('html.cinematic')).toHaveCount(1, { timeout: 20_000 })
}

/** Scrolls to a progress value and lets the smoothed progress settle on it. */
async function scrollTo(page: Page, progress: number, act: string) {
  await page.evaluate(
    (p) => window.scrollTo(0, p * (document.documentElement.scrollHeight - window.innerHeight)),
    progress,
  )
  await expect(ui(page)).toHaveAttribute('data-act', act, { timeout: 10_000 })
  await page.waitForTimeout(1_800)
}

const cssVar = (page: Page, name: string) =>
  ui(page).evaluate((el, n) => parseFloat(getComputedStyle(el).getPropertyValue(n)), name)

test.describe('scroll cinematic', () => {
  test('plays every act and meets each checkpoint', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(150_000)
    const seen = watch(page, baseURL!)
    const shot = (id: string) =>
      page.screenshot({ path: `scripts/review/out/${id}-${testInfo.project.name}.png` })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    // Hold the lite model back so the egg can be seen and captured.
    await page.route('**/models/mascot.lite.glb*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 6_000))
      await route.continue()
    })
    await page.goto('/')

    // CP-0: the egg.
    await expect(stage(page)).toHaveAttribute('data-scene-state', 'egg', { timeout: 30_000 })
    await page.waitForTimeout(600)
    await shot('cp0-egg')
    await expect(stage(page)).toHaveAttribute('data-scene-state', 'egg')

    // CP-1: hatched, with the scroll cue.
    await cinematicReady(page)
    await page.waitForTimeout(2_000)
    await expect(ui(page)).toHaveAttribute('data-act', 'hero')
    expect(await cssVar(page, '--cue')).toBeGreaterThan(0.9)
    await shot('cp1-hatched')

    for (const checkpoint of CHECKPOINTS) {
      await scrollTo(page, checkpoint.progress, checkpoint.act)
      await shot(checkpoint.id)
      switch (checkpoint.id) {
        case 'cp2-gulp-mouth':
          expect(Number(await ui(page).getAttribute('data-scale'))).toBeGreaterThan(3)
          break
        case 'cp2-gulp-black':
          // The iris has closed past the centre: nothing of the scene shows.
          expect(await cssVar(page, '--iris-on')).toBe(1)
          expect(await cssVar(page, '--iris-r')).toBeLessThan(0)
          break
        case 'cp3-meet':
          await expect(page.getByRole('heading', { level: 1, name: 'Conoce a Kelo' })).toBeVisible()
          expect(await cssVar(page, '--meet')).toBeGreaterThan(0.9)
          break
        case 'cp5-finale':
          await expect(page.locator('#contact')).toHaveAttribute('data-shown', '')
          expect(await cssVar(page, '--contact')).toBeGreaterThan(0.9)
          await expect(page.getByRole('link', { name: 'Escríbenos' })).toBeVisible()
          break
      }
    }

    expect(seen.foreign).toEqual([])
    expect(seen.errors).toEqual([])
  })

  test('keeps Kelo at his normal size with reduced motion', async ({ page }) => {
    test.setTimeout(90_000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await cinematicReady(page)
    for (const checkpoint of CHECKPOINTS) {
      await scrollTo(page, checkpoint.progress, checkpoint.act)
      await expect(ui(page)).toHaveAttribute('data-scale', '1.00')
    }
  })

  test('brings the finale into view when the contact link gets keyboard focus', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'No hardware keyboard on the phone profile')
    await page.goto('/')
    await cinematicReady(page)
    await page.getByRole('link', { name: 'Escríbenos' }).focus()
    await expect(ui(page)).toHaveAttribute('data-act', 'finale', { timeout: 10_000 })
    await expect(page.locator('#contact')).toHaveAttribute('data-shown', '', { timeout: 10_000 })
  })

  test('creates no sound before the switch is pressed', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One profile is enough')
    await page.addInitScript(() => {
      const counter = window as unknown as { __audioContexts: number }
      counter.__audioContexts = 0
      const Native = window.AudioContext
      window.AudioContext = class extends Native {
        constructor(options?: AudioContextOptions) {
          super(options)
          counter.__audioContexts++
        }
      }
    })
    const contexts = () =>
      page.evaluate(() => (window as unknown as { __audioContexts: number }).__audioContexts)
    await page.goto('/')
    await cinematicReady(page)

    const toggle = page.getByRole('button', { name: 'Sonido' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(await contexts()).toBe(0)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(await contexts()).toBe(1)
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(await contexts()).toBe(1)
  })
})
