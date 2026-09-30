/**
 * What a press on the page belongs to, shared by the page (the egg's drop)
 * and the 3D chunk (taps, drags, orbit, hops): presses on controls are
 * theirs, and presses on the words and the sandbox's panels select text.
 * Neither ever drops the egg, orbits the camera or makes Kelo hop.
 */
export const CONTROLS =
  'a, button, input, select, textarea, label, [role="button"], [contenteditable]'
export const WORDS = '.live-text, .live-panel, [role="dialog"]'

/** Whether a press on this element belongs to the stage. */
export function onStage(target: Element | null) {
  return !target?.closest(CONTROLS) && !target?.closest(WORDS)
}
