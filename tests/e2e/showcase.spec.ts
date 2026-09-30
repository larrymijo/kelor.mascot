import { expect, test, type Page } from '@playwright/test'
import { hatch } from './helpers'

/**
 * The showcase (docs/interaction-script.md): the empty stage and the egg the
 * visitor drops, the desktop dock (actions, the light, the turntable, the
 * x-ray, the bite), and the pixel runner a phone opens on the ninth tap.
 * Stages are captured to scripts/review/out as showcase-<step>-<profile>.png.
 */

const stage = (page: Page) => page.locator('[data-scene-state]')
const ui = (page: Page) => page.locator('#live-ui')

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

test.describe('showcase', () => {
  test('opens on an empty stage and hatches Kelo where the egg is dropped', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000)
    const errors = collectErrors(page)
    const shot = (step: string) =>
      page.screenshot({ path: `scripts/review/out/showcase-${step}-${testInfo.project.name}.png` })
    await page.goto('/')
    await expect(stage(page)).toHaveAttribute('data-scene-state', 'waiting', { timeout: 40_000 })
    await expect(page.locator('html.waiting')).toHaveCount(1)
    const prompt = page.locator('#drop-button')
    await expect(prompt).toBeVisible()
    // Nothing hatches on its own, however long the model has been there.
    await page.waitForTimeout(3_000)
    await expect(stage(page)).toHaveAttribute('data-scene-state', 'waiting')
    await shot('waiting')

    // A press on the stage, off the prompt, drops the egg there.
    const size = page.viewportSize()!
    const at = { x: size.width * 0.3, y: size.height * 0.35 }
    if (testInfo.project.use.hasTouch) await page.touchscreen.tap(at.x, at.y)
    else await page.mouse.click(at.x, at.y)
    await expect(stage(page)).toHaveAttribute('data-scene-state', 'egg')
    await expect(prompt).toBeHidden()
    await page.waitForTimeout(1_200)
    await shot('egg')
    await expect(stage(page)).toHaveAttribute('data-scene-state', 'ready', { timeout: 40_000 })
    await page.waitForTimeout(1_500)
    await shot('ready')
    // He hatched left of the middle, where the egg fell.
    const x = Number(await ui(page).getAttribute('data-kelo-x'))
    expect(x).toBeLessThan(size.width * 0.45)
    expect(errors).toEqual([])
  })

  test('answers the desktop dock: an action, the light, the turntable and the x-ray', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The dock is the desktop sandbox')
    test.setTimeout(90_000)
    const errors = collectErrors(page)
    await page.goto('/')
    await hatch(page)
    const dock = page.getByRole('group', { name: 'Controles de Kelo' })
    await expect(dock).toBeVisible()
    await page.waitForTimeout(1_000)

    await dock.getByRole('button', { name: 'Rugir' }).click()
    await expect(ui(page)).toHaveAttribute('data-reaction', 'roar', { timeout: 2_000 })

    const light = dock.getByRole('button', { name: /^Luz/ })
    await expect(light).toHaveAccessibleName('Luz: Estudio')
    await light.click()
    await expect(light).toHaveAccessibleName('Luz: Atardecer')
    await light.click()
    await expect(light).toHaveAccessibleName('Luz: Neón')

    const xray = dock.getByRole('button', { name: 'Rayos X' })
    await xray.click()
    await expect(xray).toHaveAttribute('aria-pressed', 'true')
    const spin = dock.getByRole('button', { name: 'Giro 360°' })
    await spin.click()
    await expect(spin).toHaveAttribute('aria-pressed', 'true')
    await page.waitForTimeout(1_500)
    await page.screenshot({ path: 'scripts/review/out/showcase-xray-desktop.png' })
    await xray.click()
    await spin.click()
    await dock.getByRole('button', { name: 'Centrar' }).click()
    await expect(xray).toHaveAttribute('aria-pressed', 'false')
    expect(errors).toEqual([])
  })

  test('opens the pixel runner on the ninth tap on a phone, plays and closes', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'The runner is the phone easter egg')
    test.setTimeout(90_000)
    const errors = collectErrors(page)
    await page.goto('/')
    await hatch(page)
    await page.waitForTimeout(1_500)
    const x = Number(await ui(page).getAttribute('data-kelo-x'))
    const y = Number(await ui(page).getAttribute('data-kelo-y'))
    for (let i = 0; i < 9; i++) {
      await page.touchscreen.tap(x, y)
      await page.waitForTimeout(350)
    }
    const game = page.getByRole('dialog', { name: /Minijuego/ })
    await expect(game).toBeVisible({ timeout: 8_000 })
    await expect(game).toHaveAttribute('data-game-phase', 'ready')

    // A tap starts the run; the score climbs until a bug ends it.
    await page.touchscreen.tap(195, 420)
    await expect(game).toHaveAttribute('data-game-phase', 'running')
    await page.waitForTimeout(1_500)
    expect(Number(await game.getAttribute('data-game-score'))).toBeGreaterThan(5)
    await page.screenshot({ path: 'scripts/review/out/showcase-runner-mobile.png' })
    await expect(game).toHaveAttribute('data-game-phase', 'over', { timeout: 30_000 })

    await page.getByRole('button', { name: 'Cerrar el minijuego' }).click()
    await expect(game).toHaveCount(0)
    expect(errors).toEqual([])
  })
})
