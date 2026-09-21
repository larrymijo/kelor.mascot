import { Hero } from '@/components/sections/Hero'
import { copy } from '@/lib/copy'

/**
 * Phase 2: the hero act with the 3D stage, the procedural egg and the
 * placeholder mascot. Later acts of the scroll script follow in phase 6.
 */
export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <main id="main" className="flex-1">
        <Hero />
      </main>

      <footer className="px-4 py-6 text-center text-sm text-ink-300">
        © {new Date().getFullYear()} {copy.footer.owner}
      </footer>
    </div>
  )
}
