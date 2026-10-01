import type { ReactNode } from 'react'
import { LogoMark } from '@/components/ui/LogoMark'
import { copy } from '@/lib/copy'

const { console: kit } = copy.game

/** Moulded dark plastic: a key-lit top edge, a shaded bottom. */
const PLASTIC =
  'bg-[#0f0d15] shadow-[inset_0_1px_0_rgb(255_255_255/0.09),0_2px_0_rgb(0_0_0/0.55),0_4px_8px_rgb(0_0_0/0.45)]'

/** The D-pad: a cross in a shallow round well. Up lights with every jump. */
function DPad() {
  const arrow = 'absolute size-0 border-transparent'
  return (
    <div
      aria-hidden="true"
      className="relative size-[104px] justify-self-center rounded-full bg-black/25 shadow-[inset_0_3px_7px_rgb(0_0_0/0.6),0_1px_0_rgb(255_255_255/0.05)] handheld-wide:size-[124px]"
    >
      <div className="absolute inset-[12%] transition-transform duration-75 active:scale-[0.97]">
        <span className={`absolute inset-x-[34%] inset-y-0 rounded-[7px] ${PLASTIC}`} />
        <span className={`absolute inset-x-0 inset-y-[34%] rounded-[7px] ${PLASTIC}`} />
        <span className="absolute top-1/2 left-1/2 size-[18%] -translate-1/2 rounded-full bg-black/45 shadow-[inset_0_1px_2px_rgb(0_0_0/0.8)]" />
        <span
          className={`${arrow} top-[8%] left-1/2 -translate-x-1/2 border-x-[5px] border-b-[6px] border-b-white/20 transition-colors group-data-pressed:border-b-mascot-glow`}
        />
        <span
          className={`${arrow} bottom-[8%] left-1/2 -translate-x-1/2 border-x-[5px] border-t-[6px] border-t-white/20`}
        />
        <span
          className={`${arrow} top-1/2 left-[8%] -translate-y-1/2 border-y-[5px] border-r-[6px] border-r-white/20`}
        />
        <span
          className={`${arrow} top-1/2 right-[8%] -translate-y-1/2 border-y-[5px] border-l-[6px] border-l-white/20`}
        />
      </div>
    </div>
  )
}

/** A round face button in the brand's purple; A is the jump. */
function FaceButton({ label, jump }: { label: string; jump?: boolean }) {
  return (
    <span className="flex flex-col items-center gap-1.5">
      <span
        className={`size-12 rounded-full bg-[radial-gradient(circle_at_35%_28%,#b18cf7,#7a3fe4_52%,#4a1fa0)] shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_3px_0_#28105c,0_7px_12px_rgb(0_0_0/0.5)] transition-[translate,box-shadow] duration-75 active:translate-y-[2px] active:shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_1px_0_#28105c,0_3px_6px_rgb(0_0_0/0.5)] handheld-wide:size-14 ${
          jump
            ? 'group-data-pressed:translate-y-[2px] group-data-pressed:shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_1px_0_#28105c,0_3px_6px_rgb(0_0_0/0.5)]'
            : ''
        }`}
      />
      <span className="font-display text-[0.62rem] font-extrabold tracking-[0.2em] text-ink-400 italic">
        {label}
      </span>
    </span>
  )
}

/** Select and Start: two slanted rubber pills. */
function Pill({ label }: { label: string }) {
  return (
    <span className="flex flex-col items-center gap-1.5">
      <span
        className={`h-2.5 w-10 -rotate-[24deg] rounded-full ${PLASTIC} transition-transform duration-75 active:translate-y-px`}
      />
      <span className="text-[0.5rem] font-semibold tracking-[0.28em] text-ink-500 uppercase">
        {label}
      </span>
    </span>
  )
}

/**
 * The KELOR K-89, the studio's imaginary late-eighties handheld, in which
 * Kelo Run plays (docs/interaction-script.md): moulded graphite plastic
 * with a purple glow, a recessed screen with its power light, the KELOR
 * mark, a D-pad, purple A and B buttons, Select and Start, and a speaker
 * grille. Upright on narrow screens, like the classic brick; held sideways,
 * with the controls beside the screen, where there is room.
 *
 * It is all CSS and inline shapes, no images. The controls are decoration
 * for the pointer (any press on the dialog jumps, and the keyboard has Space
 * and the arrow up), so they are hidden from assistive technology; the jump
 * shows on the A button and the D-pad's up arrow through the dialog's
 * data-pressed.
 */
export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <div className="console-in relative grid w-full max-w-[420px] grid-cols-2 items-center gap-x-4 gap-y-6 rounded-[30px] rounded-br-[72px] border border-white/[0.07] bg-[linear-gradient(160deg,#2d2641_0%,#1d1829_46%,#131019_100%)] px-5 pt-5 pb-14 shadow-[inset_0_1.5px_0_rgb(255_255_255/0.1),inset_0_-10px_22px_rgb(0_0_0/0.45),0_40px_90px_-30px_rgb(0_0_0/0.9),0_0_110px_-40px_rgb(122_63_228/0.75)] handheld-wide:max-w-[min(1120px,calc(100vw-8rem),calc((100svh-12rem)*2.1))] handheld-wide:grid-cols-[auto_1fr_auto] handheld-wide:grid-rows-[1fr_auto] handheld-wide:gap-x-10 handheld-wide:gap-y-5 handheld-wide:rounded-[72px] handheld-wide:px-12 handheld-wide:py-8">
      {/* The screen, recessed in its dark glass with the power light. */}
      <div className="col-span-2 handheld-wide:col-span-1 handheld-wide:col-start-2 handheld-wide:row-start-1">
        <div className="rounded-[14px] rounded-br-[40px] bg-[#0b0910] p-3 pb-5 shadow-[inset_0_2px_7px_rgb(0_0_0/0.85),0_1px_0_rgb(255_255_255/0.07)] handheld-wide:rounded-[20px] handheld-wide:p-4 handheld-wide:pb-4">
          <div
            aria-hidden="true"
            className="mb-2 flex items-center gap-2 text-[0.5rem] font-semibold tracking-[0.3em] text-ink-500 uppercase"
          >
            <span className="size-1.5 rounded-full bg-mascot-glow shadow-[0_0_7px_1px_var(--color-mascot-500)]" />
            {kit.power}
            <span className="h-px flex-1 bg-gradient-to-r from-mascot-500/60 via-white/10 to-transparent" />
            <span className="font-display italic">
              {kit.brand} {kit.model}
            </span>
          </div>
          <div className="screen-on relative overflow-hidden rounded-[3px] ring-1 ring-black">
            {children}
            {/* Glass: a soft reflection over the pixels. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,rgb(255_255_255/0.08)_0%,transparent_36%),radial-gradient(ellipse_at_center,transparent_62%,rgb(0_0_0/0.28))]"
            />
          </div>
        </div>
      </div>

      {/* The maker's mark, then Select and Start. */}
      <div
        aria-hidden="true"
        className="col-span-2 flex flex-col items-center gap-4 handheld-wide:col-span-1 handheld-wide:col-start-2 handheld-wide:row-start-2"
      >
        <p className="flex items-center gap-2.5 text-ink-300">
          <LogoMark size={17} tone="mono" />
          <span className="font-display text-[0.95rem] font-extrabold tracking-[0.3em] italic">
            {kit.brand}
          </span>
          <span className="text-[0.55rem] font-semibold tracking-[0.32em] text-ink-500 uppercase">
            {kit.maker}
          </span>
        </p>
        <div className="flex gap-6">
          <Pill label={kit.select} />
          <Pill label={kit.start} />
        </div>
      </div>

      <div className="handheld-wide:col-start-1 handheld-wide:row-span-2 handheld-wide:row-start-1">
        <DPad />
      </div>

      <div
        aria-hidden="true"
        className="flex -rotate-[24deg] items-end gap-3 justify-self-center rounded-full bg-black/20 px-3 pt-3 pb-1.5 shadow-[inset_0_3px_7px_rgb(0_0_0/0.55)] handheld-wide:col-start-3 handheld-wide:row-span-2 handheld-wide:row-start-1"
      >
        <FaceButton label="B" />
        <span className="-translate-y-4">
          <FaceButton label="A" jump />
        </span>
      </div>

      {/* The speaker grille, slanted in the rounded corner. */}
      <div
        aria-hidden="true"
        className="absolute right-6 bottom-3.5 flex -rotate-[30deg] gap-1.5 handheld-wide:right-14 handheld-wide:bottom-7"
      >
        {Array.from({ length: 6 }, (_, i) => (
          <span
            key={i}
            className="h-8 w-1.5 rounded-full bg-black/50 shadow-[inset_0_1px_2px_rgb(0_0_0/0.7),0_1px_0_rgb(255_255_255/0.05)]"
          />
        ))}
      </div>
    </div>
  )
}
