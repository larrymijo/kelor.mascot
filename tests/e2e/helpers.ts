import { expect, type Page } from '@playwright/test'

/**
 * The stage opens empty and waits for the visitor to drop the egg
 * (docs/interaction-script.md). Waits for the stage, drops the egg with the
 * drop button (in the middle of the stage) if it is still waiting, and
 * waits for Kelo to hatch. The button gets a bare click event, so the drop
 * leaves the focus, the keyboard's starting point and the pointer untouched
 * for the checks that follow; tests/e2e/showcase.spec.ts drops it the way
 * visitors do.
 */
export async function hatch(page: Page, timeout = 40_000) {
  const stage = page.locator('[data-scene-state]')
  await expect(stage).toHaveAttribute('data-scene-state', /waiting|egg|hatching|ready/, {
    timeout,
  })
  if ((await stage.getAttribute('data-scene-state')) === 'waiting') {
    await page.locator('#drop-button').dispatchEvent('click')
  }
  await expect(stage).toHaveAttribute('data-scene-state', 'ready', { timeout })
}
