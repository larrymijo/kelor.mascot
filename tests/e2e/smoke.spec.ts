import { expect, test } from '@playwright/test'

/**
 * The smoke test every browser must pass, Safari's WebKit and Firefox
 * included (the cross-browser CI job runs only this file there): the page
 * loads, the stage draws (waiting for the egg) or steps aside cleanly, the words and the
 * contact link are reachable, the 404 is Spanish, and no script errors.
 */
test.describe('smoke', () => {
  test('loads, draws or steps aside cleanly, and keeps the contact link reachable', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await expect(page).toHaveTitle(/KELOR Interactive/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await expect(page.locator('[data-scene-state]')).toHaveAttribute(
      'data-scene-state',
      /waiting|ready|unavailable/,
      { timeout: 60_000 },
    )
    await expect(page.getByRole('heading', { level: 1, name: 'Conoce a Kelo' })).toBeAttached()
    const link = page.getByRole('link', { name: 'Hablemos' })
    await link.focus()
    await expect(link).toBeFocused()
    await expect(link).toBeVisible({ timeout: 10_000 })
    expect(errors).toEqual([])
  })

  test('answers an unknown URL with the Spanish 404', async ({ page }) => {
    const response = await page.goto('/no-existe')
    expect(response?.status()).toBe(404)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Página no encontrada' }),
    ).toBeVisible()
  })
})
