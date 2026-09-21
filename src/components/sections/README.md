# Sections

Page sections, one per act of the scroll script (`docs/scroll-script.md`).

- One component per act, named after it: `HeroSection.tsx`, `CloseUpsSection.tsx`, `FinaleSection.tsx`.
- Server components by default. Text is real HTML (headings, paragraphs, links) so it is readable, indexable and works without WebGL or with reduced motion.
- Sections publish scroll progress to the scene director; they never import three.js directly.
