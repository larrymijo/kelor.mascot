import { expect, test } from '@playwright/test'

/**
 * The Content Security Policy (src/lib/security/csp.ts) holds for the whole
 * experience: the full model with its KTX2 textures (Basis transcoder in a
 * Blob worker), the scroll engine, the sound and every act of the cinematic.
 */
test.describe('security headers', () => {
  test('serves a Content Security Policy that the whole cinematic respects', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One profile is enough')
    test.setTimeout(120_000)
    const violations: string[] = []
    page.on('console', (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text()))
        violations.push(message.text())
    })
    page.on('pageerror', (error) => violations.push(error.message))

    // Medium, so the full model and its KTX2 textures load too.
    const response = await page.goto('/?tier=medium')
    const policy = response?.headers()['content-security-policy'] ?? ''
    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("frame-ancestors 'none'")

    const stage = page.locator('[data-scene-state]')
    await expect(stage).toHaveAttribute('data-scene-state', 'ready', { timeout: 40_000 })
    await expect(stage).toHaveAttribute('data-model', 'full', { timeout: 40_000 })
    await expect(page.locator('html.cinematic')).toHaveCount(1, { timeout: 20_000 })
    await page.getByRole('button', { name: 'Sonido' }).click()
    for (const progress of [0.15, 0.42, 0.61, 0.95]) {
      await page.evaluate(
        (p) => window.scrollTo(0, p * (document.documentElement.scrollHeight - window.innerHeight)),
        progress,
      )
      await page.waitForTimeout(1_200)
    }
    expect(violations).toEqual([])
  })
})
