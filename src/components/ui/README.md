# UI

Monochrome UI primitives: logo, buttons, links, layout helpers.

- Colours come from the Tailwind tokens in `src/app/globals.css` (`ink-*`). Purple (`mascot-*`) is allowed only on the primary CTA.
- Every interactive element has a visible `:focus-visible` style and an accessible name.
- Motion is opt-in behind `motion-safe:` or `@media (prefers-reduced-motion: no-preference)`.
