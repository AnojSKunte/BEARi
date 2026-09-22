# BEARi — your living desktop AI companion 💜

BEARi is a cute, emotionally‑alive AI companion who lives on your Windows
desktop. She walks around, breathes, blinks, follows your cursor, naps when
you're away and waves when you're back, changes outfits on command, remembers
what matters to you, and chats using the AI provider of your choice — all
rendered from her own hand‑drawn artwork, animated smoothly in real time.

She is not a chat window. She *is* the app.

---

## ✨ What she does

- **Lives on the desktop** — a transparent, always‑on‑top layer. She roams the
  full width of your screen, leans toward your cursor, and never blocks your work
  (clicks pass through everywhere except on her).
- **Feels alive** — soft breathing, natural blinking, idle actions (reading a
  book, sipping coffee, casting little sparkles), sleeping after inactivity, and
  a happy wave when you return.
- **Emotions + effects** — happy, excited, thinking, confused, sad, surprised,
  blushing, sleepy, celebrating — each with matching particles (hearts,
  sparkles, confetti, zzz…) and cheek blush.
- **Talks with AI** — click her and chat in a speech bubble (markdown, code,
  tables). Works with **Anthropic (Claude)**, **OpenAI**, or **Google Gemini** —
  your key, stored locally, streamed in real time.
- **Drives her own body** — her replies carry hidden directives so she reacts:
  `<mood:excited>`, `<outfit:blue>` (instant recolor of the vector look),
  `<remember:…>` (saves a lasting fact).
- **Has a real memory** — a local brain with four layers: three core notes that
  are always in her head (who you are, what matters right now, how you like to
  be helped), a timeline of everything that happened, a knowledge graph of the
  people and things in your life whose facts carry two clocks (when they were
  true, when she learned them - nothing is silently overwritten), and
  reflections she writes while she sleeps. She learns from every conversation
  on her own; you can read, correct and delete all of it.
- **Can see your screen — if you let her** — off by default. When on, she takes
  one small look every minute or two while you are active, your AI provider
  describes it in one line, and the picture is discarded. She looks away from
  windows on your private list and pauses from the tray.
- **Updates herself** — installed copies check GitHub Releases and show an
  Update button; you decide when to install.
- **Dashboard** — a clean, calm home for Home · Character · Memory · Awareness ·
  AI Providers · Settings · About: live status chips, her real artwork
  throughout, outfit studio, her whole mind laid open (profile, knowledge graph,
  timeline, reflections, export), screen-awareness controls, per‑provider key
  management, updates, always‑on‑top and start‑with‑Windows toggles.

---

## 🚀 Getting started

### Run from source (development)
```bash
npm install
npm run dev
```
BEARi appears on your desktop and a tray icon (🐻) appears near the clock.

### Configure her brain
Open the **dashboard** (right‑click her → *Open Dashboard*, or double‑click the
tray icon) → **AI Providers** → paste an API key for Anthropic, OpenAI or
Gemini and pick the active provider. Everything else (movement, emotions,
outfits, memory) works without a key.

### Stop / hide her
- Right‑click her → **✖ Quit**, or
- Right‑click the tray icon → **Quit BEARi**.

---

## 📦 Building a distributable

Two shareable forms come out of `release/`:

| Artifact | What it is | Command |
|---|---|---|
| `BEARi-Setup-1.0.0.exe` | Windows installer (per-user, no admin needed; Start-menu + desktop shortcut, uninstaller) | `npm run dist` |
| `BEARi-1.0.0-portable-win-x64.zip` | No install — unzip anywhere and double-click `BEARi.exe` | `npm run pack:portable`, then zip the folder |

Recipient instructions live in [`release/README.txt`](release/README.txt); send it
along with whichever artifact you share.

**Installer on a machine without Developer Mode.** electron-builder downloads a
code-signing toolkit whose archive contains two macOS symlinks; 7-Zip cannot
create symlinks on Windows without Developer Mode or an elevated shell, so
`npm run dist` fails with *"Cannot create symbolic link"*. The toolkit itself
extracts fine — only those two links fail — so the fix is to keep one of the
extracted attempts under the name electron-builder looks for:

```powershell
$c = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
# after one failed `npm run dist`, promote the numbered attempt it left behind:
Copy-Item "$c\<numbered-folder>" "$c\winCodeSign-2.6.0" -Recurse
Remove-Item "$c\winCodeSign-2.6.0\darwin" -Recurse
npx electron-builder --win --publish never
```

(Or enable Developer Mode in *Settings → System → For developers* and just run
`npm run dist`.) Nothing is code-signed — there is no certificate — so Windows
SmartScreen will warn once on first launch; *More info → Run anyway*.

**Why there is an `afterPack` hook.** Stamping her icon into `electron.exe`
(rcedit, which both electron-builder and `pack-portable.mjs` do) leaves the
PE header checksum at zero, and Windows App Control policies — managed
laptops, Smart App Control — refuse to start a zero-checksum image while
happily running the same bytes with a valid one. `scripts/strip-signature.mjs`
recomputes the checksum (and drops any stale signature); `scripts/after-pack.mjs`
runs it inside electron-builder and the portable packer runs it too. If a
launcher ever "does nothing" on double-click, that is the first thing to check.

**Start-up smoke test without a window.** `BEARI_SMOKE=C:\path\to\report.txt`
makes any build open its brain, initialise every engine, write one line to that
file and quit — handy for checking a packaged exe on a machine you cannot see.

---

## 🚀 Releasing a new version (and how updates reach people)

Installed copies of BEARi check **GitHub Releases** for a newer version when
they start and every six hours, and show an *Update* button on Home and About
(and in the tray menu). Nothing downloads until the person presses it.

Set it up once, with the [GitHub CLI](https://cli.github.com) logged in:

```powershell
gh auth login          # once, opens your browser
npm run setup:github   # creates the repo, points releases at it, pushes
```

Then every release is one command:

```powershell
npm run release -- current    # publish the current version as it stands
npm run release               # patch: 1.0.0 -> 1.0.1
npm run release -- minor --notes "Smoother walk, screen awareness"
npm run release -- --dry      # build only, publish nothing
```

`scripts/release.mjs` bumps `package.json`, builds, uploads
`BEARi-Setup-x.y.z.exe` + `latest.yml` + the blockmap to a release tagged
`vx.y.z`, then commits, tags and pushes. Credentials come from the GitHub
CLI’s own login — no token is stored in the project, and none is ever printed.
(`GH_TOKEN` is still honoured if you prefer to set one.)

Two things worth knowing:

- **The repository must be public** for other people’s copies to fetch updates;
  a private one only works for you. `npm run setup:github -- --private` if you
  want that anyway.
- **The portable zip never updates itself** — there is nothing to update
  against. Share the installer when you want people to stay current.

---

## 📈 Knowing who uses her

Two ways, and the first needs no setup at all:

```powershell
npm run stats
```

reads **GitHub**: how many times each release was downloaded, how many people
looked at the repository in the last two weeks, stars and clones. Downloads are
the honest floor — one download is at least one person who wanted her.

To know how many copies are *still in use*, deploy the one-file endpoint in
[`scripts/cloudflare-worker.js`](scripts/cloudflare-worker.js) (free, about five
minutes, instructions at the top of the file) and put its URL in `package.json`:

```json
"beari": { "analyticsEndpoint": "https://beari-usage.you.workers.dev" }
```

Then `npm run stats` also shows active copies, versions in use, rough country
and how long people have kept her.

**What a copy of BEARi sends, once a day:** a random id made on that machine,
the app version, the Windows version, the display language, the date it was
first run, and how many days it has been used. That is the entire payload, and
the app shows it verbatim in *Settings → Say hello to the developer*, with a
switch to stop it. Never sent: anything she remembers, anything anyone types,
anything she sees on screen, API keys, file names, or an IP address beyond the
ordinary fact of making a request.

**The endpoint is baked in at build time.** With none configured — the default,
and how every build so far has shipped — the feature is inert: no timer, no
request, and the Settings card does not appear.

---

## 🧠 How her memory works

`src/main/brain/` is a local SQLite database (Node's built-in driver, FTS5
full-text search, WAL) with four layers, modelled on the systems that work in
practice:

| Layer | Modelled on | What it holds |
|---|---|---|
| **Core blocks** | Letta / MemGPT | Three short notes always in her context - *who they are*, *what matters right now*, *how they like to be helped*. She rewrites them; you can too. |
| **Episodes** | Generative Agents | Every message, note and screen observation, time-stamped. |
| **Knowledge graph** | Zep / Graphiti | Entities (people, projects, tools…) and facts between them with **two clocks**: when a fact was true (`valid_from` / `valid_until`) and when she learned or retired it (`created_at` / `invalidated_at`). Corrections invalidate, never overwrite. |
| **Insights** | Generative Agents "reflection" | What she works out while she sleeps. |

**Learning.** After each exchange an extraction pass (the Mem0 shape) is shown
the related facts she already holds and returns, per candidate, ADD / UPDATE
(old one retired, new one added) / INVALIDATE / NOOP, plus any change to the
core blocks. Once eight or more new episodes have piled up and at least 90
minutes have passed, a reflection pass writes insights and refreshes *what
matters right now*. Both run in the background, queued so they never race,
using the same provider and key as chat.

**Recall.** Every reply is preceded by a fresh recall for that message: BM25
over facts, episodes and insights, blended with recency and importance
(`0.55·relevance + 0.25·recency + 0.20·importance`, half-lives of 30 / 3 / 21
days), plus a graph hop - anything the message names pulls in that entity's
facts even when the words differ. The result is a compact block in her prompt.

`npm run test:brain` exercises the store against a throwaway database.

**Updates never touch it.** Her memory lives in `%APPDATA%\beari\data\`, which
is a different place from the installed program, so installing a new version
(or even uninstalling) leaves it alone — someone who has used her for weeks
keeps every bit of it. The schema only ever adds tables, never drops them, and
the first time a new version opens an existing brain it puts a dated copy next
to it (`brain-backup-<version>-<date>.sqlite`, the last three kept) in case a
future change ever goes wrong.

---

## 🎨 How she's rendered

BEARi supports several rendering modes (switch in **Dashboard → Character →
How she’s drawn**):

| Mode | What it is | Best for |
|---|---|---|
| **Hand‑drawn animation** *(default, `frames`)* | Real 2D animation. Every pose is a **complete drawing of her** — an 8‑frame walk seen from the side, a wave, sitting down to read a book, a coffee sip, a celebration jump, a yawn into a nap with her teddy, a finger‑on‑chin think with an idea bulb. Frames are **held, never cross‑faded**, so nothing is ever doubled or ghosted; each action has an intro and an outro so she stands up before she walks off. On top of the drawings she breathes, leans toward your cursor, squashes on landing, dangles when you drag her, and **turns on the spot** when she switches between her front view and her walking side view. | Her, actually animated |
| **Painted & animated** (`vector`) | Her painted artwork deformed by a real 19‑bone skeleton (linear‑blend skinning, the Live2D/Spine technique), with two‑bone IK, spring hair and cloth. Supports all four outfits and blinking. | Outfits + procedural range |
| **3D BEARi** (`model3d`) | A procedurally built three.js model of her — lit, casting a real shadow, turning in true depth. Experimental. | Depth / 3D feel |
| **Artwork sprite** (`sprite`) | Pure painted frames from the reference sheets, cross‑fading per state. | Simplest exact‑art mode |
| **Layered art rig** (`puppet`) | Her painting cut into moving layers, CSS‑animated. Experimental. | — |

(A Live2D runtime also exists in the code for a future Cubism rig — see
`reference/BEARI-LIVE2D-SPEC.md` — but it is hidden from the dashboard until a
real BEARi model exists, so her design is never compromised by a placeholder.)

---

## 🎬 How the hand‑drawn animation is made

The source is one PNG per action in `reference/anim/` — a single row of evenly
spaced frames, drawn in her exact style. `scripts/build-frames.ts` turns those
sheets into sprite strips the app can play:

1. **paper‑white removal + alpha matting** so each silhouette keeps the soft edge
   the painting has instead of a scissored fringe
2. **trapped‑paper repair** — background sealed inside a curl of hair would show
   as a white splinter on your wallpaper, so those pockets are cleared (painted
   whites — the dupatta, her leggings, the highlights in her eyes — are not)
3. **frame segmentation** by connected components; stray marks such as the
   “zZz” or the idea bulb are merged into the nearest figure, never dropped
4. **size normalisation** — each sheet is scaled so her standing height matches,
   then fitted to the canonical rest frame by silhouette overlap, so she never
   changes size when one clip cuts to the next
5. **grounding** — every planted frame stands on its own lowest pixel (the sheets
   drift 15–50px between a standing figure and a sitting one); only frames
   marked `airborne` keep their height, so the celebration jump really leaves
   the floor
6. **packing** into one WebP strip per clip with a shared cell and anchor

```bash
npm run frames          # rebuild the strips from reference/anim/*.png
npm run preview:frames  # filmstrip of every action, timed by the real engine
```

`npm run preview:frames` drives the **real** Animator and the **real** clip
director at a fixed 60 Hz and writes `scratch/frames-anim.png`, a labelled
filmstrip of every action — so timing, sequencing, anchoring, the turn and the
walk cadence can be checked without launching the app.

**Adding an action:** generate a new sheet (same character, one row, even
spacing, pure white background, feet on one baseline, no shadow or text), save
it as `reference/anim/<name>.png`, add it to `SHEETS` in
`scripts/build-frames.ts`, add a timeline to
`src/renderer/src/character/frames/clips.ts`, and map it in `desired()` in
`frames/director.ts`. The exact prompts used for every existing sheet — plus
ready-made ones for blinking, a talking mouth and a stricter walk cycle — are in
[`reference/anim/PROMPTS.md`](reference/anim/PROMPTS.md).

---

---

## 🦴 How she moves — the deform rig

She is **not** cut into rigid pieces. `scripts/build-mesh.ts` turns each painted
figure into five large layers (body, hair, head, two arms), triangulates each
into a ~10 000‑triangle mesh, and binds every vertex to a 19‑bone skeleton with
smooth weights. At runtime `mesh/MeshBeari.tsx` skins those meshes on the GPU
(WebGL 2, four bone influences per vertex — the same linear‑blend skinning
Live2D and Spine use), so her art **bends** rather than pivots: no gaps, and
cloth curves the way cloth does.

On top of that:

- **occlusion repair** — confidence‑weighted inpainting rebuilds whatever a
  moving part uncovers, and alpha matting gives every silhouette a soft edge
  instead of a cut‑out fringe
- **springs everywhere** — hair and hem lag, overshoot and settle
  (overlapping action); landing squashes the body
- **two‑bone IK** so a hand that should reach her chin actually arrives
- **counter‑rotating spine**, shoulder lift, arm inertia, anticipation before
  the wave, opposed arm swing and distance‑driven footfalls (no foot sliding)

Verify any change without launching the app:
`npx tsx scripts/preview-mesh.ts out.png <style>` runs the real Animator and the
real skinning math through a CPU rasterizer and writes a labelled contact sheet.

## 👗 Outfits

She has four outfits — **kurta** (her painted original), **frock**, **crop top &
jeans**, and **hoodie** — switchable in *Dashboard → Character → What she
wears*, or by just asking her (“wear your hoodie”). They apply to the
**painted & animated** mode; her hand‑drawn animation was drawn in the kurta, so
that mode keeps it (generate the same seven sheets in another outfit to add it). The three extra outfits are
complete painted figures cut from `reference/outfits/outfits-sheet.png` by
`scripts/build-outfits.ts` into articulated pieces (hair, head, torso, upper/
lower arms, thighs, calves + shoes), so their painted sleeves, jeans and shoes
animate with the same choreography.

**Adding an outfit:** generate her in the new outfit (front view, arms hanging
clear of the body, legs slightly apart, pure white background, full body), add
a config entry in `scripts/build-outfits.ts` with the figure's joint points,
run `npx tsx scripts/build-outfits.ts preview.png`, and add the style name to
`OUTFIT_STYLES` in `src/shared/types.ts`.

## 🧱 Architecture

Clean, modular Electron + React + TypeScript. Every engine is replaceable.

```
src/
  main/            Electron main process
    index.ts       app lifecycle, IPC, cursor loop, sleep/wake
    windows.ts     transparent character overlay + dashboard windows
    tray.ts        system tray (procedural icon + menu)
    store.ts       atomic JSON persistence
    brain/         her memory: db (SQLite+FTS5), store, learn (extract + reflect), llm
    awareness/     screen observer (one small look, one line kept, picture dropped)
    updater.ts     GitHub Releases auto-update
    chat.ts        conversation orchestrator (history + directives)
    ai/            provider abstraction — anthropic · openai · gemini,
                   persona (system prompt), streaming SSE
  preload/         typed, sandboxed `window.beari` bridge
  shared/          types + directive parser (used by both processes)
  renderer/src/
    character/     the character app
      engine/      Animator (procedural state machine) + Pose contract
      frames/      hand-drawn animation: clip timelines, director, canvas renderer
      mesh/        deform rig: skeleton math, controller, WebGL skinning
      PuppetStage  living‑puppet renderer (pixi mesh + face overlays)
      Beari.tsx    vector renderer
      live2d/      Live2D runtime + model profiles
      Particles, Bubble, effects
    dashboard/     Home · Character · Memory · Providers · Settings · About
    lib/           color/outfit utils, browser mock API
scripts/           asset pipeline (cut art, make icon, fetch models, pack)
reference/         the character bible: sheets, sliced sections, photos, specs
```

Data (settings, memory) lives locally under Electron's `userData`; nothing
leaves your machine except the messages you send to your chosen AI provider.

---

## 🛠️ Useful scripts

| Command | Does |
|---|---|
| `npm run dev` | Run the app with hot reload |
| `npm run build` | Compile main/preload/renderer to `out/` |
| `npm run typecheck` | Strict TypeScript check |
| `npm run pack:portable` | Build the portable `BEARi.exe` folder |
| `npm run dist` | Build the Windows installer |
| `npm run icon` | Regenerate the app icon from her art |
| `npm run frames` | Rebuild her animation strips from `reference/anim/` |
| `npm run preview:frames` | Filmstrip of every action, timed by the real engine |
| `npm run test:brain` | Smoke-test her memory store |
| `npm run setup:github` | Create the release repository and point the app at it |
| `npm run release` | Bump, build, publish to GitHub Releases |
| `npm run stats` | Who is downloading and using her |
| `npm run preview:web` | Preview renderers in a plain browser |

---

## 🗺️ Roadmap (future modules)

These are intentionally **not** in v1 — the original vision anticipates them as
add‑on engines the architecture already leaves room for:

- **Knowledge engine** — understand PDFs, docs, folders, code, repos
- **Voice** — speech‑to‑text, text‑to‑speech, wake word
- **Automation & tools** — let her act on your behalf
- **Plugins** — third‑party extensions
- **More character content** — extra poses/outfits, a rigged Live2D model
- **macOS / Linux** builds

---

Made with 💜 — *"I may be a tiny AI, but I care about you a lot!"*
