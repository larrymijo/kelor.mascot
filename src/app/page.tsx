import { QaMount } from '@/components/qa/QaMount'
import { Hero } from '@/components/sections/Hero'
import { LiveUI } from '@/components/sections/LiveUI'
import { StageMount } from '@/components/sections/StageMount'
import { copy } from '@/lib/copy'
import { siteUrl } from '@/lib/site'

/**
 * For search engines: this page, Kelo, and the studio that publishes him. A
 * data block, never executed, so the Content Security Policy leaves it alone.
 */
const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: copy.meta.title,
  description: copy.meta.description,
  url: `${siteUrl}/`,
  inLanguage: 'es',
  isPartOf: { '@type': 'WebSite', name: copy.meet.title, url: `${siteUrl}/` },
  publisher: { '@type': 'Organization', name: copy.brand, url: copy.studioHref },
  about: { '@type': 'Thing', name: 'Kelo', description: copy.meet.line },
}

/**
 * One live screen (docs/interaction-script.md): Kelo's stage fixed behind
 * everything, the studio mark, the sound switch, and a few words around him.
 * Without WebGL the words read as a short document after the first screen.
 */
export default function Home() {
  return (
    <main id="main" className="relative">
      <div className="fixed inset-0 z-0">
        <StageMount />
      </div>
      <Hero />
      <LiveUI />
      <QaMount />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
        }}
      />
    </main>
  )
}
