import { expect, test } from '@playwright/test'

const CTA = /Conoce KELOR Interactive/

test.describe('placeholder page', () => {
  test('renders the message and CTA without horizontal overflow', async ({ page }, testInfo) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/KELOR Interactive/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('img', { name: 'KELOR Interactive' })).toBeVisible()

    const cta = page.getByRole('link', { name: CTA })
    await expect(cta).toBeVisible()
    const box = await cta.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows).toBe(false)

    await page.screenshot({
      path: `scripts/review/out/placeholder-${testInfo.project.name}.png`,
      fullPage: true,
    })
  })

  test('keyboard users reach the CTA with a visible focus ring', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'No hardware keyboard on the phone profile')
    await page.goto('/')
    await page.keyboard.press('Tab')
    const focused = page.locator(':focus')
    await expect(focused).toHaveAccessibleName(CTA)
    expect(await focused.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none')
  })

  test('animates the glow only when motion is allowed', async ({ page }) => {
    const glow = page.getByTestId('logo-glow')
    const animationName = () => glow.evaluate((el) => getComputedStyle(el).animationName)

    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')
    expect(await animationName()).toBe('glow-pulse')

    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await animationName()).toBe('none')
  })
})
