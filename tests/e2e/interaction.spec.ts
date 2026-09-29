import { expect, test, type Page } from '@playwright/test'

/**
 * Kelo alive on one screen (docs/interaction-script.md): taps and their
 * escalating reactions, the bite on desktop, picking him up, dropping him,
 * hopping, and the keyboard's way to him. Each stage is captured to
 * scripts/review/out as live-<step>-<profile>.png for review.
 */

const stage = (page: Page) => page.locator('[data-scene-state]')
const ui = (page: Page) => page.locator('#live-ui')

async function live(page: Page, reducedMotion: 'reduce' | 'no-preference' = 'no-preference') {
  await page.emulateMedia({ reducedMotion })
  await page.goto('/')
  await expect(stage(page)).toHaveAttribute('data-scene-state', 'ready', { timeout: 40_000 })
  await expect(page.locator('html.live')).toHaveCount(1)
  // Let the hatch settle into idle.
  await page.waitForTimeout(1_500)
}

/** Where Kelo is on screen now, and what he is doing. */
async function kelo(page: Page) {
  const read = (name: string) => ui(page).getAttribute(name)
  return {
    x: Number(await read('data-kelo-x')),
    y: Number(await read('data-kelo-y')),
    state: await read('data-kelo'),
    reaction: await read('data-reaction'),
    biting: (await read('data-biting')) === 'true',
    scale: Number(await read('data-scale')),
  }
}

/** A fine pointer that hovers, on a wide screen: where dragging and the bite exist. */
const isDesktop = (page: Page) =>
  page.evaluate(
    () =>
      matchMedia('(pointer: fine)').matches &&
      matchMedia('(hover: hover)').matches &&
      innerWidth >= 768,
  )

async function tap(page: Page, x: number, y: number, touch: boolean) {
  if (touch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test.describe('live Kelo', () => {
  test('reacts to taps with growing annoyance, and bites on the sixth on desktop', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000)
    const errors = collectErrors(page)
    const shot = (step: string) =>
      page.screenshot({ path: `scripts/review/out/live-${step}-${testInfo.project.name}.png` })
    await live(page)
    const touch = Boolean(testInfo.project.use.hasTouch) && !(await isDesktop(page))
    const desktop = await isDesktop(page)
    await expect(ui(page)).toHaveAttribute('data-kelo', 'rest')
    await shot('rest')

    const at = await kelo(page)
    for (const [i, reaction] of ['giggle', 'hop', 'stare', 'grumpy', 'grumpier'].entries()) {
      await tap(page, at.x, at.y, touch)
      await expect(ui(page)).toHaveAttribute('data-reaction', reaction, { timeout: 2_000 })
      if (i === 4) await shot('grumpier')
      await page.waitForTimeout(500)
    }

    await tap(page, at.x, at.y, touch)
    if (desktop) {
      await expect(ui(page)).toHaveAttribute('data-biting', 'true', { timeout: 2_000 })
      // The lunge: he fills the screen with his jaw wide open.
      await expect.poll(async () => (await kelo(page)).scale, { timeout: 3_000 }).toBeGreaterThan(4)
      await shot('bite')
      await expect(ui(page)).toHaveAttribute('data-biting', 'false', { timeout: 6_000 })
      await expect(ui(page)).toHaveAttribute('data-scale', '1.00')
      await page.waitForTimeout(400)
      await shot('after-bite')
    } else {
      // Phones and tablets never bite: the grumpiest reaction again.
      await expect(ui(page)).toHaveAttribute('data-reaction', 'grumpier', { timeout: 2_000 })
      await page.waitForTimeout(600)
      expect((await kelo(page)).biting).toBe(false)
    }
    expect(errors).toEqual([])
  })

  test('can be picked up, carried, dropped and stays on screen', async ({ page }, testInfo) => {
    test.setTimeout(60_000)
    await live(page)
    test.skip(!(await isDesktop(page)), 'Dragging is for a mouse on a wide screen')
    const errors = collectErrors(page)
    const shot = (step: string) =>
      page.screenshot({ path: `scripts/review/out/live-${step}-${testInfo.project.name}.png` })
    const { width, height } = page.viewportSize()!
    const start = await kelo(page)

    await page.mouse.move(start.x, start.y - 40)
    await expect(page.locator('html[data-kelo-hover]')).toHaveCount(1)
    await page.mouse.down()
    await page.mouse.move(start.x - 300, start.y - 120, { steps: 24 })
    await expect(ui(page)).toHaveAttribute('data-kelo', 'held')
    await expect(page.locator('html[data-kelo-held]')).toHaveCount(1)
    await page.waitForTimeout(300)
    const held = await kelo(page)
    expect(held.x).toBeLessThan(start.x - 150)
    await shot('held')

    // Shake him about: he swings but never leaves the screen.
    for (let i = 0; i < 10; i++) await page.mouse.move(i % 2 ? 20 : width - 20, 60, { steps: 3 })
    const shaken = await kelo(page)
    expect(shaken.x).toBeGreaterThanOrEqual(0)
    expect(shaken.x).toBeLessThanOrEqual(width)

    await page.mouse.move(width * 0.25, height * 0.3, { steps: 6 })
    await page.mouse.up()
    await expect(ui(page)).toHaveAttribute('data-kelo', 'rest', { timeout: 5_000 })
    await expect(page.locator('html[data-kelo-held]')).toHaveCount(0)
    const landed = await kelo(page)
    expect(landed.x).toBeGreaterThan(0)
    expect(landed.x).toBeLessThan(width)
    await page.waitForTimeout(400)
    await shot('landed')

    // No text got selected while he was dragged over the words.
    expect(await page.evaluate(() => getSelection()?.toString() ?? '')).toBe('')
    expect(errors).toEqual([])
  })

  test('hops to a spot on the floor when it is clicked or tapped', async ({ page }, testInfo) => {
    const { width, height } = page.viewportSize()!
    test.skip(
      height > width,
      'In portrait he nearly fills the width: a tap beside him lands on him',
    )
    await live(page)
    const touch = Boolean(testInfo.project.use.hasTouch) && !(await isDesktop(page))
    const start = await kelo(page)
    // Within reach on any screen: on a phone he nearly fills the width, and he
    // never leaves it.
    const target = start.x + (start.x < width / 2 ? 1 : -1) * width * 0.15
    await tap(page, target, start.y + 20, touch)
    await expect
      .poll(async () => Math.abs((await kelo(page)).x - target), { timeout: 3_000 })
      .toBeLessThan(60)
    await expect(ui(page)).toHaveAttribute('data-kelo', 'rest', { timeout: 3_000 })
  })

  test('answers the keyboard: Enter taps him, the arrows make him hop', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'No hardware keyboard on the phone profile')
    await live(page)
    const button = page.getByRole('button', { name: 'Tocar a Kelo' })
    await button.focus()
    expect(await button.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none')
    await page.keyboard.press('Enter')
    await expect(ui(page)).toHaveAttribute('data-reaction', 'giggle', { timeout: 2_000 })
    await page.waitForTimeout(1_200)
    const before = await kelo(page)
    await page.keyboard.press('ArrowRight')
    await expect
      .poll(async () => (await kelo(page)).x, { timeout: 3_000 })
      .toBeGreaterThan(before.x + 20)
  })

  test('snaps in place instead of biting the screen with reduced motion', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000)
    await live(page, 'reduce')
    const touch = Boolean(testInfo.project.use.hasTouch) && !(await isDesktop(page))
    const at = await kelo(page)
    for (let i = 0; i < 6; i++) {
      await tap(page, at.x, at.y, touch)
      await page.waitForTimeout(450)
    }
    await expect(ui(page)).toHaveAttribute('data-reaction', 'grumpier')
    await page.waitForTimeout(800)
    const after = await kelo(page)
    expect(after.biting).toBe(false)
    expect(after.scale).toBe(1)
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
    await live(page)

    // Taps on him make no sound while it is off.
    const at = await kelo(page)
    await page.mouse.click(at.x, at.y)
    expect(await contexts()).toBe(0)

    const toggle = page.getByRole('button', { name: 'Sonido' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(await contexts()).toBe(1)
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(await contexts()).toBe(1)
  })
})
