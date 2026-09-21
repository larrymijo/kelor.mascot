# Three

Everything that renders WebGL: the R3F canvas, studio scene, mascot, procedural egg, particles and post-processing. Starts in phase 2.

- Client components only (`'use client'`), loaded lazily with `next/dynamic` so the 3D chunk never blocks first paint.
- Read every mascot parameter from `@/lib/character`; never hard-code bone names, limits or colours.
- Respect the active quality tier and `prefers-reduced-motion` in every component.
- leva panels are dev-only and must be tree-shaken from production builds.
