# Interaction script

Kelo on a dark, minimal stage (phases 8 and 9), a showcase for the studio's future clients. The page opens empty: the visitor drops an egg, it falls, lands and hatches, and Kelo, small and finely made, stays alive there: breathing, blinking, following the cursor or finger with his eyes, reacting when touched. On desktop he can be picked up and carried, the camera orbited and zoomed, and a slim dock asks him for actions, changes the light, spins him on a turntable and shows him in x-ray; if you keep poking him he bites the screen. On a phone the ninth tap in a row opens a pixel-art runner.

This document is the source of the behaviour; the numbers live in `character.json` (`interaction`, `egg`, `jaw`, `gaze`, `life`), the layouts in `src/lib/showcase/layout.ts` and the bite's keys in `src/lib/live/bite.ts`. Change this document first, then the data.

## The screen

The stage is near-black (`#0a0a0b`) with only a faint halo behind Kelo: no particles, no glowing floor. Lights are soft and few, so he stands out by his finish, not by glow. Two layouts (`layout.ts`): the desktop sandbox (a wide screen with a fine pointer that hovers) and the compact one (phones, tablets, narrow windows).

| Element     | Where and what                                                                                                                                                                                                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kelo        | Small in the middle of the dark: a third of a desktop screen's height, a little more on a phone (the camera frames him with `frameSubject`, leaving bands for the words and the dock). He stands where the egg fell.                                                                                             |
| Drop prompt | Before the drop, centre screen: a thin tick falling over "Haz clic para soltar el huevo" ("Toca…" on touch screens). A button: the keyboard's way to drop the egg (in the middle).                                                                                                                               |
| Brand mark  | Top left, links to the studio's site.                                                                                                                                                                                                                                                                            |
| Top corner  | The sound switch (`aria-pressed`, off until pressed: the page is silent except for the bite, see Sound) and "Hablemos", the contact link, which draws his look on hover and focus.                                                                                                                               |
| Title       | "Conoce a Kelo" (the `h1`, small spaced capitals) and "la mascota de KELOR Interactive": bottom left on desktop, bottom centre on phones. In place from the first paint, so nothing shifts; they fade out during the bite.                                                                                       |
| Hint        | After the hatch, above the dock: "Arrastra · Gira · Acerca" with a mouse, "Tócalo" on touch screens, until someone first touches him.                                                                                                                                                                            |
| Dock        | Desktop, after the hatch: one slim row of icons, named by tooltips and for screen readers. Saludar, Saltar, Rugir, Mirar (actions: a clip with its face and sound), Morder (the bite), Luz (cycles Estudio, Atardecer, Neón), Giro 360° (the turntable), Rayos X (wireframe and skeleton), Centrar (the camera). |
| © line      | Bottom right on desktop, bottom centre on phones.                                                                                                                                                                                                                                                                |
| Kelo button | An invisible button over him, from head to feet, for the keyboard: "Tocar a Kelo".                                                                                                                                                                                                                               |

Without WebGL, or when the 3D fails to load, the brand mark stays, the words read as a short document and the prompt, the dock and the Kelo button are hidden.

## The drop

`src/lib/scene/boot.ts` runs `waiting → egg → hatching → ready`. The model starts loading at once, but nothing hatches until the visitor drops the egg: a click or tap anywhere on the stage, the prompt included (the egg lands under it, kept inside the screen), or Enter on the prompt (the middle). The egg falls at once, even while the model is still on its way. The egg (`src/lib/scene/drop.ts`, `character.json` `egg.drop`) falls from above the top of the screen under gravity (9.8 m/s²), lands with a squash (a thud when the sound is on) and bounces lower each time until it settles, then rocks while its cracks open and a dim warmth shows through them. It hatches when the model is ready and at least 2.4 s have passed since the drop. The shell is an ivory, speckled dinosaur egg with a thin clearcoat. With reduced motion it appears on the floor, still, and cuts to Kelo.

## States

`src/lib/behaviour/director.ts` runs `egg → hatch → tracking ⇄ acting`. `acting` is while an interaction leads and may impose his look and face; taps themselves are read by `src/lib/behaviour/interaction.ts`, and his movement by `src/lib/behaviour/carry.ts`.

| State    | What he does                                                                                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Egg      | Dropped, landed, rocking while its cracks open.                                                                                                                                                      |
| Hatch    | The shell splits along its cracks into a cap and two halves, the camera kicks, he pops out surprised where the egg stood. Once per visit.                                                            |
| Tracking | Idle: breathing, blinks, the tail swaying. His eyes and head follow the pointer or finger; "Hablemos" draws his look on hover or focus; left alone he glances around (touch screens: `look_around`). |
| Reacting | A tap's reaction, or a dock action, plays (below), looking at you.                                                                                                                                   |
| Held     | Carried by the pointer (desktop).                                                                                                                                                                    |
| Flying   | Dropped or tossed, until he lands.                                                                                                                                                                   |
| Biting   | The full-screen bite (desktop).                                                                                                                                                                      |

## The desktop sandbox

- **Dock actions** (`character.json` `interaction.actions`): Saludar (`wave`, happy), Saltar (`jump`, surprised), Rugir (`roar`, the roar face, jaw 30°), Mirar (`look_around`); each plays like a tap's reaction, with its sound once the sound is on. Morder is the bite (its press starts the audio, like the sixth tap's).
- **Light**: three looks for the key, rim and fill lights and the halo (`src/components/three/looks.ts`), crossfading: Estudio (warm key, violet rim), Atardecer (golden key, pink rim), Neón (cool key, strong violet rim, cyan fill).
- **Turntable**: he turns on the spot, a full circle in 15 s, and eases back to face you when it stops. Never with reduced motion, and never during the bite.
- **X-ray**: every mesh as a glowing violet wireframe, with his skeleton drawn over it.
- **Orbit and zoom**: dragging the empty stage turns the camera around him (40° either way, up to 22° above), the wheel zooms (0.7 to 1.35 of the distance); Centrar brings both back. The bite eases them away and plays at its own close framing, so his jaws still fill the screen.

## Taps

A press on Kelo that lifts before moving 6 px is a tap. Taps less than 2.5 s apart build a streak; each plays the reaction for its place in it:

| Tap | Reaction                        | Clip   | Face      | Jaw | Extra                 | Sound  |
| --- | ------------------------------- | ------ | --------- | --- | --------------------- | ------ |
| 1   | giggle                          | none   | happy     | 8°  | a side-to-side wiggle | giggle |
| 2   | hop                             | `jump` | surprised | 0°  |                       | boing  |
| 3   | stare                           | none   | neutral   | 0°  | eyes locked on you    | "hm?"  |
| 4   | grumpy                          | none   | roar      | 14° | a small wiggle        | growl  |
| 5   | grumpier                        | `roar` | roar      | 24° | a small wiggle        | roar   |
| 6   | the bite (desktop)              |        |           |     | see below             |        |
| 9   | the runner (phones and tablets) |        |           |     | see below             |        |

On touch screens the sixth to eighth taps repeat "grumpier", and the ninth (`interaction.taps.gameAt`) plays it once more and opens the runner. With reduced motion the sixth tap on desktop is a jaw snap in place with the roar face. A tap during a reaction starts the next one straight away. The streak starts over after the bite or the runner, or after 2.5 s without a tap.

## Carrying (desktop)

A fine pointer that hovers, on a screen at least 768 px wide. Over Kelo the cursor becomes a grab hand.

| Moment        | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pick-up       | A press on him that moves past 6 px lifts him by the point that was pressed (between his belly and the top of his head); a soft boop. No text is selected while he is held.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Carried       | The grab point follows the pointer on a critically damped spring (5 Hz), so he moves smoothly even when the mouse jerks. His body hangs from it like a damped pendulum: he swings opposite to the hand's sideways acceleration (up to 40°) and leans with its vertical speed (up to 14°). His legs dangle forward with bent knees and toes down and kick in turn, his arms rise 40° and flap a quarter of that on top (never past 50°: the rig has no collarbones, and the model build checks that the side of his body stays still at that raise), his tail trails behind, and fast motion stretches him a little. He turns most of the way to face you, surprised, following the hand with his eyes. |
| Screen edges  | Held, he stops at them; the top of his head may leave the screen, up to a fifth of him.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Drop and toss | He keeps the hand's velocity, up to 5 m/s: gravity (14 m/s²) and air drag pull him down, the screen edges bounce him back.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Landing       | He bounces while the impact is hard (restitution 0.3), slides to a stop, and squashes to as low as 82% of his height, springing back. A hard landing thuds and startles him. He stays where he landed, easing back to his three-quarter pose.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

All of it runs in fixed 1/240 s steps, so every frame rate moves the same.

## Hopping (every device)

The single-pointer alternative to dragging: a click or tap on the stage away from him makes him hop there, and with the Kelo button focused the arrow keys hop him 0.35 m at a time. A hop peaks 0.22 m high (lower under a close ceiling) and lands planted on its spot, with the `jump` clip.

## The bite (desktop, the sixth tap)

3.4 s, keyed in seconds in `src/lib/live/bite.ts` and sampled by `LiveDriver`, which fills the same shared pose the camera, mascot, lights, effects and overlays read at rest.

| Seconds   | Camera                                                                                | Kelo                                                    | Screen and effects                                           | Sound                                                                    |
| --------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 0–0.5     | Pulls back a touch                                                                    | Turns to face you, crouches to 96%, roar face, jaw ajar | Words fade out, letterbox starts                             | A deep growl, rising                                                     |
| 0.5–1.45  | Dollies onto his mouth, drops a little under the snout (elevation −4°), widens to 34° | Grows to five times his size; jaw opens to its full 38° | Letterbox 11%, vignette 0.85, plates glow up                 | The rush of the lunge, over a sub and the hum's rumble swelling with him |
| 1.45–1.58 | Closes to 0.3 of the hero distance, trembling                                         | The whole ring of fangs and teeth frames the shot       | Shake builds                                                 | A rattle (1.42)                                                          |
| 1.58      | Shakes hard                                                                           | The jaw slams shut                                      | A flash of light on the teeth; the iris closing on his mouth | The chomp: two clacks, a heavy thump, a crunch, the room answering       |
| 1.78–2.25 |                                                                                       | Put back at normal size, unseen                         | Black                                                        |                                                                          |
| 2.25–2.85 | The hero shot                                                                         | Smug, happy                                             | The iris opens on him                                        | A cheeky chirp (2.3)                                                     |
| 2.85–3.4  |                                                                                       | Eases back to his three-quarter pose                    | Words fade back in                                           |                                                                          |

Taps, drags and hops are ignored while the bite plays. The sandbox's orbit and zoom ease back to the hero shot first, and the camera frames the bite as it always has (`BITE_FRAMING` in `layout.ts`), so the lunge fills the screen however small he stands at rest.

## Sound

Synthesised with Web Audio (`src/lib/sound/synth.ts`), no files, through a limiter and a short room echo from a generated impulse. Three states (`src/lib/sound/control.ts`):

- **auto**, where every visit starts: silent, except for the bite (and the reduced-motion snap), whose sounds are bracketed by `biteStart` and `biteEnd` on the bus. The output opens for the bite and closes 0.9 s after it, once its echo has rung out.
- **on**, after pressing the switch: everything, the bite included, and a low hum whose rumble opens as he grows in the bite.
- **off**, after pressing it again: nothing, the bite included.

Browsers start audio only inside a press. On desktop the press on Kelo (or on the Kelo button) that will bite, the sixth in a row, creates or wakes the AudioContext there (24 kHz); earlier presses only preload the synthesiser's code, and a synthesiser created that late joins the bite already playing. Between bites the audio thread sleeps. Phones never bite, so taps there create nothing until the switch is pressed.

Once on, the scene asks through the bus (`src/lib/sound/bus.ts`) for: the egg's pat as it lands, the hatch's crack and pop, a voice per tap reaction and dock action (giggle, boing, "hm?", growl, roar), a squeak when he is picked up, a whoosh when he is tossed (let go faster than 1.5 m/s), a thud on hard landings and a pat when a hop lands. The runner has its own square-wave blip (jump), coin (every hundred points) and crash.

## Reduced motion

The egg appears on the floor where it was dropped, still, and the hatch is a cut. Reactions and dock actions keep their faces with a calmer wiggle; carrying works (the visitor moves him) with calmer kicks and flaps; the bite is a jaw snap in place; the turntable does not turn. No grain or shake. The runner keeps its game (the visitor drives it) but the stars stop twinkling.

## Phones and tablets

Kelo a little larger in the frame, taps and their reactions, hops by tapping the stage; no dragging, no orbit, no dock and no bite. The lite model only (212 kB), never the full one.

The ninth tap in a row opens **Kelo Run**, a pixel-art runner in a dialog over the stage (`src/lib/game`, `src/components/game/RunnerGame.tsx`, loaded only when it opens): Kelo runs through a purple night, a tap or Space jumps (a short tap hops lower) over bugs, bug pairs and moths that fly at head height; speed rises with the score. A 240 × 100 canvas scaled up with crisp pixels, sprites drawn in code, fixed 1/120 s steps. The record stays in the browser (`localStorage`, `kelo-run-best`). Esc or the close button ends it and hands the focus back.

## Checkpoints

`tests/e2e/showcase.spec.ts` checks the opening and the sandbox, and captures `showcase-<step>-<profile>.png`:

| Step      | Check                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------- |
| `waiting` | The empty stage and the prompt; nothing hatches on its own                                         |
| `egg`     | A press left of the middle drops the egg there; the prompt goes                                    |
| `ready`   | He hatched where it fell                                                                           |
| `xray`    | Desktop: the dock's Rugir plays the roar, Luz cycles the looks, Rayos X and Giro 360° toggle       |
| `runner`  | Phone: the ninth tap opens the runner; a tap starts it, the score climbs, a bug ends it, it closes |

`tests/e2e/interaction.spec.ts` checks and captures to `scripts/review/out` as `live-<step>-<profile>.png`:

| Step         | Check                                                                    |
| ------------ | ------------------------------------------------------------------------ |
| `rest`       | Ready, live mode, resting                                                |
| `grumpier`   | Taps 1 to 5 play giggle, hop, stare, grumpy, grumpier                    |
| `bite`       | Desktop: the sixth tap bites; at the peak he is over four times his size |
| `after-bite` | Back to normal size, the bite over                                       |
| `held`       | Desktop: picked up and carried, the grab cursor on                       |
| `landed`     | Dropped: back at rest, on screen, no text selected                       |
