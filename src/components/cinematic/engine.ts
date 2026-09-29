/**
 * The cinematic scroll engine: GSAP (ScrollTrigger, SplitText) and Lenis.
 * A lazy chunk of its own, imported by CinematicMount once the stage is
 * drawing and the browser is idle, so the first paint never waits for it.
 *
 * Its single output is scroll progress, written to src/lib/cinematic/progress
 * for the frame loop. It also switches the page into cinematic mode, reveals
 * the heading, and brings the finale into view when the contact link gets
 * keyboard focus. With reduced motion there is no smooth scroll, no progress
 * smoothing and no text animation.
 */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import Lenis from 'lenis'
import { setScrollProgress } from '@/lib/cinematic/progress'

/** Marker the bundle report uses to find this chunk. */
export const ENGINE_ID = 'kelo-cinematic'

/** Where the heading reveals and where keyboard focus sends the finale, as progress. */
const MEET_REVEAL = [0.35, 0.39] as const
const FINALE = 0.95

export function startCinematic(): () => void {
  gsap.registerPlugin(ScrollTrigger, SplitText)
  const html = document.documentElement
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const finePointer = window.matchMedia('(pointer: fine)').matches
  html.classList.add('cinematic')
  html.dataset.engine = ENGINE_ID
  ScrollTrigger.config({ ignoreMobileResize: true })

  // Smooth scroll on desktop only; phones keep their native feel.
  let lenis: Lenis | null = null
  const tick = (time: number) => lenis?.raf(time * 1000)
  if (finePointer && !reduced) {
    lenis = new Lenis({ lerp: 0.09 })
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
  }

  // One progress value over the whole page, smoothed over 0.6 s unless reduced.
  const proxy = { value: 0 }
  const follow = reduced
    ? (value: number) => setScrollProgress(value)
    : gsap.quickTo(proxy, 'value', {
        duration: 0.6,
        ease: 'power3.out',
        onUpdate: () => setScrollProgress(proxy.value),
      })
  const progress = ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => follow(self.progress),
  })
  setScrollProgress(progress.progress)

  // The heading rises letter by letter as the meet act opens; SplitText keeps
  // an aria-label on the heading so screen readers still read one word. The
  // letters stay grouped in their words, so a line never breaks inside one.
  const heading = document.getElementById('meet-title')
  let split: SplitText | null = null
  let reveal: gsap.core.Tween | null = null
  if (heading && !reduced) {
    split = SplitText.create(heading, { type: 'words,chars', aria: 'auto' })
    reveal = gsap.from(split.chars, {
      yPercent: 60,
      opacity: 0,
      stagger: 0.03,
      ease: 'power3.out',
      scrollTrigger: {
        start: () => MEET_REVEAL[0] * ScrollTrigger.maxScroll(window),
        end: () => MEET_REVEAL[1] * ScrollTrigger.maxScroll(window),
        scrub: 0.6,
      },
    })
  }

  // Keyboard users reaching the tiny contact link see it: jump to the finale.
  const link = document.querySelector<HTMLAnchorElement>('#contact a')
  const onFocus = () => {
    const max = ScrollTrigger.maxScroll(window)
    if (window.scrollY >= 0.86 * max) return
    const top = FINALE * max
    if (lenis) lenis.scrollTo(top, { immediate: true })
    else window.scrollTo({ top, behavior: 'instant' })
  }
  link?.addEventListener('focus', onFocus)

  // The track grew when the class was added: measure again, and again when
  // its height settles. With reduced motion, the global safety net turns
  // every style change into a 0.01 ms transition, so the track only reaches
  // its height a frame after this runs: measured once, the page looked one
  // screen tall and the first scroll jumped straight to the finale.
  ScrollTrigger.refresh()
  const track = document.querySelector('.cinematic-track')
  const settled = new ResizeObserver(() => ScrollTrigger.refresh())
  if (track) settled.observe(track)

  return () => {
    settled.disconnect()
    link?.removeEventListener('focus', onFocus)
    reveal?.scrollTrigger?.kill()
    reveal?.kill()
    split?.revert()
    progress.kill()
    if (lenis) {
      gsap.ticker.remove(tick)
      lenis.destroy()
    }
    html.classList.remove('cinematic')
    delete html.dataset.engine
    setScrollProgress(0)
  }
}
