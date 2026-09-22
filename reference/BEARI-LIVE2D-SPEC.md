# BEARi — Live2D Model Spec

This is the exact spec for rigging BEARi as a Live2D Cubism 4 model so it
drops straight into the app's runtime (`Live2DStage` + `profile.ts`). Hand
this whole file to a Live2D rigger on Fiverr/nizima, **or** follow it yourself
in the free Live2D Cubism Editor.

When done, place the exported files here and tell Claude:

```
src/renderer/public/live2d/models/beari/
  beari.model3.json
  beari.moc3
  beari.<res>/texture_00.png  (+ more if needed)
  beari.physics3.json
  expressions/*.exp3.json
  motion/*.motion3.json
```

The app already loads this path first and falls back to the sample if absent.

---

## 1. Source artwork (the part that must stay ON-MODEL)

One clean, **high-resolution** full-body BEARi (front, ~2000px tall), drawn to
the reference sheet: lavender paisley kurta, white dupatta, white churidar,
brown sandals, pink round glasses, gold hoops, big brown eyes, long wavy dark
hair, center part. Delivered as a **layered PSD**, each movable part on its own
layer with the area *behind* it painted in (so parts can move without holes):

- Hair: front bangs, left face lock, right face lock, back hair (behind body)
- Face base, both cheeks/blush
- Eyes: white, iris L, iris R, upper lash L/R, lower lid L/R (for blink)
- Eyebrows L / R
- Mouth (or mouth-shape set: closed, half, open)
- Glasses (separate, above eyes)
- Ears + earrings
- Neck, torso/kurta, dupatta (front drape + both tails), left arm (upper/fore/hand), right arm (upper/fore/hand), legs, sandals
- **Props on their own hidden layers:** book, laptop, coffee mug (toggled by the app)

## 2. Parameters to rig (use these EXACT standard Cubism IDs)

The runtime drives these by ID — keep the names exactly:

| Parameter ID | Range | Used for |
|---|---|---|
| `ParamAngleX` / `ParamAngleY` / `ParamAngleZ` | -30..30 | head turn toward cursor |
| `ParamEyeBallX` / `ParamEyeBallY` | -1..1 | eyes follow cursor |
| `ParamEyeLOpen` / `ParamEyeROpen` | 0..1 | blink |
| `ParamBrowLY` / `ParamBrowRY` | -1..1 | eyebrow expression |
| `ParamMouthOpenY` | 0..1 | talking / lip-sync (app drives this) |
| `ParamMouthForm` | -1..1 | smile ↔ frown |
| `ParamBodyAngleX` / `ParamBodyAngleY` / `ParamBodyAngleZ` | -10..10 | body sway |
| `ParamBreath` | 0..1 | breathing (set to auto-loop) |

Add physics for hair strands and dupatta tails (natural sway).

## 3. Expressions (`.exp3.json`) — name them EXACTLY

`neutral`, `happy`, `excited`, `thinking`, `confused`, `sad`, `surprised`,
`blushing`, `sleepy`

Each is a small pose of brows/eyes/mouth/cheeks (+ blush layer opacity for
`blushing`). The app calls these by name on mood changes.

## 4. Motions (`.motion3.json`) — group names EXACTLY

- `Idle` — 1–3 gentle looping breathing/blink/sway motions (auto-plays)
- `Wave` — raise arm, wave
- `Celebrate` — both arms up, little bounce
- `Walk` — subtle walk-in-place body bob (movement across screen is done by the app)
- `Sleep` — sit/lean, eyes closed
- `Think` — hand near chin, look up

## 5. Props (book / laptop / coffee)

Put each prop on its own ArtMesh/part with an opacity parameter (or include
them in the matching motion). The app shows/hides them per action; simplest is
to bake them into `Think`/`Idle`/`Walk` variants, or expose parts named
`PartBook`, `PartLaptop`, `PartCoffee` for the app to toggle.

## 6. Export

Cubism Editor → Export → **.moc3** + **model3.json** + texture atlas
(2048² is fine; free editor limits — 30 params / 50 deformers — are plenty).
No watermark on free-tier .moc3 export.

---

Everything above maps 1:1 to `src/renderer/src/character/live2d/profile.ts`
(`BEARI_PROFILE`). If a rigger uses different names, Claude just edits that one
file — nothing else changes.
