import { expect, test, type Page } from '@playwright/test'

/**
 * The release gate's accessibility checks that the other specs do not cover:
 * the accessibility tree, reflow at 320 px and 200% zoom, and Windows high
 * contrast (forced colours). Keyboard focus and reduced motion live in
 * hero.spec.ts and interaction.spec.ts. Each check sets its own viewport, so
 * one profile runs them.
 */

const stage = (page: Page) => page.locator('[data-scene-state]')
const heading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Conoce a Kelo' })
const contact = (page: Page) => page.getByRole('link', { name: 'Escríbenos' })

/** The stage is drawing, he has hatched, and the words have faded in around him. */
async function liveReady(page: Page) {
  await expect(stage(page)).toHaveAttribute('data-scene-state', 'ready', { timeout: 40_000 })
  await expect(page.locator('html.live')).toHaveCount(1)
  await page.waitForTimeout(1_000)
}

/** Nothing scrolls sideways, and the element sits inside the viewport's width. */
async function expectReflow(page: Page, element: ReturnType<Page['locator']>) {
  const { scrollWidth, width } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }))
  expect(scrollWidth).toBeLessThanOrEqual(width)
  const box = await element.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(width)
}

test.describe('accessibility', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Each check sets its own viewport')
  })

  test('exposes the page as a short, labelled document', async ({ page }) => {
    await page.goto('/')
    await liveReady(page)
    await expect(page.locator('main')).toMatchAriaSnapshot(`
      - main:
        - img /^Escena 3D/
        - link "KELOR Interactive":
          - img "KELOR Interactive"
        - button "Sonido"
        - button "Tocar a Kelo"
        - paragraph: /Intro o Espacio/
        - region "Conoce a Kelo":
          - heading "Conoce a Kelo" [level=1]
          - paragraph: la mascota de KELOR Interactive
        - region "¿Quieres una web a medida?":
          - paragraph:
            - text: ¿Quieres una web a medida?
            - link "Escríbenos"
          - paragraph: /© \\d{4} KELOR Interactive/
    `)
  })

  // WCAG 1.4.10 reflow: 1280 px at 400% is 320 CSS px; 1.4.4 resize text: 1280 at 200% is 640.
  for (const viewport of [
    { name: 'reflows at 320 px wide (400% zoom)', width: 320, height: 568 },
    { name: 'holds at 200% zoom', width: 640, height: 400 },
  ]) {
    test(`${viewport.name} without sideways scrolling`, async ({ page }) => {
      test.setTimeout(90_000)
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto('/')
      await liveReady(page)
      await expectReflow(page, page.getByRole('button', { name: 'Sonido' }))
      await expect(heading(page)).toBeVisible()
      await expectReflow(page, heading(page))
      await expect(contact(page)).toBeVisible()
      await expectReflow(page, contact(page))
    })
  }

  test('keeps the words and the contact link readable in forced colours', async ({ page }) => {
    test.setTimeout(90_000)
    await page.emulateMedia({ forcedColors: 'active' })
    await page.goto('/')
    await liveReady(page)
    const colours = (locator: ReturnType<Page['locator']>) =>
      locator.evaluate((el) => {
        const style = getComputedStyle(el)
        return { adjust: style.forcedColorAdjust, colour: style.color, opacity: style.opacity }
      })

    await expect(heading(page)).toBeVisible()
    const title = await colours(heading(page))
    // The system's colours apply: the text is never left in the brand's greys.
    expect(title.adjust).not.toBe('none')
    // The letterbox stays black instead of turning into system-coloured bars.
    const bar = await page
      .locator('.letterbox')
      .first()
      .evaluate((el) => getComputedStyle(el).forcedColorAdjust)
    expect(bar).toBe('none')
    // The sound switch's icon sits on a system backplate, not on the dark scene.
    const plate = await page
      .getByRole('button', { name: 'Sonido' })
      .evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(plate).not.toBe('rgba(0, 0, 0, 0)')
    await expect(contact(page)).toBeVisible()
    expect((await colours(contact(page))).adjust).not.toBe('none')
    await contact(page).focus()
    const outline = await contact(page).evaluate((el) => getComputedStyle(el).outlineStyle)
    expect(outline).not.toBe('none')
    await page.screenshot({ path: 'scripts/review/out/a11y-forced-colours.png' })
  })
})
