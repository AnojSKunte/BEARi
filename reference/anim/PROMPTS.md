# Animation sheet prompts

Every file in this folder is one action, drawn as a single row of evenly spaced
frames. `scripts/build-frames.ts` cuts them up; `npm run preview:frames` shows
the result in motion.

Generate sheets in the **same ChatGPT conversation** that produced her character
design, so she stays consistent. Paste the house rules once, then one request
per sheet.

## House rules (paste once, at the start)

> From now on I'll ask for animation sprite sheets of the exact same BEARi
> character from this chat — same face, round pink glasses, long wavy dark brown
> hair, gold hoop earrings, same chibi proportions, same painted style, wearing
> her lavender kurta with the white dupatta, white leggings and brown sandals.
> Every sheet must follow these rules exactly: a single horizontal row of
> frames, every frame the same size and the same scale, evenly spaced with clear
> white gaps between them, full body head to toe visible in every frame, feet on
> the same baseline in every frame, pure flat white background, no shadow, no
> text, no numbers, no arrows, no borders, no watermark. Landscape image,
> highest resolution. Confirm you understand, then wait for each request.

If a sheet drifts, reply: *"Regenerate — same character, identical frame sizes,
feet on one baseline, pure white background, no shadow, no text."*

## Sheets already in the build

| File | Frames | Prompt |
|---|---|---|
| `walk.png` | 8 | 8-frame walking cycle, facing RIGHT, three-quarter side view: 1 right foot forward contact, 2 body lowest, 3 legs passing, 4 body highest, 5 left foot forward contact, 6 body lowest, 7 legs passing, 8 body highest. Arms swing opposite the legs; hair and dupatta trail behind. |
| `wave.png` | 6 | Front view. 1 arm at side smiling, 2 arm halfway up, 3 hand up beside her head, 4 hand tilted left, 5 hand tilted right with a big open-mouth smile, 6 hand tilted left again. |
| `read.png` | 6 | Front view. 1 standing, 2 crouching down, 3 sitting cross-legged, 4 a small open book appears in her hands, 5 reading with her head tilted down, 6 turning a page. |
| `coffee.png` | 6 | Front view. 1 standing, 2 a steaming purple mug appears in her right hand at chest height, 3 mug raised toward her mouth, 4 sipping with eyes closed, 5 mug lowered with a content smile, 6 holding the mug at her chest in both hands. |
| `celebrate.png` | 6 | Front view. 1 standing, 2 crouching to jump, 3 in the air with both arms up and an open-mouth smile, 4 at the top of the jump, 5 landing with knees bent, 6 standing with arms up cheering. |
| `sleep.png` | 4 | Front view. 1 standing yawning with a hand over her mouth, 2 sitting down on the floor, 3 sitting with eyes closed hugging a small teddy bear, 4 same but her head drooped to one side, asleep. |
| `think.png` | 4 | Front view. 1 standing, 2 right hand rising, 3 finger on her chin looking up and to the side, 4 same pose with an "idea" expression, eyes wide. |

## Worth adding next

**`blink.png` — 3 frames.** Gives her blinking back in hand-drawn mode.

> Sprite sheet: 3 frames, front view, BEARi standing exactly as in frame 1 of the
> wave sheet — arms relaxed at her sides, body completely still, identical pose
> and identical position in all three frames. Only her eyes change: 1 eyes fully
> open, 2 eyes half closed, 3 eyes fully closed with the lashes drawn as soft
> downward curves behind her glasses. Nothing else moves at all.

**`talk.png` — 4 frames.** Gives her a mouth that moves while she answers you.

> Sprite sheet: 4 frames, front view, BEARi standing exactly as in frame 1 of the
> wave sheet — arms relaxed at her sides, identical pose and identical position
> in all four frames. Only her mouth changes, as if she is talking: 1 mouth
> closed in a small smile, 2 mouth slightly open, 3 mouth open wide in a happy
> "ah", 4 mouth half open. Nothing else moves at all.

**A tighter walk.** The current `walk.png` is not a strict cycle — her rear foot
does not travel a consistent distance between frames, so her feet cannot be
locked perfectly to the ground. To improve it:

> Sprite sheet: 8-frame walk cycle, strict side view, facing RIGHT, BEARi walking
> at a steady pace. Use the standard animation walk cycle: frame 1 CONTACT (right
> heel down in front, left toe down behind, legs at their widest), 2 DOWN (weight
> on the right leg, body at its lowest), 3 PASSING (left leg swinging past the
> right, feet together, body rising), 4 UP (body at its highest, pushing off the
> left toe), 5 CONTACT mirrored (left heel down in front), 6 DOWN, 7 PASSING,
> 8 UP. Her body must advance the same distance between every pair of frames, and
> the planted foot must stay flat on the ground line.

**Other outfits.** Her animation is drawn in the kurta. To animate the frock,
crop top or hoodie, regenerate the whole set of seven in that outfit into
`reference/anim/<style>/` and extend `SHEETS` in `scripts/build-frames.ts`.
