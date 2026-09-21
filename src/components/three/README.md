# Three

Everything that renders WebGL. Client components only, loaded as one lazy chunk from `src/components/sections/StageMount.tsx`.

| File                                                            | Role                                                                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Experience.tsx`                                                | Chunk entry: stage, egg, suspended mascot, optional debug panel                          |
| `Stage.tsx`                                                     | The only Canvas: boot tier, pause off screen, boot sequence, first-frame callback        |
| `store.ts`                                                      | zustand scene state (tier, boot phase, load progress, expression, clip requests, tweaks) |
| `CameraRig.tsx`, `StudioLights.tsx`, `Floor.tsx`, `Effects.tsx` | Framing, studio lighting, grounding and post-processing per tier                         |
| `quality/`                                                      | Device signals and the PerformanceMonitor controller                                     |
| `egg/`                                                          | Procedural hexagonal egg (geometry is unit tested)                                       |
| `mascot/`                                                       | GLB loading and `MascotRig` (clips, expressions, plate glow)                             |
| `debug/`                                                        | leva panel for `?debug` on local and preview builds                                      |

Rules:

- Read every mascot parameter from `@/lib/character`; never hard-code bone names, limits or colours.
- Keep pure logic in `src/lib` with tests; components only wire it to three.js.
- Respect the quality tier and `prefers-reduced-motion` in every component.
- React Compiler lint forbids mutating hook values: put three.js mutations behind methods (see `MascotRig`) or read objects with `get()` inside effects.
