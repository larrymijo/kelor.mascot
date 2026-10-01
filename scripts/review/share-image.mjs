#!/usr/bin/env node
/**
 * The share image (Open Graph and Twitter card, 1200 x 630): a frame of the
 * real Kelo on his dark stage, looking at the page's title beside him. The
 * production build renders it in the installed Chrome (nothing is
 * downloaded), set in the site's own fonts, at twice the size, then a canvas
 * in the same browser scales it down to a JPEG for
 * src/app/opengraph-image.jpg and twitter-image.jpg (no image library).
 * Regenerate after a change to the model or the look:
 *
 *   corepack pnpm build && node scripts/review/share-image.mjs
 */
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { serve } from './perf.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const APP = join(REPO_ROOT, 'src', 'app')
const WIDTH = 1200
const HEIGHT = 630
const SCALE = 2
/** Where the egg falls, across the card: Kelo stands right of the title. */
const KELO_X = 0.7
/** The title's middle: Kelo looks at it. */
const TITLE = { x: 300, y: 300 }
const TEXT = {
  kicker: 'KELOR Interactive',
  title: 'Conoce a Kelo',
  line: 'Suelta el huevo, míralo nacer y juega con él en tu navegador.',
}
const ALT =
  'Kelo, un dinosaurio morado en 3D, sobre un escenario oscuro junto al título "Conoce a Kelo" de KELOR Interactive.'

/** JPEG quality: under 150 kB for a card that loads fast in chat apps. */
const QUALITY = 0.86

/** The studio's hexagon mark (src/components/ui/LogoMark.tsx), in the logo greys. */
const LOGO = `<svg viewBox="-86.6 -100 173.2 250" width="17" height="25" aria-hidden="true">
  <polygon fill="#545454" points="0,-100 -86.6,-50 -86.6,50 0,100 0,50 -43.3,25 -43.3,-25 0,-50"/>
  <polygon fill="#545454" points="29,-85 60,-67 60,-31 29,-49"/>
  <polygon fill="#a6a6a6" points="0,-50 86.6,0 86.6,100 0,150 0,100 43.3,75 43.3,25 0,0"/>
</svg>`

const server = await serve()
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
})
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE,
  })
  // The largest size the slider allows, on the high tier with the full model.
  await page.addInitScript(() => localStorage.setItem('kelo-size', '1'))
  await page.goto(`${server.url}/?tier=high`)
  await page.waitForSelector('[data-scene-state="waiting"]', { timeout: 60_000 })
  await page.mouse.click(WIDTH * KELO_X, HEIGHT * 0.5)
  await page.waitForSelector('[data-scene-state="ready"]', { timeout: 60_000 })
  await page.waitForSelector('[data-model="full"]', { timeout: 60_000 })

  // The page's own words and controls step aside for the card's.
  await page.addStyleTag({
    content:
      'main > :not(:first-child), main > :not(:first-child) * { visibility: hidden !important; }',
  })
  await page.evaluate(
    ({ text, logo }) => {
      const card = document.createElement('div')
      card.style.cssText =
        'position:fixed;left:84px;top:0;bottom:0;z-index:100;display:flex;flex-direction:column;justify-content:center;gap:22px;max-width:500px;color:#f7f7f7'
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:14px;font:600 14px/1 var(--font-montserrat);letter-spacing:.34em;text-transform:uppercase;color:#a6a6a6">${logo}<span>${text.kicker}</span></div>
        <div style="font:800 74px/1.02 var(--font-montserrat);letter-spacing:-.01em">${text.title}</div>
        <div style="font:400 25px/1.42 var(--font-plex-sans);color:#a6a6a6">${text.line}</div>
        <div style="width:72px;height:3px;border-radius:2px;background:#7a3fe4"></div>`
      document.body.append(card)
    },
    { text: TEXT, logo: LOGO },
  )
  await page.evaluate(() => document.fonts.ready)
  // He looks at the title, then settles into idle.
  await page.mouse.move(TITLE.x, TITLE.y, { steps: 6 })
  await page.waitForTimeout(3_500)

  const shot = await page.screenshot({ type: 'png' })
  // Scale down in a canvas: smooth, and the JPEG comes out of the browser.
  const scaler = await browser.newPage()
  const dataUrl = await scaler.evaluate(
    async ({ png, width, height, quality }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${png}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, width, height)
      return canvas.toDataURL('image/jpeg', quality)
    },
    { png: shot.toString('base64'), width: WIDTH, height: HEIGHT, quality: QUALITY },
  )
  const jpeg = Buffer.from(dataUrl.split(',')[1], 'base64')
  for (const name of ['opengraph-image', 'twitter-image']) {
    writeFileSync(join(APP, `${name}.jpg`), jpeg)
    writeFileSync(join(APP, `${name}.alt.txt`), `${ALT}\n`)
  }
  console.log(
    `src/app/opengraph-image.jpg and twitter-image.jpg: ${Math.round(jpeg.length / 1024)} kB`,
  )
} finally {
  await browser.close()
  server.stop()
}
