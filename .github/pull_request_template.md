## What changes

<!-- One paragraph, then a short list of the key files and why they exist. -->

## Why

<!-- The problem or phase goal this PR addresses. -->

## How to test

- [ ] `corepack pnpm check` passes locally (typecheck, lint, format, tests, model validation, build)
- [ ] CI is green
- Steps to try it on the preview: 1.

## Preview

<!-- The Vercel bot comments the preview URL on this PR; paste it here. -->

## Screenshots

| 375 px | 768 px | 1280 px |
| ------ | ------ | ------- |
|        |        |         |

## Performance checklist

- [ ] Initial JS within budget (≤ 150 kB gzip, excluding the lazy 3D chunk)
- [ ] Heavy code (three.js, GSAP, leva) is lazy-loaded or dev-only
- [ ] Fonts through `next/font`, no new render-blocking third-party requests
- [ ] GLBs pass `corepack pnpm validate:model` for both tiers
- [ ] Lighthouse mobile on the preview: LCP < 2.0 s, CLS 0, TBT < 200 ms
- [ ] 60 fps at quality `medium` in Chrome on an Intel integrated GPU (when 3D is involved)

## Accessibility checklist

- [ ] `prefers-reduced-motion: reduce` verified
- [ ] Keyboard only: everything reachable, visible focus, logical order
- [ ] Landmarks and heading order are semantic
- [ ] Text contrast meets WCAG AA; purple only on the mascot, glows and the CTA
- [ ] Content is readable without WebGL
- [ ] Touch targets ≥ 44 px on mobile
