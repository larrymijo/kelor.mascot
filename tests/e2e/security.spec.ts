import { expect, test } from '@playwright/test'

/**
 * The Content Security Policy (src/lib/security/csp.ts) holds for the whole
 * experience: the full model with its KTX2 textures (Basis transcoder in a
 * Blob worker), the sound, taps, carrying him and the bite.
 */
test.describe('security headers', () => {
  test('serves a Content Security Policy that the whole experience respects', async ({
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
    await expect(page.locator('html.live')).toHaveCount(1)
    await page.getByRole('button', { name: 'Sonido' }).click()
    await page.waitForTimeout(1_000)
    const ui = page.locator('#live-ui')
    const x = Number(await ui.getAttribute('data-kelo-x'))
    const y = Number(await ui.getAttribute('data-kelo-y'))
    // Carry him, drop him, then six taps: every reaction and the bite, with sound.
    await page.mouse.move(x, y - 40)
    await page.mouse.down()
    await page.mouse.move(x - 200, y - 100, { steps: 12 })
    await page.mouse.up()
    await expect(ui).toHaveAttribute('data-kelo', 'rest', { timeout: 5_000 })
    const at = {
      x: Number(await ui.getAttribute('data-kelo-x')),
      y: Number(await ui.getAttribute('data-kelo-y')),
    }
    for (let i = 0; i < 6; i++) {
      await page.mouse.click(at.x, at.y)
      await page.waitForTimeout(450)
    }
    await expect(ui).toHaveAttribute('data-biting', 'true')
    await expect(ui).toHaveAttribute('data-biting', 'false', { timeout: 6_000 })
    expect(violations).toEqual([])
  })
})
