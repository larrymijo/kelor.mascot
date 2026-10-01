import { expect, test } from '@playwright/test'

/**
 * What search engines and chat apps see (docs/qa.md). The e2e build is not
 * production, so it stays out of the index; production lets crawlers in
 * (src/lib/site.ts, unit tested).
 */
test.describe('seo', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One profile is enough')
  })

  test('describes the page for search engines and keeps this build out of the index', async ({
    page,
    request,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await page.goto('/')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
    // The home page itself, on the site's host (the production host once deployed).
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /^https?:\/\/[^/]+\/?$/,
    )

    const data = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}',
    )
    expect(data['@type']).toBe('WebPage')
    expect(data.inLanguage).toBe('es')
    expect(data.publisher).toMatchObject({ '@type': 'Organization', name: 'KELOR Interactive' })
    expect(data.about).toMatchObject({ name: 'Kelo' })

    const robots = await request.get('/robots.txt')
    expect(robots.ok()).toBe(true)
    expect(await robots.text()).toMatch(/Disallow: \//)
    const sitemap = await request.get('/sitemap.xml')
    expect(sitemap.ok()).toBe(true)
    expect(await sitemap.text()).toContain('<loc>')
    expect(errors).toEqual([])
  })

  test('shares as a 1200 x 630 card with a frame of Kelo', async ({ page, request }) => {
    await page.goto('/')
    const meta = (selector: string) => page.locator(`meta[${selector}]`)
    await expect(meta('property="og:image:width"')).toHaveAttribute('content', '1200')
    await expect(meta('property="og:image:height"')).toHaveAttribute('content', '630')
    await expect(meta('property="og:image:alt"')).toHaveAttribute('content', /Kelo/)
    await expect(meta('name="twitter:card"')).toHaveAttribute('content', 'summary_large_image')
    await expect(meta('name="twitter:image"')).toHaveCount(1)
    await expect(meta('property="og:title"')).toHaveAttribute('content', /Conoce a Kelo/)

    // Absolute on the production host: fetch its path from this build.
    const image = new URL((await meta('property="og:image"').getAttribute('content'))!)
    const response = await request.get(image.pathname + image.search)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toBe('image/jpeg')
    // Small enough for chat apps to show it at once.
    expect((await response.body()).length).toBeLessThan(150 * 1024)
  })
})
