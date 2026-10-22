# Accomplice: visual and audio benchmark

Date: 23 Oct 2026. Companion to `docs/DESIGN_RESEARCH.md` (which covers ten-foot UI rules, accessibility and the first critique). This file is about craft: what makes acclaimed mystery and party games look and feel premium, and what Accomplice should copy.

Method:
- Web research on the sources listed at the end of each section and in the source list. Studios rarely publish exact fonts, hex values or timings, so many details below are my own observation of the games and their footage. Those are marked **ASSUMPTION**.
- Review of current screenshots (`apps/tv-web/screenshots/01, 08, 09, 12, 15, 17` and `apps/phone/screenshots/05, 12`) and tokens in `apps/tv-web/src/styles/*.css`, `apps/phone/src/styles.css`, `apps/tv-web/src/audio/audio.ts`.
- Contrast ratios computed with the WCAG 2.x relative luminance formula. Color-blind checks use the Machado 2009 simulation matrices (full severity) and CIELAB distance (Delta E). I treat Delta E of 25 or more as "clearly different" (**ASSUMPTION**, a working threshold, not a standard).

---

## Part 1. What the benchmark games do

### 1.1 Mystery and detective games

**Return of the Obra Dinn (Lucas Pope, 2018)**
- Type: period serif for the logbook, set like a printed 19th century ledger. **ASSUMPTION**: closest free match is IM Fell English or EB Garamond.
- Color: 1-bit, two colors only, with selectable "monitor" presets. Pope says legibility came first and came from two things, outlines on geometry and careful dithering, and he used dithering "as little as possible" (https://blog.playstation.com/archive/2019/10/17/lucas-pope-on-return-of-the-obra-dinns-art-style). He raised internal resolution to 800x450 and stabilized dither to stop flicker on camera moves (same source, also https://www.gamedeveloper.com/design/lucas-pope-and-the-rise-of-the-1-bit-dither-punk-aesthetic).
- Physical object: the whole UI is a leather-bound book with handwritten entries, and correct deductions get inked into "permanent text".
- Reveal and sound: each memory opens with a short audio-only scene leading up to the death, then a frozen tableau where everything is silent except your footsteps, with an occasional jaunty music cue against the grim scene (https://www.pcworld.com/article/3314936/gaming/return-of-the-obra-dinn-review.html, https://www.rpgfan.com/review/return-of-the-obra-dinn-2). After every three correct fates the game plays a short jingle and writes the fates into the book (https://production.thetech.com/2018/11/19/return-of-the-obra-dinn-video-game-review). Music transposes sea shanty material across instruments (https://www.theongaku.com/posts/return-of-the-obra-dinn-soundtrack).
- Lesson for us: **sound first, picture second** for a reveal; batch confirmations into a ceremonial "ink it in" moment; a tight, consistent constraint looks expensive.

**Disco Elysium (ZA/UM, 2019)**
- Type: logo is custom hand-painted lettering; UI and dialogue fonts are not officially credited. Suggested free stand-ins are EB Garamond for dialogue and Noto Serif for UI (https://madegooddesigns.com/disco-elysium-font/). **ASSUMPTION**: dialogue runs in a narrow right-hand column of serif text on near-black, with skill names in colored small caps.
- Art: oil-painting style led by Aleksander Rostov; influences named include Jenny Saville, Alex Kanevsky, Repin and Vrubel. Rostov's "bold brushwork" holds the style together (https://www.mcvuk.com/business-news/we-knew-immediately-that-we-needed-to-make-a-game-with-a-striking-and-unique-look-to-accompany-the-writing-a-look-that-would-balance-the-mundane-with-the-unfamiliar-and-strange-the-art). The team spent about a year settling inventory icon detail (same source). A GDC 2020 talk covered translating classically trained painters into hand-painted, dynamically lit backgrounds (https://gdconf.com/news/come-gdc-and-see-how-disco-elysiums-unique-style-was-achieved-0).
- Contrast strategy (**ASSUMPTION**): dark warm-black background, off-white text, one saturated accent per skill group (intellect blue, psyche purple, physique red, motorics yellow). Color carries category, never the whole message, because each line also names the skill.
- Reveals: red checks (one try, permanent) versus white checks (retryable) create stakes with color plus rules (https://www.itechguides.com/how-disco-elysiums-thought-cabinet-and-skill-checks-work/). The audible dice roll before a red check is the tension beat.
- Lesson: painted portraits are your biggest asset, so frame them like paintings (big, lit, uncluttered). Use one accent color per meaning and always pair it with a word.

**The Case of the Golden Idol (Color Gray Games, 2022)**
- Art: early 1990s point-and-click pixel art, exaggerated cartoonish characters; the developers wanted a screenshot to be recognizable instantly (https://en.wikipedia.org/wiki/The_Case_of_the_Golden_Idol, https://www.fold.lv/en/?p=109290, https://blogs.tuni.fi/playlab/game-reviews/the-case-of-the-golden-idol-pixelated-dioramas-of-crime-and-mystery/).
- UI (**ASSUMPTION**): a frozen "diorama" of the crime, then a fill-in-the-blank parchment page with draggable word chips. When the answer is right, the page locks with a satisfying chord and a short musical flourish; when you have fewer than three errors it tells you "two or fewer are incorrect", which keeps hope alive.
- Lesson: the **"Possible" verdict is exactly Golden Idol's partial-feedback trick.** It is a premium mechanic; make it look and sound as deliberate as Proven.

**Her Story (Sam Barlow, 2015)**
- UI: you sit at a fictional police terminal and your computer plays that role; the search box is "so simple that anyone can pick up and play" (https://en.wikipedia.org/wiki/Her_Story_(video_game), https://www.pocketgamer.biz/feature/62104/making-of-her-story/). Only the first five results show, which shapes discovery. Barlow's aesthetic brief: "True Detective via Blair Witch".
- **ASSUMPTION**: a CRT glass reflection and fluorescent hum sell the room you are in; the player's own reflection flickers on the screen at moments.
- Lesson: diegetic framing (the TV is the case board, the phone is your notebook) makes UI disappear. Ambient room tone matters more than music.

**Shadows of Doubt (ColePowered, 2023)**
- UI is deliberately skeuomorphic: evidence windows look like case files, the clock is a retro digital watch, the board is a literal corkboard; the developer cites Papers, Please. Red strings animate to show the direction of incrimination, shift from white to red as a link becomes more incriminating, and their **width shows reliability**. Paper rustle and stamp sounds give tactile feedback (https://colepowered.com/?p=33958).
- Players call the yarn linking crime scene to suspect "so darn satisfying" (https://steamcommunity.com/app/986130/discussions/0/3764482197529142937).
- Lesson: our red string should carry information (thickness = strength of the link, color = for or against), and it should animate along its path.

**Papers, Please (Lucas Pope, 2013)**
- Born from Pope's fascination with "stamping and paper-shuffling" at border control (https://gamedeveloper.com/design/road-to-the-igf-lucas-pope-s-i-papers-please-i-).
- **ASSUMPTION**: every document is a draggable object with weight; the stamp bar slides out with a mechanical clack; the stamp lands with a heavy thunk and leaves a slightly misregistered ink impression; each day opens on a newspaper front page. Palette is drab Soviet browns and greys so the red DENIED and green APPROVED stamps pop.
- Lesson: a desaturated world makes two or three ink colors feel loud. Our verdict stamp is the "Approved/Denied" moment; it needs mechanical anticipation and an imperfect ink print.

**Inscryption (Daniel Mullins, 2021)**
- Mullins aimed for a "completely unfaithful" retro 3D look, referencing Myst and The 7th Guest, and spent much of card design on readability: he cut most card text except the name and sometimes covered portraits with icons (https://www.thumbsticks.com/magic-myst-pokemon-inspire-inscryption/, https://www.gamedeveloper.com/design/how-game-jam-sacrifices-became-inscryption).
- **ASSUMPTION**: the cabin is lit by a single warm candle against deep black; the dealer is mostly darkness with two glowing eyes; cards are thick, slightly bent physical objects with shadows; the camera leans in to the table on tense moments. Candles being snuffed is the life counter.
- Lesson: **one light source** and real darkness make a cheap scene feel rich. A snuffed candle is a perfect physical "round is ending" signal for us.

**The Wolf Among Us (Telltale, 2013)**
- Cel shading with thick black outlines and comic-book textures; pitch-black shadows against neon pink, drab green and pale yellow; neon-lit night scenes, and Bigby's office in faded yellow lamplight (https://www.grimdarkmagazine.com/review-the-wolf-among-us/, https://siliconera.com/?p=346024).
- **ASSUMPTION**: "X will remember that" text is the signature shareable UI line; chapter title cards with a VHS-like noir title sequence give every episode a TV-show opening.
- Lesson: a strong **two-temperature palette** (warm key light, cool shadow) is the cheapest way to look cinematic. A recurring, quotable UI line becomes the meme.

**Dead Man's Party: A Knives Out Game (Netflix, The Game Band, 2025)**
- Social deduction on TV with phones as controllers, 4 to 8 players, rounds just over 10 minutes, made by The Game Band (Where Cards Fall, Blaseball) (https://www.whats-on-netflix.com/news/netflix-games/netflix-releases-its-knives-out-tie-in-game-just-in-time-for-christmas, https://help.netflix.com/en/node/490369999827556).
- I found no published design detail. It is our closest direct competitor in format, so it is worth a hands-on teardown (**ASSUMPTION**: Netflix will have used the films' house style, chamber strings and a mansion palette).
- The film scores are relevant: Nathan Johnson built the Knives Out score from a string quartet that grows into full orchestra, had players dig in so the bow scrape is audible, and used Hungarian scales with bent notes; the brief was a "cutting string quartet in a claustrophobic New England mansion" (https://en.wikipedia.org/wiki/Knives_Out_(soundtrack), https://fortune.com/2019/11/20/knives-out-interview-rian-johnson-director-nathan-johnson-composer-original-score, https://interviewmagazine.com/film/rian-nathan-johnson-knives-out).
- Lesson: **string quartet is the sound of "posh murder" for a mass audience.** Use it.

**Clue / Cluedo digital (Marmalade Game Studio editions)**
- **ASSUMPTION** (no design source found): each suspect owns a signature color (Scarlet, Mustard, Green, Peacock, Plum, White) that appears on token, card border and accusation UI; the accusation envelope opening is the climax. Character color as identity is decades old and instantly readable from the couch.
- Lesson: give each suspect a fixed color and a fixed initial badge (we already have initial chips on the floor plan; make them consistent everywhere).

### 1.2 Party and TV games

**Jackbox Party Packs (Quiplash, Trivia Murder Party, Drawful)**
- Trivia Murder Party aimed to feel like playing inside a horror movie; the sound designer used analog synths and VHS distortion for the 80s camp setting, and 3D rooms gave space for surround ambience (https://www.jackboxgames.com/blog/trivia-murder-party-3-dev-diary-5, https://www.jackboxgames.com/blog/trivia-murder-party-3-dev-diary-3). The host's unhinged voice partly came from a crude booth picking up radio bleed (https://www.jackboxgames.com/making-the-jackbox-party-pack-3). The team chose a simpler ghost mechanic because it kept pacing tight (same source).
- Jackbox ships separate volume sliders for music, SFX, host voice and master, subtitles everywhere, motion sensitivity, extended timers and no timers (https://www.jackboxgames.com/new-accessibility-features-in-the-jackbox-party-pack-7/, https://www.jackboxgames.com/blog/accessibility-features-in-the-jackbox-party-pack-10). Trivia Murder Party gained color-blind features after user feedback (https://caniplaythat.com/2022/04/20/jackbox-party-pack-9-will-have-a-game-with-a-no-drawing-option-for-accessibility/). Streaming features include extended timers for stream lag and audience play (https://legionm.com/shareholder-updates/jackbox-games-on-twitch).
- **ASSUMPTION** (observed): huge rounded sans or slab headlines, very few words on screen at once, flat saturated backgrounds per game, the host talks during every wait so there is never silence, and every reveal is "show the answers one at a time, pause, then show who wrote it". The host roasts the room, which is what people clip.
- Lesson: **the host is the product.** Our narrator should fill every wait and react to specific players by name.

**Among Us (Innersloth, 2018)**
- The ejection screen line "X was not The Impostor" and the "There is 1 Impostor among us" screen became memes in September 2020 after streamers popularized the game (https://among-us.fandom.com/wiki/Ejection, https://knowyourmeme.com/memes/there-is-1-impostor-among-us--2). Composer and designer credit: Marcus Bromander (https://en.wikipedia.org/wiki/Among_Us).
- **ASSUMPTION** (observed): the emergency meeting uses a full-screen "Emergency Meeting!" / "Dead Body Reported" splash with a loud alarm sting, a shaking megaphone and a 2 second hold. The ejection is slow, silent, a body drifting through stars while text types out one letter at a time. That slowness is why people screenshot it.
- Lesson: **one blunt sentence, typed out slowly, on a near-empty screen** is the most clippable reveal format there is.

**Weekend (formerly Volley): Jeopardy!, Wit's End**
- Volley renamed to Weekend in Feb 2026; Wit's End is a voice-driven fantasy RPG where an AI game master builds the story around what you say out loud, on Fire TV, Samsung and LG (https://www.weekend.com/post/games-to-play-on-tv-with-friends, https://www.fintechfutures.com/press-releases/volley-launches-on-amazon-fire-tv-with-jeopardy-).
- **ASSUMPTION**: Jeopardy! on TV keeps the show's real blue (#060CE9 is the widely quoted board color) and gold value type, and uses the show's real "think" music and Daily Double sound. Licensed, recognizable audio does a lot of the premium lifting.
- Lesson: voice-first TV games live or die on response latency and on filler. Our `thinking` filler and narrator lines already address this.

**Overcooked (Ghost Town Games)**
- **ASSUMPTION** (observed): chunky rounded type, bright saturated food colors over muted floors, bouncy squash and stretch on every pickup, star rating that drops in one at a time with a rising chime and a final big chord. Chaos is shareable because failure is funny and visible from across the room.
- Lesson: ratings and scores should arrive one at a time with rising pitch, never all at once.

**Balatro (LocalThunk, 2024)**
- In-game text is very likely the free pixel font m6x11 / m6x11plus by Daniel Linssen (free with attribution) (https://managore.itch.io/m6x11, https://nattogames.itch.io/m6x11cyrillic).
- LocalThunk on the hidden score preview: the game is more fun when you set up the machine "and watch it go" before knowing the result (https://amara.org/subtitles/qZaMrU6iDy4J/en/2/download/Balatros%20Cursed%20Design%20Problem.en.srt). Players describe it as tactile (https://www.malaymail.com/amp/news/tech-gadgets/2024/12/22/whos-behind-balatro-secretive-game-dev-localthunk-codes-cult-poker-hit-in-canadian-prairie-province/160729).
- A third-party breakdown (not developer confirmed) lists: chips blue #009DFF, mult red #FE5F55, money gold #F0C040; each scored card plays a rising note; card hover lift 12 px and scale 1.05 in 150 ms; selected lift 24 px and scale 1.08; score digits roll with a 400 ms overshoot spring and 50 ms stagger per digit; screen shake scales with score (1 to 2 px small, 6 to 8 px large); CRT scanlines and vignette overlay (https://blakecrosley.com/guides/design/balatro).
- Lesson: **escalating feedback** (each step a little higher, louder, bigger) and **hiding the outcome until the machine finishes** are the core of "juice". Our proof chain reveal is a Rube Goldberg machine; let it run before showing the verdict.

**Hades (Supergiant, 2020)**
- Logo and UI lettering are custom; suggested free stand-ins are Cinzel or Cormorant for titles, Marcellus for headings, EB Garamond for body (https://madegooddesigns.com/hades-font/). Art is pen and ink inspired by Mike Mignola, with bold fluorescent color against a dark underworld (https://criticalvideogamestudies.com/?p=472).
- **ASSUMPTION** (observed): every god owns one color (Zeus gold, Poseidon cyan, Ares red, Aphrodite pink); boon cards are framed in that color so you know who is talking before you read. Dialogue boxes are dark with a thin metallic frame, large character art bleeds over the box edge, and names sit in small caps with wide tracking. Music by Darren Korb switches to vocal versions for big story beats.
- Lesson: **character art should break the frame.** Our speaking portrait sits inside a neat brass rectangle; let shoulders overlap the caption card.

### 1.3 The patterns behind "premium"

1. **One light source, real darkness.** Inscryption, Wolf Among Us, Disco Elysium. Warm key light, cool shadows, a vignette. Cheap, and it reads as cinema.
2. **A world made of objects.** Papers, Please; Shadows of Doubt; Obra Dinn's book. Things have weight, shadow, edges and sound.
3. **Restrained color, loud ink.** A muted base lets two or three meaning colors pop (Papers, Please stamps, Balatro chips/mult, Hades gods).
4. **Sound carries the climax.** Obra Dinn's audio-first memories, Among Us silence, Jackbox host. Silence before a reveal is the most effective sound.
5. **Escalation and suspense.** Balatro's rising notes and hidden score; Overcooked's stars one at a time.
6. **One quotable sentence.** "X was not The Impostor", "X will remember that". People clip text they can read in one second.
7. **The host fills every gap.** Jackbox never leaves dead air.

---

## Part 2. Where Accomplice stands today

Good already: painted gouache portraits; title screen composition (01) is genuinely premium; brass/plum/cream palette is cohesive; paper clue cards with pins; stamp verdict concept (12); proof chain reveal; separate verdict tones exist in CSS (`--sc`).

Gaps against the benchmarks (new findings, on top of DESIGN_RESEARCH.md Part 2):
- **Sound is mostly synthesized oscillator tones** in `audio.ts` (`tone()` and `noise()` for nav, pin, string, gavel, reveal, win, lose, drumroll), with a small set of mp3s in `public/sfx`. Synth beeps undercut the painted world more than anything visual does.
- **Flat lighting.** Investigation (08, 09) and reveal (15) screens are evenly lit plum with a wallpaper pattern. No vignette, no key light, no grain. The title screen has all of these, which is why it looks better than the rest.
- **Verdict stamp looks printed, not stamped (12).** Crisp edges, one flat color, no ink texture. "POSSIBLE" in amber #A86A00 is 3.52:1 on paper, and its small subline needs 4.5:1.
- **Verdict colors are red/amber/green**, which collapse for deuteranopia (green vs red Delta E 25, see Part 4).
- **Reveal (15) is static and half empty**: a sunburst, portrait, name, one line of motive. No culprit reaction, no ceremony, the bottom 40% of the screen is unused.
- **Results (17)** is a clean leaderboard but has no superlative "awards" moment and no shareable artifact.
- **Phone uses Iowan Old Style / system fonts** while TV uses Playfair Display and Inter (05, 12 vs 08). Two brands.
- **Karaoke dims unread words** to about 30% (2.47:1).
- **Suspect strip names wrap to 3 lines** in Playfair (08, 09).

---

## Part 3. Type system

All fonts are on Google Fonts, already used or easy to bundle as woff2 via `@fontsource` (the TV build already bundles Playfair, Inter and Caveat this way, see `apps/tv-web/dist/assets`). Bundle them; do not call the Google Fonts CDN on a TV.

| Role | Font | License | Weights to ship | Use for |
|---|---|---|---|---|
| Display | **Playfair Display** (keep) | SIL OFL 1.1 (https://github.com/google/fonts/tree/main/ofl/playfairdisplay) | 700, 800, 700 italic | Logo, screen titles, suspect name on speaking card, culprit name, case title |
| Body and UI | **Inter** (keep), variable with `opsz` 14 to 32 | SIL OFL 1.1 (https://github.com/google/fonts/tree/main/ofl/inter) | 400, 500, 600, 700 | Everything functional: buttons, clue body, captions, labels, numbers |
| Typewriter accent (new) | **Special Elite** | Apache 2.0 (https://github.com/google/fonts/tree/main/apache/specialelite) | 400 | Clue kind labels, case numbers, "EXHIBIT 3", timestamps on cards, case file stamps. Max 4 words. |
| Handwritten accent | **Caveat** (keep, demote) | SIL OFL 1.1 (https://github.com/google/fonts/tree/main/ofl/caveat) | 600 | Marginal notes only ("Pinned", player scribbles). Never the only carrier of meaning. |

Alternative display if you ever want something warmer and better at small sizes: **Fraunces** (OFL, variable axes `opsz` 9 to 144, `SOFT` 0 to 100, `WONK`, `wght` 100 to 900, checked in https://github.com/google/fonts/tree/main/ofl/fraunces). Its optical size axis thickens hairlines automatically at small sizes, which Playfair cannot do. Do not switch now; Playfair already reads as the brand.

Rules:
1. **Phone uses the same fonts as TV.** Replace `--font-display` Iowan stack and `--font-body` system stack in `apps/phone/src/styles.css` with Playfair Display and Inter.
2. **Playfair only at 36 px or larger on TV, 22 px or larger on phone.** Its hairlines drop below about 2 px under that and shimmer on TVs (**ASSUMPTION** from the screenshots: card titles at about 34 px in 08 are already at the edge). Below that, use Inter 600.
3. **Caps labels** ("ROUND 2 OF 3", "THE TRUTH") in Inter 600, letter-spacing 0.14em, never smaller than 28 px on TV / 13 px on phone.
4. **Numbers**: Inter with `font-variant-numeric: tabular-nums lining-nums` for scores, timers and round counts so digits do not jitter while counting. Playfair old-style figures (the 1,250 in 17) only for hero numbers that do not animate.
5. **Captions**: Inter 500, not Playfair. Serif captions at 3 lines (09) are harder to scan from the couch.
6. **Line length**: max 42 characters per caption line on TV, max 2 lines visible.
7. **Italic** for the verdict explanation and motive line: Playfair Display italic or Inter italic, not Caveat.

### TV scale (1920x1080, 1 css px = 1 px)

| Token | Font | Size / line height | Weight | Case and tracking | Example |
|---|---|---|---|---|---|
| `--t-hero` | Playfair | 140 / 1.0 | 800 | Title case, -0.01em | "Accomplice" logo |
| `--t-display` | Playfair | 96 / 1.05 | 800 | Title case, -0.005em | Culprit name on reveal |
| `--t-h1` | Playfair | 64 / 1.1 | 700 | Title case | Screen title, case title |
| `--t-h2` | Playfair | 48 / 1.15 | 700 | Title case | Theory line on stamp sheet |
| `--t-h3` | Playfair | 38 / 1.2 | 700 | Title case | Clue card title, speaking suspect name |
| `--t-caption` | Inter | 44 / 1.3 | 500 | Sentence case | Suspect's spoken line |
| `--t-body-l` | Inter | 34 / 1.4 | 500 | Sentence case | Clue body, verdict explanation |
| `--t-body` | Inter | 30 / 1.4 | 500 | Sentence case | Secondary info, list rows |
| `--t-label` | Inter | 28 / 1.2 | 600 | UPPERCASE, 0.14em | Round, section eyebrows |
| `--t-type` | Special Elite | 28 / 1.2 | 400 | UPPERCASE, 0.06em | "EXHIBIT 3 . PHYSICAL" |
| `--t-legend` | Inter | 28 / 1 | 600 | Sentence case | Button legend |
| `--t-number` | Inter | 56 / 1 | 700 | tabular lining | Scores |

Nothing on TV below 28 px (Amazon's floor, see DESIGN_RESEARCH.md 1.1).

### Phone scale (CSS px at 390 px wide; scale with `clamp()` up to 430)

| Token | Font | Size / line height | Weight | Notes |
|---|---|---|---|---|
| `--p-hero` | Playfair | 44 / 1.05 | 800 | Role name on the role card |
| `--p-h1` | Playfair | 32 / 1.15 | 700 | Screen title |
| `--p-h2` | Playfair | 24 / 1.2 | 700 | Section heading ("Who did it?") |
| `--p-body-l` | Inter | 19 / 1.45 | 500 | Lies, clue text, role instructions |
| `--p-body` | Inter | 17 / 1.45 | 400 | Default body (matches iOS 17 pt body) |
| `--p-small` | Inter | 15 / 1.4 | 500 | Meta lines, vote counts |
| `--p-label` | Inter | 13 / 1.2 | 600 | UPPERCASE, 0.14em tracking |
| `--p-type` | Special Elite | 15 / 1.2 | 400 | Case numbers, clue tags |
| `--p-button` | Inter | 18 / 1 | 600 | Buttons, minimum 48 px tall hit area |

Support Dynamic Type: use `rem` and test at 200% (`18-investigate-text-200.png` shows this path exists).

---

## Part 4. Palette

Principle: a dark, warm-cool base (plum and ink) lit by one candle (brass and gold), with paper as the "object" surface and **real rubber-stamp ink colors** for verdicts. Real stamp inks are blue, black and red, which happens to be a color-blind-safe trio.

### 4.1 Core tokens (TV and phone share these)

| Token | Hex | Role | Change |
|---|---|---|---|
| `--ink` | #110916 | Deepest background, vignette edge | keep |
| `--ink-2` | #1A0F22 | Caption panels, modal scrim base | keep |
| `--plum` | #2A1535 | Main background | keep |
| `--plum-2` | #3C1F4C | Raised panels, suspect strip | keep |
| `--wine` | #5B1C38 | Accomplice role card, danger panels | keep |
| `--cream` | #F7EEDB | Primary text on dark | keep (phone `--text` #F5EDE0 merges into this) |
| `--muted` | #C4B3CF | Secondary text on dark | keep |
| `--brass` | #C9A24A | Frames, rules, inactive icons | keep |
| `--gold` | #F4C76C | Accent text, primary button fill | keep |
| `--candle` | #FFDC93 | Glows, key light | keep |
| `--focus` | #FFD86B | Focus ring (both apps) | add to TV |
| `--paper` | #F1E4C6 | Clue cards, stamp sheet | keep |
| `--paper-2` | #E6D4AD | Aged paper, card backs | keep |
| `--paper-ink` | #2B1D14 | Text on paper | keep |
| `--paper-muted` | #5E4A3A | Secondary text on paper | new on TV (phone has #5A4635) |
| `--string` | #C8473B | Red string, crime markers | **replaces #C0262F** (less saturated, less TV bloom) |
| `--oxblood` | #8E2A2C | Fill for "ACCOMPLICE" tags, with cream text | new |

### 4.2 Verdict and state colors

On paper (stamp ink) and on dark (chips, phone banners). Each verdict also has a **shape and a word**, so color is never the only cue.

| Verdict | Ink on paper | On dark | Stamp shape | Icon |
|---|---|---|---|---|
| PROVEN | #1D4F91 (blue-black ink) | #8EC5FF | Round seal | check in circle |
| POSSIBLE | #33303A (graphite ink) | #F2B84B | Rectangle, double rule | tilde / balance scale |
| RULED OUT | #A8231B (vermilion ink) | #FF8A7A | Rectangle crossed by a diagonal bar | X |

Score and win states reuse these: detectives win = PROVEN blue, culprit escapes = RULED OUT red, accomplice = oxblood fill.

### 4.3 Contrast (WCAG 2.x, computed)

Text pairs (AA needs 4.5:1 for normal text, 3:1 for large text 24 px+ or 19 px bold; non-text graphics need 3:1):

| Foreground | Background | Ratio | Verdict |
|---|---|---|---|
| cream #F7EEDB | ink #110916 | 16.95 | AAA |
| cream #F7EEDB | ink-2 #1A0F22 | 16.04 | AAA |
| cream #F7EEDB | plum #2A1535 | 14.48 | AAA |
| cream #F7EEDB | plum-2 #3C1F4C | 12.20 | AAA |
| muted #C4B3CF | ink #110916 | 9.95 | AAA |
| muted #C4B3CF | plum-2 #3C1F4C | 7.17 | AAA |
| gold #F4C76C | ink-2 #1A0F22 | 11.66 | AAA |
| brass #C9A24A | ink-2 #1A0F22 | 7.71 | AAA |
| brass #C9A24A | plum #2A1535 | 6.96 | AA (AAA large) |
| focus #FFD86B | plum-2 #3C1F4C | 10.24 | AAA |
| ink #110916 | gold #F4C76C (button) | 12.32 | AAA |
| paper-ink #2B1D14 | paper #F1E4C6 | 12.92 | AAA |
| paper-ink #2B1D14 | paper-2 #E6D4AD | 11.16 | AAA |
| paper-muted #5E4A3A | paper #F1E4C6 | 6.62 | AA |
| paper-muted #5E4A3A | paper-2 #E6D4AD | 5.72 | AA |
| cream #F7EEDB | wine #5B1C38 | 10.92 | AAA |
| cream #F7EEDB | oxblood #8E2A2C | 7.23 | AAA |
| PROVEN #1D4F91 | paper #F1E4C6 | 6.46 | AA |
| POSSIBLE #33303A | paper #F1E4C6 | 10.25 | AAA |
| RULED OUT #A8231B | paper #F1E4C6 | 5.70 | AA |
| PROVEN #1D4F91 | paper-2 #E6D4AD | 5.58 | AA |
| RULED OUT #A8231B | paper-2 #E6D4AD | 4.92 | AA |
| PROVEN #8EC5FF | ink-2 #1A0F22 | 10.20 | AAA |
| POSSIBLE #F2B84B | ink-2 #1A0F22 | 10.33 | AAA |
| RULED OUT #FF8A7A | ink-2 #1A0F22 | 8.08 | AAA |
| PROVEN #8EC5FF | plum-2 #3C1F4C | 7.76 | AAA |
| RULED OUT #FF8A7A | plum-2 #3C1F4C | 6.14 | AA |
| string #C8473B (graphic) | ink #110916 | 4.11 | passes 3:1 non-text |
| string #C8473B (graphic) | paper #F1E4C6 | 3.77 | passes 3:1 non-text |
| string #C8473B (graphic) | plum-2 #3C1F4C | 2.96 | **fails**: add a 1.5 px #110916 drop shadow under the string |

Current values that fail and should go:
- Old string red #C0262F on ink: 3.31 (only just passes as a graphic, fails as text, saturated).
- Old POSSIBLE amber #A86A00 on paper: 3.52 (fails for the small subline).
- Old brass-dk #8A6A2A on paper: 3.99 (fails for small text).
- Karaoke unread words at 30% cream on #1A0F22: 2.47. **Use 70% (#B5ABA3, 8.21:1)** for unread words and mark the current word with a gold underline instead of dimming everything else.

### 4.4 Color-blind check (Delta E between verdict colors after simulation)

| Set | Pair | Normal | Deuteranopia | Protanopia | Tritanopia |
|---|---|---|---|---|---|
| Current on dark (#4FA36B / #F2B84B / #C0262F) | green vs red | 100 | **25** | 30 | 112 |
| | green vs amber | 65 | 48 | 38 | 69 |
| Proposed on paper (#1D4F91 / #33303A / #A8231B) | proven vs possible | 38 | 40 | 37 | 28 |
| | proven vs ruled out | 91 | 88 | 68 | 97 |
| | possible vs ruled out | 68 | 54 | 35 | 76 |
| Proposed on dark (#8EC5FF / #F2B84B / #FF8A7A) | proven vs possible | 96 | 98 | 93 | 69 |
| | proven vs ruled out | 78 | 70 | 53 | 89 |
| | possible vs ruled out | 47 | **29** | 43 | **23** |

Note: I first tried a sepia POSSIBLE ink (#7A4F00) on paper; it collapsed into the red under deuteranopia (Delta E 3), which is why graphite was chosen. On dark, amber vs coral is the weakest pair (23 to 29), so on dark surfaces the **icon and word are mandatory** and the POSSIBLE chip should use an outlined style while RULED OUT uses a filled style.

Player avatar colors (fox, owl, cat, rabbit, mask in 17) should also carry a symbol badge, which they already do. Keep that.

### 4.5 Light and surface recipe (applies to every TV screen)

- Vignette: radial gradient from transparent at 55% to rgba(17, 9, 22, 0.75) at 100%.
- Key light: one warm radial glow (#FFDC93 at 10 to 14% opacity, `mix-blend-mode: soft-light`) placed top left, where the candle is on the title screen. All card shadows fall down and right to match: `0 18px 30px rgba(0,0,0,.45)` already exists; offset it 6 px right.
- Grain: a 256 px tiled noise PNG at 4% opacity, shifted to a random offset every 80 ms (only 12 fps of grain movement; it reads as film, costs little). Off in reduced motion.
- Paper: a subtle fiber texture and a 1 px deckled edge mask on cards; 2% darker toward edges.
- Wallpaper pattern: drop its opacity by half under the vignette; it currently competes with content in 15 and 17.

---

## Part 5. Motion spec

Tokens (TV and phone):

| Token | Value |
|---|---|
| `--t-tap` | 90 ms |
| `--t-fast` | 150 ms |
| `--t-base` | 240 ms |
| `--t-slow` | 400 ms |
| `--t-dramatic` | 700 ms |
| `--t-hold` | 1500 ms (pre-reveal silence) |
| `--ease-out` | cubic-bezier(0.2, 0.8, 0.2, 1) (keep) |
| `--ease-emph-out` | cubic-bezier(0.05, 0.7, 0.1, 1) (Material 3 emphasized decelerate) |
| `--ease-emph-in` | cubic-bezier(0.3, 0, 0.8, 0.15) (Material 3 emphasized accelerate) |
| `--ease-spring` | cubic-bezier(0.34, 1.56, 0.64, 1) (keep, small overshoot) |
| `--ease-slam` | cubic-bezier(0.7, 0, 0.84, 0) (accelerate into impact) |

Principles: anticipation before every impact (rise before fall), hit-stop of 60 to 80 ms on contact, settle with a small overshoot, one thing moves at a time during reveals, and nothing moves while someone is talking except the speaker. Reduced motion: replace all transforms with 150 ms opacity fades, no shake, no grain, keep timing holds.

| Moment | Motion (ms, easing) | Sound cue (see Part 6) |
|---|---|---|
| Focus move (TV) | Scale 1.00 to 1.06 and lift 6 px, 150, emph-out; focus ring fades in 90 | soft paper tick |
| Button press (OK) | Scale 0.96 for 90, back to 1.06 with spring 240 | wooden click |
| Screen change | Old screen darkens 200 ease-in; new slides 24 px and fades in 400 emph-out, 80 overlap | page turn |
| Player joins (lobby) | Calling card dealt from below: 320 emph-out with rotation from -8 deg to a random -2 to 2 deg, 60 hit-stop, settle 120 spring; pin drops 180 | card deal, pin |
| Role reveal (phone) | Hold-to-open wax seal: 600 hold with seal cracking in 3 steps; flap opens 280 emph-out; card slides up 420 spring; auto-hides after 8 s | haptic: 3 light ticks then one heavy; no sound by default |
| Question asked | Paper slip with the question slides in from the asker's avatar 260 emph-out, tilts to 1 deg | paper slide |
| Suspect speaking | Portrait breathes, scale 1.000 to 1.015 over 4000, sine; candle overlay flickers 2 to 4% opacity at random 120 to 300 ms intervals | voice; bed ducks |
| Caught in a lie (new) | Portrait swaps to "nervous" variant with a 120 cross-dissolve, 4 px horizontal shake 3 cycles in 240, linked clue card pulses red string | record scratch, string twang |
| New clue arrives | Card flips from back to front: scaleX 1 to 0 in 180 ease-in, 0 to 1 in 180 ease-out, then drop into slot 240 spring | card flip, pin |
| Pin a clue | Lift 120 ease-out (shadow grows), drop 180 ease-slam, 60 hit-stop, settle 120 spring | pin thunk |
| Red string link | String draws along a sagging curve 400 emph-out, 2 px overshoot, then a 1 px vibration damped over 300 | taut string pluck |
| Prove it verdict stamp | Sheet slides up 300 emph-out; stamp rises 200 (scale 1.0 to 1.3, shadow grows) ease-out; slams 120 ease-slam; 80 hit-stop; screen nudges 6 px then settles 200 spring; ink bleeds from 85% to 100% opacity with slight blur 300; explanation fades in 400 after 400 delay | breath in, stamp thunk, paper rustle |
| Round ends | One candle on the round tracker gutters out: flame shrinks 600, smoke wisp 1200; screen dims 10% for 400 | candle snuff, clock chime |
| Accusation locked (phone + TV) | Vote sealed in an envelope: envelope flap closes 240, wax drop 180 spring; TV shows sealed envelope per player popping in 120 apart | wax seal press |
| Proof chain reveal | Each clue card is pulled onto the board one at a time: 500 per card, 250 gap; string links draw 400; each successive card raises the sting pitch one step | rising string notes (Balatro style) |
| Culprit reveal | Lights dim to 35% over 800; full stillness and near silence for 1500; spotlight iris opens on the portrait 600 emph-out; name rises 24 px and fades in 600; motive types on at 30 ms per character; portrait swaps to "caught" expression at name + 400 | heartbeat, silence, low piano + string stab |
| Accomplice unmasked | TV and accomplice phone flip at the same moment (sync within 100 ms); TV shows one sentence typed at 45 ms per character on a near-black screen; hold 2000 | gasp sting |
| Results | Rows enter bottom to top 120 apart, 300 emph-out; score digits roll 1200 ease-out with tabular numerals; rank swaps animate 400; winner crown drops 500 spring with 60 hit-stop | rising ticks per row, final chord |

Timing reference for shake and hit-stop: DESIGN_RESEARCH.md 1.3 and https://blakecrosley.com/guides/design/balatro. Material 3 easing: https://m3.material.io/styles/motion/easing-and-duration/tokens-specs.

---

## Part 6. Sound and music spec

### 6.1 Direction

- **Music**: a chamber string quartet, Knives Out style: dry, close-miked, audible bow scrape, pizzicato and col legno for tension, a little harpsichord or celesta for the "posh house" color, Hungarian minor with bent notes for wit. One main theme (a crooked waltz in 3/4, about 76 BPM **ASSUMPTION**) that every cue quotes.
- **Suspect motifs** (**ASSUMPTION**, Hades-style identity by color, done in sound): each suspect gets one instrument when they speak or are revealed. Colonel = snare and low brass, heiress = celesta, doctor = solo cello, cook = bassoon, nephew = muted trumpet. Two seconds max, under the voice.
- **Foley over synthesis**: replace oscillator SFX with recorded paper, pins, string, wood, wax, rubber stamps, clocks, candles, rain on windows. Sonniss GDC bundles are royalty free for commercial use without attribution, but forbid AI training use (https://gamefromscratch.com/sonniss-27-5gb-sound-effect-giveaway-at-gdc-2024/, https://rekkerd.org/sonniss-releases-gdc-2026-game-audio-bundle/). Freesound CC0 is a second source; check each file's license.
- **Room tone**: a quiet bed of rain, a ticking long-case clock and a crackling fire under everything. This is the "Her Story hum" that makes silence feel like a place.

### 6.2 Loudness and mix targets

| Item | Target |
|---|---|
| TV integrated loudness (whole session) | -24 LUFS integrated, plus or minus 2 LU, true peak no higher than -1 dBTP (Sony ASWG and console consensus: https://audiokinetic.com/en/mastering-a-game-with-wwise-part1, https://www.audiogang.org/wp-content/uploads/2015/04/IESD-Mix-Ref-Levels-v03.02.pdf) |
| Phone audio (role readout, rare stings) | -18 LUFS integrated, plus or minus 2 LU, true peak -1 dBTP (mobile guidance, same Audiokinetic source; note it is less standardized) |
| Dialogue (narrator, suspects) | Anchor: normalize every Polly line to -24 LUFS short-term so voices are consistent. Dialogue is king. |
| Music bed under no dialogue | About -30 LUFS short-term (6 dB under dialogue) **ASSUMPTION** |
| Music bed under dialogue | Duck by 10 dB (current code: bed 0.22 to 0.07, which is about -10 dB, good) |
| Duck timing | Attack 120 ms, release 700 ms (current code: attack time constant 0.12 s, release 0.6 s; keep) |
| UI ticks (focus, nav) | Peaks around -30 dBFS; never louder than the room tone by more than 6 dB |
| Impacts (stamp, pin) | Peaks around -10 dBFS, short |
| Stings (reveal, win) | Peaks around -6 dBFS, still within -1 dBTP |
| Separate sliders | Master, Music, Effects, Voice (Jackbox standard, https://www.jackboxgames.com/new-accessibility-features-in-the-jackbox-party-pack-7/) |

Mastering: put a true-peak limiter at -1 dBTP on the master bus (a `DynamicsCompressorNode` with fast attack is an acceptable stand-in in Web Audio). Measure a full 20 minute playthrough with a LUFS meter (for example `ffmpeg -af ebur128`) from a TV capture.

### 6.3 Cue sheet

| Phase / moment | Bed or cue | Length | Notes |
|---|---|---|---|
| Title | Main theme, full quartet, room tone under | Loop 60 to 90 s | Fade in over 2 s on boot |
| Lobby | Theme as pizzicato, lighter | Loop 60 s | Each join: card deal + a two-note chime in the player's pitch (5 pitches in the theme's scale) |
| Briefing (cold open) | Theme in low strings + clock ticking, stops dead before the body is found | 60 s | Silence 800 ms, then a single sforzando chord on the victim |
| Investigation round 1 | Layer A: cello drone + clock | Loop | Vertical layering: same tempo and key for all three layers so they stack |
| Investigation round 2 | Layer A + B: pizzicato violins | Loop | Crossfade in over 4 s at round start |
| Investigation round 3 | A + B + C: harpsichord ostinato, faster clock | Loop | Tension rises without changing track |
| Suspect answer | Bed ducks 10 dB; suspect motif 1 to 2 s under the first words | Per line | Hold 1100 ms of bed after the line (current director waits 1100 ms, good) |
| Caught in a lie | Record scratch or string glissando down, bed cuts for 600 ms | 0.8 s | This is the clip moment, keep it crisp |
| Prove it stamp | Inhale (200 ms), stamp thunk + paper, then verdict sting: PROVEN = major chord on strings, POSSIBLE = suspended chord left unresolved, RULED OUT = low pizzicato "wrong" figure | 1.5 s | Narrator reads verdict after a 400 ms break |
| Round end | Candle snuff + clock chime (count of round) | 2 s | |
| Accusation | All music stops; heartbeat at 60 BPM plus room tone | Until all votes in | Each sealed vote: wax press |
| Proof chain | Rising string notes, one step per card | 4 to 8 s | Balatro escalation |
| Culprit reveal | 1.5 s near silence (room tone only, rain), then low piano note + string stab on the name, then theme in minor | 6 s | Narrator line uses `<break time="1500ms"/>` |
| Accomplice unmask | Gasp sting (string tremolo + cymbal swell, cut) | 2 s | Phone vibrates, no phone audio |
| Results | Theme reprise in major if detectives win, sly minor waltz if culprit escapes; rising tick per row, crown chord | 30 s loop | |

### 6.4 Phone audio and haptics

The phone is a secret-keeper. **No sound by default** on role, lies, or clues. Use the Vibration API (Android) and visual pulses (iOS Safari lacks vibration):
- Your turn to ask: two short pulses (60 ms, 80 ms gap, 60 ms).
- Role card opened: three light ticks then one 120 ms pulse.
- Accomplice unmasked (on the accomplice's phone): one long 400 ms buzz in sync with the TV.
- "Read it to me" stays opt-in and at -18 LUFS, with a hint to hold the phone to the ear.

---

## Part 7. Top 10 premium-feel upgrades (biggest visual ROI first)

1. **Lighting pass on every TV screen** (vignette, warm key light, film grain, half-strength wallpaper). The title screen already proves it works; screens 08, 09, 15 and 17 lack it. Effort: CSS only, 1 day.
2. **Replace synthesized SFX with recorded foley and add the string quartet theme.** Sound is half of "premium" and currently the weakest layer. Effort: 2 to 3 days to source and mix from Sonniss/CC0 plus a licensed or commissioned theme.
3. **Rebuild the verdict stamp as a real ink stamp**: blue/graphite/vermilion inks, distinct stamp shapes, ink texture mask with uneven edges, 1 to 2 deg misregistration, anticipation + slam + hit-stop, verdict-specific sting.
4. **Choreograph the culprit reveal**: 1.5 s dark hold, spotlight iris, name rise, "caught" portrait expression, motive typed on, and use the empty lower 40% of 15 for the proof chain recap. Add the accomplice unmask as a separate beat with TV and phone in sync.
5. **Typography cleanup**: Playfair + Inter on phone too, Playfair only at 36 px+ on TV, Inter captions, single-line suspect names (first and last name only, role below), Caveat demoted to marginalia, tabular numerals.
6. **Card physicality**: consistent light direction, deckled edges, paper fiber, random rotation within plus or minus 1.5 deg, pin shadows, and fix the overlapping cards in 08. Cards should never overlap unless dragged.
7. **Captions that read ahead**: unread words at 70% cream (8.21:1), current word underlined in gold, 2 lines max, Inter 44 px.
8. **Living portraits**: breathing idle, candle flicker overlay, and at least three expressions per suspect (neutral, nervous, caught) swapped on game events. Let the speaking portrait break its frame (Hades).
9. **Physical transitions**: case file opens, page turns, candles snuff at round end, envelope seals for votes. Replace fades between phases with these.
10. **Results as an awards show**: before the ledger, three superlatives one at a time (Sharpest Eye, Best Liar, Wildest Theory), each with a sting and a pause, then the ledger with rolling numbers and the crown drop.

---

## Part 8. Three shareable moments to engineer

Design rule for all three: one sentence a phone camera can read from across a room in under 2 seconds, held on screen for at least 2 seconds, on a near-empty background, with a sound people react to out loud. That is the Among Us ejection formula.

### 1. "Theo was the Accomplice."
- What: after the culprit, the TV cuts to black, a single portrait of the accomplice player's avatar, and the line types out letter by letter: "Theo was the Accomplice." Beat. Then the second line: "He lied to you 3 times." At the same moment the accomplice's phone flashes its role card and buzzes.
- Why it spreads: the betrayal is between real friends in the room; the reaction shot of the accomplice is the content. The text is a ready-made meme template like "X was not The Impostor".
- Build: 45 ms per character typing, 2000 ms hold, gasp sting, TV and phone sync within 100 ms, a "Nobody was the Accomplice" variant for honest games.

### 2. "Caught in a lie"
- What: when a suspect's answer contradicts a pinned clue, the game calls it live: record scratch, music cuts, the suspect's portrait snaps to a sweating "caught" expression, the red string between the clue and the suspect pulls taut and glows, and the narrator says "Interesting. That is not what the dance card says."
- Why it spreads: it happens several times per game, it is 5 seconds long, and the AI suspect squirming is funny on its own. It is the Jackbox host roast moment for our genre.
- Build: server flags contradiction; TV plays the 0.8 s cue and 240 ms shake; caption shows the contradicting clue title in vermilion on paper. Rate-limit to once per suspect per round so it stays special.

### 3. The case file poster
- What: at the end, the TV composes a 9:16 "case closed" poster: case title in Playfair, culprit portrait behind bars, a big PROVEN or RULED OUT stamp, the accomplice's name, the night's best question quoted in a typed label ("Ana asked: Did you bring your medical bag tonight?"), and the date. A QR code lets anyone save it to their phone.
- Why it spreads: it is a finished, beautiful artifact that needs no context, sized for Stories and TikTok, and it carries the game's name. Wolf Among Us and Obra Dinn are remembered by their screenshots; this hands players the screenshot.
- Build: render on the server or in a hidden canvas at 1080x1920; reuse portrait art and stamp assets; phones fetch it from the existing session.

---

## Source list

Mystery and detective
- https://blog.playstation.com/archive/2019/10/17/lucas-pope-on-return-of-the-obra-dinns-art-style
- https://www.gamedeveloper.com/design/lucas-pope-and-the-rise-of-the-1-bit-dither-punk-aesthetic
- https://www.pcworld.com/article/3314936/gaming/return-of-the-obra-dinn-review.html
- https://www.rpgfan.com/review/return-of-the-obra-dinn-2
- https://production.thetech.com/2018/11/19/return-of-the-obra-dinn-video-game-review
- https://www.theongaku.com/posts/return-of-the-obra-dinn-soundtrack
- https://madegooddesigns.com/disco-elysium-font/
- https://www.mcvuk.com/business-news/we-knew-immediately-that-we-needed-to-make-a-game-with-a-striking-and-unique-look-to-accompany-the-writing-a-look-that-would-balance-the-mundane-with-the-unfamiliar-and-strange-the-art
- https://gdconf.com/news/come-gdc-and-see-how-disco-elysiums-unique-style-was-achieved-0
- https://www.itechguides.com/how-disco-elysiums-thought-cabinet-and-skill-checks-work/
- https://en.wikipedia.org/wiki/The_Case_of_the_Golden_Idol
- https://www.fold.lv/en/?p=109290
- https://blogs.tuni.fi/playlab/game-reviews/the-case-of-the-golden-idol-pixelated-dioramas-of-crime-and-mystery/
- https://en.wikipedia.org/wiki/Her_Story_(video_game)
- https://www.pocketgamer.biz/feature/62104/making-of-her-story/
- https://colepowered.com/?p=33958
- https://steamcommunity.com/app/986130/discussions/0/3764482197529142937
- https://gamedeveloper.com/design/road-to-the-igf-lucas-pope-s-i-papers-please-i-
- https://www.thumbsticks.com/magic-myst-pokemon-inspire-inscryption/
- https://www.gamedeveloper.com/design/how-game-jam-sacrifices-became-inscryption
- https://www.grimdarkmagazine.com/review-the-wolf-among-us/
- https://siliconera.com/?p=346024
- https://www.whats-on-netflix.com/news/netflix-games/netflix-releases-its-knives-out-tie-in-game-just-in-time-for-christmas
- https://help.netflix.com/en/node/490369999827556
- https://en.wikipedia.org/wiki/Knives_Out_(soundtrack)
- https://fortune.com/2019/11/20/knives-out-interview-rian-johnson-director-nathan-johnson-composer-original-score
- https://interviewmagazine.com/film/rian-nathan-johnson-knives-out

Party and TV
- https://www.jackboxgames.com/making-the-jackbox-party-pack-3
- https://www.jackboxgames.com/blog/trivia-murder-party-3-dev-diary-5
- https://www.jackboxgames.com/blog/trivia-murder-party-3-dev-diary-3
- https://www.jackboxgames.com/new-accessibility-features-in-the-jackbox-party-pack-7/
- https://www.jackboxgames.com/blog/accessibility-features-in-the-jackbox-party-pack-10
- https://caniplaythat.com/2022/04/20/jackbox-party-pack-9-will-have-a-game-with-a-no-drawing-option-for-accessibility/
- https://legionm.com/shareholder-updates/jackbox-games-on-twitch
- https://among-us.fandom.com/wiki/Ejection
- https://knowyourmeme.com/memes/there-is-1-impostor-among-us--2
- https://en.wikipedia.org/wiki/Among_Us
- https://www.weekend.com/post/games-to-play-on-tv-with-friends
- https://www.fintechfutures.com/press-releases/volley-launches-on-amazon-fire-tv-with-jeopardy-
- https://blakecrosley.com/guides/design/balatro (third-party analysis, not developer confirmed)
- https://managore.itch.io/m6x11
- https://nattogames.itch.io/m6x11cyrillic
- https://amara.org/subtitles/qZaMrU6iDy4J/en/2/download/Balatros%20Cursed%20Design%20Problem.en.srt
- https://www.malaymail.com/amp/news/tech-gadgets/2024/12/22/whos-behind-balatro-secretive-game-dev-localthunk-codes-cult-poker-hit-in-canadian-prairie-province/160729
- https://madegooddesigns.com/hades-font/
- https://criticalvideogamestudies.com/?p=472

Fonts, audio, standards
- https://github.com/google/fonts/tree/main/ofl/playfairdisplay
- https://github.com/google/fonts/tree/main/ofl/inter
- https://github.com/google/fonts/tree/main/ofl/fraunces
- https://github.com/google/fonts/tree/main/ofl/caveat
- https://github.com/google/fonts/tree/main/apache/specialelite
- https://audiokinetic.com/en/mastering-a-game-with-wwise-part1
- https://www.audiogang.org/wp-content/uploads/2015/04/IESD-Mix-Ref-Levels-v03.02.pdf
- https://designingsound.org/2012/07/30/video-games-and-loudness-standards-interview-with-sonys-garry-taylor/
- https://gamefromscratch.com/sonniss-27-5gb-sound-effect-giveaway-at-gdc-2024/
- https://rekkerd.org/sonniss-releases-gdc-2026-game-audio-bundle/
- https://m3.material.io/styles/motion/easing-and-duration/tokens-specs
- https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
