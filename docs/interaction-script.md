# Interaction script

Kelo alive on one screen (phase 8). He hatches from his egg once, then stays: breathing, blinking, following the cursor or finger with his eyes, reacting when touched. On desktop he can be picked up and carried around, and if you keep poking him he bites the screen.

This document is the source of the behaviour; the numbers live in `character.json` (`interaction`, `jaw`, `gaze`, `life`) and the bite's keys in `src/lib/live/bite.ts`. Change this document first, then the data.

## The screen

| Element      | Where and what                                                                                                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kelo         | Centre stage on a soft studio halo (`Backdrop`), a small glow and his shadow under his feet. The camera frames him for the screen (`frameSubject`), leaving a band at the bottom for the words.                                   |
| Brand mark   | Top left, links to the studio's site.                                                                                                                                                                                             |
| Sound switch | Top right, `aria-pressed`, shown off until pressed: the page is silent except for the bite (see Sound).                                                                                                                           |
| Title        | "Conoce a Kelo" (the `h1`) and "la mascota de KELOR Interactive": left of him on desktop, above the contact line on phones. In place from the first paint, so nothing shifts when the stage starts; it fades out during the bite. |
| Hint         | "Tócalo o arrástralo" with a mouse, "Tócalo" on touch screens, above the contact line until someone first touches him.                                                                                                            |
| Contact line | "¿Quieres una web a medida? Escríbenos" and the © line, at the bottom.                                                                                                                                                            |
| Kelo button  | An invisible button over him, from head to feet, for the keyboard: "Tocar a Kelo".                                                                                                                                                |

Without WebGL, or when the 3D fails to load, the brand mark stays, the words read as a short document and the Kelo button is hidden.

## States

`src/lib/behaviour/director.ts` runs `egg → hatch → tracking ⇄ acting`. `acting` is while an interaction leads and may impose his look and face; taps themselves are read by `src/lib/behaviour/interaction.ts`, and his movement by `src/lib/behaviour/carry.ts`.

| State    | What he does                                                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Egg      | The rounded dinosaur egg rocks under a spotlight vignette, its cracks glowing, while the lite model loads.                                                                                                 |
| Hatch    | The shell splits along its cracks into a cap and two halves, the motes burst out, the camera kicks, he pops out surprised. Once per visit.                                                                 |
| Tracking | Idle: breathing, blinks, the tail swaying. His eyes and head follow the pointer or finger; the contact link draws his look on hover or focus; left alone he glances around (touch screens: `look_around`). |
| Reacting | A tap's reaction plays (below), looking at you.                                                                                                                                                            |
| Held     | Carried by the pointer (desktop).                                                                                                                                                                          |
| Flying   | Dropped or tossed, until he lands.                                                                                                                                                                         |
| Biting   | The full-screen bite (desktop).                                                                                                                                                                            |

## Taps

A press on Kelo that lifts before moving 6 px is a tap. Taps less than 2.5 s apart build a streak; each plays the reaction for its place in it:

| Tap | Reaction           | Clip   | Face      | Jaw | Extra                 | Sound  |
| --- | ------------------ | ------ | --------- | --- | --------------------- | ------ |
| 1   | giggle             | none   | happy     | 8°  | a side-to-side wiggle | giggle |
| 2   | hop                | `jump` | surprised | 0°  |                       | boing  |
| 3   | stare              | none   | neutral   | 0°  | eyes locked on you    | "hm?"  |
| 4   | grumpy             | none   | roar      | 14° | a small wiggle        | growl  |
| 5   | grumpier           | `roar` | roar      | 24° | a small wiggle        | roar   |
| 6   | the bite (desktop) |        |           |     | see below             |        |

On touch screens the sixth and later taps repeat "grumpier". With reduced motion the sixth tap on desktop is a jaw snap in place with the roar face. A tap during a reaction starts the next one straight away. The streak starts over after the bite, or after 2.5 s without a tap.

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

| Seconds   | Camera                                                                                | Kelo                                                    | Screen and effects                                                       | Sound                                                                    |
| --------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 0–0.5     | Pulls back a touch                                                                    | Turns to face you, crouches to 96%, roar face, jaw ajar | Words fade out, letterbox starts                                         | A deep growl, rising                                                     |
| 0.5–1.45  | Dollies onto his mouth, drops a little under the snout (elevation −4°), widens to 34° | Grows to five times his size; jaw opens to its full 38° | Letterbox 11%, vignette 0.85, plates glow up, motes swirl into the mouth | The rush of the lunge, over a sub and the hum's rumble swelling with him |
| 1.45–1.58 | Closes to 0.3 of the hero distance, trembling                                         | The whole ring of fangs and teeth frames the shot       | Shake builds                                                             | A rattle (1.42)                                                          |
| 1.58      | Shakes hard                                                                           | The jaw slams shut                                      | A flash of light on the teeth; the iris closing on his mouth             | The chomp: two clacks, a heavy thump, a crunch, the room answering       |
| 1.78–2.25 |                                                                                       | Put back at normal size, unseen                         | Black                                                                    |                                                                          |
| 2.25–2.85 | The hero shot                                                                         | Smug, happy                                             | The iris opens on him                                                    | A cheeky chirp (2.3)                                                     |
| 2.85–3.4  |                                                                                       | Eases back to his three-quarter pose                    | Words fade back in                                                       |                                                                          |

Taps, drags and hops are ignored while the bite plays.

## Sound

Synthesised with Web Audio (`src/lib/sound/synth.ts`), no files, through a limiter and a short room echo from a generated impulse. Three states (`src/lib/sound/control.ts`):

- **auto**, where every visit starts: silent, except for the bite (and the reduced-motion snap), whose sounds are bracketed by `biteStart` and `biteEnd` on the bus. The output opens for the bite and closes 0.9 s after it, once its echo has rung out.
- **on**, after pressing the switch: everything, the bite included, and a low hum whose rumble opens as he grows in the bite.
- **off**, after pressing it again: nothing, the bite included.

Browsers start audio only inside a press. On desktop the press on Kelo (or on the Kelo button) that will bite, the sixth in a row, creates or wakes the AudioContext there (24 kHz); earlier presses only preload the synthesiser's code, and a synthesiser created that late joins the bite already playing. Between bites the audio thread sleeps. Phones never bite, so taps there create nothing until the switch is pressed.

Once on, the scene asks through the bus (`src/lib/sound/bus.ts`) for: the hatch's crack and pop, a voice per tap reaction (giggle, boing, "hm?", growl, roar), a squeak when he is picked up, a whoosh when he is tossed (let go faster than 1.5 m/s), a thud on hard landings and a pat when a hop lands.

## Reduced motion

The hatch is a cut. Reactions keep their faces with a calmer wiggle; carrying works (the visitor moves him) with calmer kicks and flaps; the bite is a jaw snap in place. No particles, grain or shake.

## Phones and tablets

Taps and their reactions, hops by tapping the stage, no dragging and no bite. The lite model only (212 kB), never the full one.

## Checkpoints

`tests/e2e/interaction.spec.ts` checks and captures to `scripts/review/out` as `live-<step>-<profile>.png`:

| Step         | Check                                                                    |
| ------------ | ------------------------------------------------------------------------ |
| `rest`       | Ready, live mode, resting                                                |
| `grumpier`   | Taps 1 to 5 play giggle, hop, stare, grumpy, grumpier                    |
| `bite`       | Desktop: the sixth tap bites; at the peak he is over four times his size |
| `after-bite` | Back to normal size, the bite over                                       |
| `held`       | Desktop: picked up and carried, the grab cursor on                       |
| `landed`     | Dropped: back at rest, on screen, no text selected                       |
