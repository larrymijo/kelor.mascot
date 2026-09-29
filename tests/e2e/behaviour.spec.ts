import { expect, test, type Page } from '@playwright/test'

const stage = (page: Page) => page.locator('[data-scene-state]')
const CTA = /Escríbenos/

/** Console errors and uncaught exceptions. */
function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function ready(page: Page, reducedMotion: 'reduce' | 'no-preference' = 'no-preference') {
  await page.emulateMedia({ reducedMotion })
  await page.goto('/')
  await expect(stage(page)).toHaveAttribute('data-scene-state', 'ready', { timeout: 30_000 })
}

/** Where Kelo is on screen, as the frame loop reports it. */
async function keloOnScreen(page: Page) {
  const ui = page.locator('#live-ui')
  return {
    x: Number(await ui.getAttribute('data-kelo-x')),
    y: Number(await ui.getAttribute('data-kelo-y')),
  }
}

test.describe('behaviour', () => {
  test('follows the mouse, and returns to the camera when it rests', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'Mouse tracking is checked on the desktop profile',
    )
    const errors = collectErrors(page)
    await ready(page)
    const { width } = page.viewportSize()!
    const kelo = await keloOnScreen(page)

    await page.mouse.move(40, kelo.y, { steps: 8 })
    await expect(stage(page)).toHaveAttribute('data-attention', 'pointer')
    await page.waitForTimeout(1_500)
    await page.screenshot({ path: `scripts/review/out/gaze-left-${testInfo.project.name}.png` })

    await page.mouse.move(width - 40, kelo.y, { steps: 8 })
    await page.waitForTimeout(1_500)
    await page.screenshot({ path: `scripts/review/out/gaze-right-${testInfo.project.name}.png` })

    // Four seconds without moving: back to the camera (the first glance waits longer).
    await expect(stage(page)).toHaveAttribute('data-attention', 'camera', { timeout: 6_000 })
    expect(errors).toEqual([])
  })

  test('looks at the CTA on hover and on keyboard focus', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'mobile',
      'No hover or hardware keyboard on the phone profile',
    )
    await ready(page)
    await expect(page.locator('html.live')).toHaveCount(1, { timeout: 20_000 })
    const cta = page.getByRole('link', { name: CTA })

    // The brand mark, the sound switch, the Kelo button, then the contact link.
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab')
    await expect(cta).toBeFocused()
    await expect(stage(page)).toHaveAttribute('data-attention', 'cta')

    await cta.blur()
    await page.mouse.move(5, 5)
    await expect(stage(page)).toHaveAttribute('data-attention', 'pointer')
    await cta.hover()
    await expect(stage(page)).toHaveAttribute('data-attention', 'cta')
  })

  test('ignores clicks on the CTA itself', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One profile is enough')
    await ready(page)
    await expect(page.locator('html.live')).toHaveCount(1, { timeout: 20_000 })
    const cta = page.getByRole('link', { name: CTA })
    // Cancel the navigation inside the page, so the stage stays there to be checked.
    await cta.evaluate((link) => link.addEventListener('click', (event) => event.preventDefault()))
    await cta.click()
    await page.waitForTimeout(600)
    // Neither a reaction nor a hop towards the link.
    const ui = page.locator('#live-ui')
    await expect(ui).toHaveAttribute('data-reaction', '')
    await expect(ui).toHaveAttribute('data-kelo', 'rest')
  })

  test('keeps idle still with reduced motion', async ({ page }) => {
    await ready(page, 'reduce')
    const seen = new Set<string>()
    for (let i = 0; i < 14; i++) {
      seen.add((await stage(page).getAttribute('data-clip')) ?? '')
      seen.add(`attention:${(await stage(page).getAttribute('data-attention')) ?? ''}`)
      await page.waitForTimeout(500)
    }
    expect(seen.has('look_around')).toBe(false)
    expect(seen.has('attention:glance')).toBe(false)
  })
})
