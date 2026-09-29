import { expect, test, type Page } from '@playwright/test'

/**
 * What a flaky network or a busy phone does to the page: failed downloads,
 * a lost GPU context, a mistyped URL. The page must stay readable and
 * Spanish, never Next's error screen.
 */

const stage = (page: Page) => page.locator('[data-scene-state]')
/** The static brand mark that stands in for the scene. */
const brandMark = (page: Page) => page.getByTestId('logo-glow').locator('xpath=../..')

/** The page as a plain document: the words and the contact link, no error screen. */
async function expectReadable(page: Page) {
  await expect(page.getByText('This page couldn’t load')).toHaveCount(0)
  await expect(page.locator('html.cinematic')).toHaveCount(0)
  await expect(brandMark(page)).toHaveClass(/opacity-100/)
  await expect(page.getByRole('heading', { level: 1, name: 'Conoce a Kelo' })).toBeAttached()
  const link = page.getByRole('link', { name: 'Escríbenos' })
  await link.scrollIntoViewIfNeeded()
  await expect(link).toBeVisible()
}

test.describe('resilience', () => {
  test('keeps the page readable when the lite model fails to download', async ({ page }) => {
    await page.route('**/models/mascot.lite.glb', (route) => route.abort())
    await page.goto('/')
    await expect(stage(page)).toHaveAttribute('data-scene-state', 'unavailable', {
      timeout: 30_000,
    })
    await expectReadable(page)
  })

  test('keeps the page readable when the 3D chunk fails to download', async ({ page }) => {
    // Chunk names are hashed: recognise the stage's chunk by its content.
    await page.route('**/_next/static/chunks/*.js', async (route) => {
      const response = await route.fetch()
      const body = await response.text()
      if (body.includes('WebGLRenderer')) await route.abort()
      else await route.fulfill({ response, body })
    })
    await page.goto('/')
    await expect(stage(page)).toHaveAttribute('data-scene-state', 'unavailable', {
      timeout: 30_000,
    })
    await expectReadable(page)
  })

  test('keeps the lite Kelo when the full model fails to download', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One profile is enough')
    await page.route('**/models/mascot.full.glb', (route) => route.abort())
    await page.goto('/?tier=medium')
    await expect(stage(page)).toHaveAttribute('data-scene-state', 'ready', { timeout: 30_000 })
    await page.waitForTimeout(5_000)
    await expect(stage(page)).toHaveAttribute('data-scene-state', 'ready')
    await expect(stage(page)).toHaveAttribute('data-model', 'lite')
    await expect(page.getByText('This page couldn’t load')).toHaveCount(0)
  })

  test('covers a lost GPU context and recovers when it comes back', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One profile is enough')
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await expect(stage(page)).toHaveAttribute('data-scene-state', 'ready', { timeout: 30_000 })
    await expect(brandMark(page)).toHaveClass(/opacity-0/)

    // The extension is only reachable while the context is alive: keep it.
    await page.evaluate(() => {
      const gl = document.querySelector('canvas')!.getContext('webgl2')!
      Object.assign(window, { __loseContext: gl.getExtension('WEBGL_lose_context') })
    })
    const context = (action: 'loseContext' | 'restoreContext') =>
      page.evaluate((name) => {
        ;(window as unknown as { __loseContext: WEBGL_lose_context }).__loseContext[name]()
      }, action)

    await context('loseContext')
    await expect(brandMark(page)).toHaveClass(/opacity-100/)
    await context('restoreContext')
    await expect(brandMark(page)).toHaveClass(/opacity-0/)
    // Past the grace period, the scene is still there.
    await page.waitForTimeout(6_000)
    await expect(stage(page)).toHaveAttribute('data-scene-state', 'ready')
    expect(errors).toEqual([])
  })

  test('answers an unknown URL with a Spanish 404 that leads back home', async ({ page }) => {
    const response = await page.goto('/no-existe')
    expect(response?.status()).toBe(404)
    await expect(page).toHaveTitle(/Página no encontrada/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Página no encontrada' }),
    ).toBeVisible()
    await page.getByRole('link', { name: 'Volver al inicio' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(stage(page)).toBeAttached()
  })
})
