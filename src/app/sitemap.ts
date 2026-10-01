import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

/** One screen, one page. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${siteUrl}/`, lastModified: new Date(), changeFrequency: 'monthly', priority: 1 }]
}
