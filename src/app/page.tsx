import { QaMount } from '@/components/qa/QaMount'
import { Hero } from '@/components/sections/Hero'
import { LiveUI } from '@/components/sections/LiveUI'
import { StageMount } from '@/components/sections/StageMount'

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
    </main>
  )
}
