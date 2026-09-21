import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'

const CTA = /Conoce KELOR Interactive/
const scene = (page: Page) => page.locator('[data-scene-state]')

/** Console errors, ignoring GPU driver shader-compiler chatter. */
function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test.describe('3D hero', () => {
  test('hatches the mascot and keeps the message usable', async ({ page }, testInfo) => {
    const errors = collectErrors(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/')

    await expect(page).toHaveTitle(/KELOR Interactive/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('img', { name: /Escena 3D/ })).toBeAttached()

    const cta = page.getByRole('link', { name: CTA })
    await expect(cta).toBeVisible()
    expect((await cta.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)

    await expect(scene(page)).toHaveAttribute('data-scene-state', /egg|hatching|ready/, {
      timeout: 30_000,
    })
    await page.screenshot({ path: `scripts/review/out/hero-egg-${testInfo.project.name}.png` })

    await expect(scene(page)).toHaveAttribute('data-scene-state', 'ready', { timeout: 30_000 })
    await page.waitForTimeout(2_800) // let the hatch clip settle into idle
    await page.screenshot({ path: `scripts/review/out/hero-ready-${testInfo.project.name}.png` })

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows).toBe(false)
    expect(errors).toEqual([])
  })

  test('keyboard users reach the CTA with a visible focus ring', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'No hardware keyboard on the phone profile')
    await page.goto('/')
    await page.keyboard.press('Tab')
    const focused = page.locator(':focus')
    await expect(focused).toHaveAccessibleName(CTA)
    expect(await focused.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none')
  })

  test('cuts straight to the mascot with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const seen = new Set<string>()
    await page.exposeFunction('reportSceneState', (state: string) => seen.add(state))
    await page.addInitScript(() => {
      new MutationObserver(() => {
        const state = document.querySelector<HTMLElement>('[data-scene-state]')?.dataset.sceneState
        if (state)
          (window as unknown as { reportSceneState: (s: string) => void }).reportSceneState(state)
      }).observe(document, {
        attributes: true,
        subtree: true,
        attributeFilter: ['data-scene-state'],
      })
    })
    await page.goto('/')
    await expect(scene(page)).toHaveAttribute('data-scene-state', 'ready', { timeout: 30_000 })
    expect(seen.has('hatching')).toBe(false)
    const animation = await page
      .getByTestId('logo-glow')
      .evaluate((el) => getComputedStyle(el).animationName)
    expect(animation).toBe('none')
  })
})

test.describe('preview debug panel', () => {
  test('appears only with ?debug and drives the mascot', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One profile is enough for the tooling')
    const errors = collectErrors(page)

    await page.goto('/')
    await expect(scene(page)).toHaveAttribute('data-scene-state', /egg|hatching|ready/, {
      timeout: 30_000,
    })
    await expect(page.getByText('KELOR debug')).toHaveCount(0)

    await page.goto('/?debug')
    await expect(page.getByText('KELOR debug')).toBeVisible({ timeout: 30_000 })
    await expect(scene(page)).toHaveAttribute('data-scene-state', 'ready', { timeout: 30_000 })
    await page.getByRole('button', { name: 'play roar' }).click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: 'scripts/review/out/debug-roar-desktop.png' })
    expect(errors).toEqual([])
  })
})
