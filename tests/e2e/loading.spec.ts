import { expect, test, type Page } from '@playwright/test'

const stage = (page: Page) => page.locator('[data-scene-state]')

/** Every model request, every request that leaves the site, and console errors. */
function watch(page: Page, baseURL: string) {
  const models: string[] = []
  const foreign: string[] = []
  const errors: string[] = []
  const origin = new URL(baseURL).origin
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (!url.protocol.startsWith('http')) return
    if (url.origin !== origin) foreign.push(url.href)
    else if (url.pathname.startsWith('/models/')) models.push(url.pathname)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return { models, foreign, errors }
}

/** Records every boot phase the stage reports, so a regression after ready shows up. */
async function recordPhases(page: Page) {
  await page.addInitScript(() => {
    const phases: string[] = []
    ;(window as unknown as { __phases: string[] }).__phases = phases
    new MutationObserver(() => {
      const state = document.querySelector('[data-scene-state]')?.getAttribute('data-scene-state')
      if (state && phases.at(-1) !== state) phases.push(state)
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-scene-state'] })
  })
}

test.describe('progressive loading', () => {
  test('paints the lite model first and upgrades where the tier allows', async ({
    page,
    baseURL,
  }, testInfo) => {
    const seen = watch(page, baseURL!)
    await recordPhases(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')

    await expect(stage(page)).toHaveAttribute('data-scene-state', 'ready', { timeout: 30_000 })
    expect(seen.models[0]).toBe('/models/mascot.lite.glb')

    const tier = await stage(page).getAttribute('data-tier')
    if (tier === 'low') {
      // The low tier keeps the lite model for good.
      await page.waitForTimeout(3_000)
      expect(seen.models).not.toContain('/models/mascot.full.glb')
      await expect(stage(page)).toHaveAttribute('data-model', 'lite')
    } else {
      await expect(stage(page)).toHaveAttribute('data-model', 'full', { timeout: 30_000 })
      expect(seen.models.indexOf('/models/mascot.full.glb')).toBeGreaterThan(
        seen.models.indexOf('/models/mascot.lite.glb'),
      )
      await page.waitForTimeout(800)
      await page.screenshot({
        path: `scripts/review/out/hero-upgraded-${testInfo.project.name}.png`,
      })
    }

    // The swap never takes the scene back out of ready, and nothing leaves the origin.
    const phases = await page.evaluate(() => (window as unknown as { __phases: string[] }).__phases)
    expect(phases.slice(phases.indexOf('ready'))).toEqual(['ready'])
    expect(seen.foreign).toEqual([])
    expect(seen.errors).toEqual([])
  })

  test('keeps the lite model when the visitor asked to save data', async ({ page, baseURL }) => {
    const seen = watch(page, baseURL!)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { saveData: true, effectiveType: '4g' },
      })
    })
    await page.goto('/')

    await expect(stage(page)).toHaveAttribute('data-scene-state', 'ready', { timeout: 30_000 })
    await page.waitForTimeout(3_000)
    expect(seen.models).toEqual(['/models/mascot.lite.glb'])
    await expect(stage(page)).toHaveAttribute('data-model', 'lite')
    expect(seen.errors).toEqual([])
  })
})
