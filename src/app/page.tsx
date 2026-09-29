import { CinematicMount } from '@/components/cinematic/CinematicMount'
import { QaMount } from '@/components/qa/QaMount'
import { CinematicUI } from '@/components/sections/CinematicUI'
import { Hero } from '@/components/sections/Hero'
import { StageMount } from '@/components/sections/StageMount'

/**
 * The cinematic page (docs/scroll-script.md). Kelo's stage is fixed behind
 * everything; the first screen, the scroll track and the few words scroll
 * over it. The track only has height in cinematic mode, which the lazy
 * engine switches on once the stage is drawing.
 */
export default function Home() {
  return (
    <main id="main" className="relative">
      <div className="fixed inset-0 z-0">
        <StageMount />
      </div>
      <Hero />
      <div aria-hidden="true" className="cinematic-track" />
      <CinematicUI />
      <CinematicMount />
      <QaMount />
    </main>
  )
}
