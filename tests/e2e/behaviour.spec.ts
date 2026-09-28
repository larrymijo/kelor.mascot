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

/** Roughly where Kelo stands on screen: centred, in the upper part of the hero. */
async function keloOnScreen(page: Page) {
  const box = (await stage(page).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height * 0.3 }
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
    const cta = page.getByRole('link', { name: CTA })

    await cta.hover()
    await expect(stage(page)).toHaveAttribute('data-attention', 'cta')
    await page.mouse.move(5, 5)
    await expect(stage(page)).toHaveAttribute('data-attention', 'pointer')

    // The brand mark comes first, then the contact link.
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(cta).toBeFocused()
    await expect(stage(page)).toHaveAttribute('data-attention', 'cta')
  })

  test('hops when clicked or tapped', async ({ page }, testInfo) => {
    const errors = collectErrors(page)
    await ready(page)
    await page.waitForTimeout(500)
    const kelo = await keloOnScreen(page)
    if (testInfo.project.use.hasTouch) await page.touchscreen.tap(kelo.x, kelo.y)
    else await page.mouse.click(kelo.x, kelo.y)
    await expect(stage(page)).toHaveAttribute('data-clip', 'jump', { timeout: 3_000 })
    // One-shot: it lands back in an idle loop.
    await expect(stage(page)).toHaveAttribute('data-clip', /^(idle|look_around)$/, {
      timeout: 5_000,
    })
    expect(errors).toEqual([])
  })

  test('ignores clicks on the CTA itself', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One profile is enough')
    await ready(page)
    const cta = page.getByRole('link', { name: CTA })
    // Cancel the navigation inside the page, so the stage stays there to be checked.
    await cta.evaluate((link) => link.addEventListener('click', (event) => event.preventDefault()))
    await cta.click()
    await page.waitForTimeout(600)
    await expect(stage(page)).not.toHaveAttribute('data-clip', 'jump')
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
