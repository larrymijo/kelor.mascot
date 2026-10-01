/**
 * The desktop sandbox (docs/interaction-script.md): its settings and the
 * commands of its dock, shared by the page, which draws the controls, and
 * the 3D chunk, which reads the settings every frame and answers the
 * commands. Tiny and dependency-free, like the sound bus, so the page never
 * loads 3D code and the 3D code never imports React components.
 *
 * It also carries the drop of the egg to the scene (a press on the stage, or
 * the page's drop button), and the pixel runner: the scene asks the page to
 * open it after the ninth tap in a row on a touch screen (the dock's button
 * asks on desktop), and the page tells the scene while it is open, so the
 * stage stops drawing behind it.
 */

export const LIGHTINGS = ['studio', 'sunset', 'neon'] as const
export type Lighting = (typeof LIGHTINGS)[number]

export const ACTIONS = ['wave', 'jump', 'roar', 'look'] as const
export type ActionName = (typeof ACTIONS)[number]

export interface ShowcaseState {
  lighting: Lighting
  /** He turns slowly on the spot, like a product on a turntable. */
  spin: boolean
  /** The mesh as a glowing wireframe, with his skeleton over it. */
  xray: boolean
}

export type ShowcaseCommand =
  | { kind: 'action'; name: ActionName }
  | { kind: 'bite' }
  /** Back to the hero shot: the camera's orbit and zoom, and his turn. */
  | { kind: 'resetView' }

export const DEFAULT_SHOWCASE: ShowcaseState = {
  lighting: 'studio',
  spin: false,
  xray: false,
}

let state: ShowcaseState = DEFAULT_SHOWCASE
const stateListeners = new Set<() => void>()
const commandListeners = new Set<(command: ShowcaseCommand) => void>()
const gameListeners = new Set<() => void>()
/** Where on the screen the egg is dropped (CSS pixels, like a pointer event). */
export interface DropPoint {
  clientX: number
  clientY: number
}

const dropListeners = new Set<(at?: DropPoint) => void>()
/** A drop made before the scene listens, handed to its first listener. */
let pendingDrop: { at?: DropPoint } | null = null

export function showcase() {
  return state
}

/** For useSyncExternalStore. */
export function onShowcase(listener: () => void) {
  stateListeners.add(listener)
  return () => {
    stateListeners.delete(listener)
  }
}

export function setShowcase(next: Partial<ShowcaseState>) {
  const merged = { ...state, ...next }
  if ((Object.keys(merged) as (keyof ShowcaseState)[]).every((k) => merged[k] === state[k])) return
  state = merged
  for (const listener of stateListeners) listener()
}

export function sendCommand(command: ShowcaseCommand) {
  for (const listener of commandListeners) listener(command)
}

export function onCommand(listener: (command: ShowcaseCommand) => void) {
  commandListeners.add(listener)
  return () => {
    commandListeners.delete(listener)
  }
}

/**
 * Drop the egg: where a press landed on the stage, or in the middle without
 * a point (the page's drop button). Kept until the scene listens.
 */
export function dropEgg(at?: DropPoint) {
  if (dropListeners.size === 0) {
    pendingDrop = { at }
    return
  }
  for (const listener of dropListeners) listener(at)
}

export function onDropEgg(listener: (at?: DropPoint) => void) {
  dropListeners.add(listener)
  if (pendingDrop) {
    const { at } = pendingDrop
    pendingDrop = null
    listener(at)
  }
  return () => {
    dropListeners.delete(listener)
  }
}

let gameOpen = false
const gameOpenListeners = new Set<() => void>()

/** Whether the pixel runner is open. */
export function isGameOpen() {
  return gameOpen
}

export function setGameOpen(open: boolean) {
  if (open === gameOpen) return
  gameOpen = open
  for (const listener of gameOpenListeners) listener()
}

export function onGameOpen(listener: () => void) {
  gameOpenListeners.add(listener)
  return () => {
    gameOpenListeners.delete(listener)
  }
}

/** Open the pixel runner: the scene (the ninth tap) or the dock asks the page. */
export function requestGame() {
  for (const listener of gameListeners) listener()
}

export function onGameRequest(listener: () => void) {
  gameListeners.add(listener)
  return () => {
    gameListeners.delete(listener)
  }
}
