import type { MetadataRoute } from 'next'
import { isIndexable, siteUrl } from '@/lib/site'

/** Production welcomes crawlers and points them to the sitemap; previews and local builds shut them out. */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
