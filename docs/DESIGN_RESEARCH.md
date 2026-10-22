# Accomplice: design research brief

Date: 23 Oct 2026. Scope: Fire TV (Vega OS) stage, phone controllers, Alexa+ Echo Show add-on.
Method: web research on the sources linked below, then a review of the current screenshots in `apps/tv-web/screenshots`, `apps/phone/screenshots` and `apps/echo-sim/screenshots/out`, plus the live CSS tokens in `apps/tv-web/src/styles/base.css`, `apps/phone/src/styles.css` and `apps/echo-sim/src/styles.css`.

Every recommendation carries a source URL. Anything marked **ASSUMPTION** is my judgment and has no direct source. Contrast ratios below were computed with the WCAG 2.x relative luminance formula (https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio).

---

## Part 1. What the research says

### 1.1 Ten-foot TV UI

**Amazon Fire TV design guidelines** (https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html)
- Keep all UI out of the outer 5% of every edge. Focused items and text live in the inner 90%. At 1920x1080 that is 96 px left and right, 54 px top and bottom.
- Design at 1080p (1920x1080, xhdpi, 960x540 dp).
- Body text at least 14 sp, which Amazon equates to about 28 px at 1080p.
- Use fewer elements, large and well spaced. Keep text short, use more line spacing than on desktop.
- Prefer less saturated color. Amazon says cool colors (blue, purple, gray) work better on TV than warm ones (red, orange).
- Always show which element has focus, and flash a selected state when Select is pressed. Every actionable element must be reachable by D-pad.

**Vega OS specifics**
- Vega uses Cartesian focus by default (D-pad moves to the nearest item in that direction) unless you override it; `TVFocusGuideView` and the `focusable` prop change behavior (https://developer.amazon.com/docs/vega/0.24/focus-management.html, https://developer.amazon.com/docs/vega/0.21/focus-management.html).
- Vega assistive tech: VoiceView screen reader, Screen Magnifier, and Text Banner, which shows the focused element's text in a high-contrast box at the bottom of the screen (https://developer.amazon.com/docs/react-native-vega/0.83/accessibility.html). So every focusable element needs a real text label.

**Amazon "Living-room experience and accessibility" blueprint** (https://developer.amazon.com/apps-and-games/blogs/2026/07/blueprint-series-pt5-accessibility). Note: I could not find a dev.to cross-post; this Amazon Developer blog post is the canonical one.
- Every core journey must work with the remote alone, and with VoiceView alone. Labels state purpose ("Open the case"), not type ("button").
- Each screen opens on its most useful element. Focus stays put when content refreshes. When a modal closes, focus returns to where it was.
- When an Alexa overlay appears, pause, hold focus and resume cleanly (onPause/onResume).
- Captions must be available and respect system caption size and style.
- Keep key content inside safe areas. Test on a real TV at couch distance in bright and dim rooms.
- Keep motion purposeful, no auto-scrolling, respect reduced motion.
- Treat accessibility bugs with the same severity as crashes.

**Android TV and tvOS cross-checks**
- Android TV layout: 5% overscan margin, 48 dp sides and 27 dp top/bottom on a 960x540 dp canvas (equals 96 px and 54 px at 1080p); leave room for focused items to grow so they do not overlap neighbors (https://developer.android.com/design/ui/tv/guides/styles/layouts).
- Android TV typography: sans-serif for body and labels, no decorative fonts for body text; expressive fonts are fine for display and headline sizes (https://developer.android.com/design/ui/tv/guides/styles/typography).
- Apple tvOS: about 60 pt top/bottom and 80 pt side insets, as summarized by Smashing Magazine (https://smashingmagazine.com/2025/09/designing-tv-principles-patterns-practical-guidance/; Apple's own page: https://developer.apple.com/design/human-interface-guidelines/designing-for-tvos). I could not read Apple's page directly, so treat exact pt values as secondhand.

**Minimum text size at 1080p**
- Fire TV: 28 px body (link above).
- Xbox XAG 101: 26 px minimum on console at 1080p, text must scale to 200%, line spacing at least 1.5x, lines at most 80 characters, offer sentence case instead of ALL CAPS except for one or two word labels (https://devdocs.xbox.com/build/game-principles/accessibility/xag-deep-dives/xag-101-text-display.md).
- Smashing: start TV body text at 24 px and "when in doubt, go larger" (link above).
- Working rule for Accomplice: **28 px body floor, 24 px absolute floor for one or two word uppercase labels** (ASSUMPTION for the 24 px label exception, based on XAG 101's case exemption).

**TV color**
- Avoid pure white #FFFFFF: it is maximum luminance and tiring in a dark room; use warm off-whites (https://smashingmagazine.com/2025/09/designing-tv-principles-patterns-practical-guidance/). Older broadcast advice suggests around RGB 240 or #EBEBEB for text (https://www.elasticspace.com/2004/03/design-for-television).
- Saturated reds and yellows bleed and smear on TVs, and thin lines "vibrate" (https://sepwww.stanford.edu/sep/jon/family/jos/webtv/developer3/design/satcolor/satcolor.htm, https://www.elasticspace.com/2004/03/design-for-television). A subtle dark drop shadow stops bleed on text over red.
- Video legal range is 16 to 235 for luma; many TVs and HDMI paths still treat the signal as limited range, so near-black detail below about RGB 16 can crush to flat black and fine detail above 235 can clip (https://avisynthplus.readthedocs.io/en/latest/avisynthdoc/corefilters/limiter.html). Practical rule: keep meaningful dark detail above RGB 16 and do not rely on differences between, for example, #0D0913 and #110916 (ASSUMPTION for the UI application).
- Contrast: WCAG 1.4.3 asks 4.5:1 for normal text, 3:1 for large text (https://www.w3.org/TR/WCAG22/#contrast-minimum). TV viewing at 3 m in a lit room loses contrast, so aim for 7:1 for body text on TV (ASSUMPTION, matching WCAG AAA 1.4.6).

### 1.2 Party game UX that wins

**Jackbox** (https://builtin.com/media-gaming/jackbox-games-design-party-pack)
- Join by room code in a web page, no app install.
- One task at a time on the phone: pick, type, or draw. Never several choices at once.
- Always make clear what to do next and when the game is waiting on someone.
- A live-host narrator ("Interactive Conversation Interface") walks players through each step. Borrow TV conventions: timing, transitions, dialogue.
- The real goal is laughter, not winning. Test with a relative who never plays games.
- Phones let each player see private info, which is what made the hidden-role game Push the Button possible.
- Audience: players beyond the cap join as audience and vote, up to 10,000 (https://www.nintendo.com/store/products/the-jackbox-party-pack-10-switch/, https://gamesdb.launchbox-app.com/games/details/139796-quiplash). Hosts can hide the room code on stream (https://jackboxgames.com/the-jackbox-party-pack-5-streamers-guide/).
- Push the Button: aliens get a slightly different prompt; later rounds let aliens "hack" a human's phone with the alien prompt; ejecting needs unanimous agreement; pressing the button pauses the global timer (https://techraptor.net/content/push-the-button-jackbox-fall-2019, https://www.pcgames.de/The-Jackbox-Party-Pack-6-Spiel-72295/Tests/party-smartphone-handy-tablet-halloween-1335082/). Reviewers found it too easy with only 4 players (https://www.jumpdashroll.com/article/the-jackbox-party-pack-6-review).

**Netflix "Dead Man's Party: A Knives Out Game"** (by The Game Band): a TV social deduction game with the phone as controller, 4 to 8 players, sessions just over 10 minutes (https://www.whats-on-netflix.com/news/netflix-games/netflix-releases-its-knives-out-tie-in-game-just-in-time-for-christmas, https://help.netflix.com/nb/node/490369999827556).

**Volley / Weekend (voice TV games)**: start with a behavior people already do and a familiar format so there is almost nothing to teach; voice works best when the room is together and the rules fit a conversation (https://yespress.io/volley). Volley rescued a failed game by simplifying interactions and leaning on story (https://developer.amazon.com/en-US/blogs/alexa/alexa-skills-kit/2020/05/8-things-we-learned-from-alexa-games-week). Their Fire TV Jeopardy! is played by voice through the Alexa Voice Remote (https://www.volleygames.com/post/volley-launches-on-amazon-fire-tv-with-jeopardy).

**Hidden-role design**
- Blood on the Clocktower: dead players stay in. They keep talking, and keep one "ghost vote", which often decides the end game. Designer Steven Medway: "I like people being involved right up until the end." (https://mechanicsofmagic.com/2024/04/09/critical-play-blood-on-the-clocktower/, https://www.smartcompany.com.au/?p=341421, https://en.wikipedia.org/wiki/Blood_on_the_Clocktower)
- Among Us: default meeting is 15 s discussion then 120 s to vote (community protocol docs, https://github.com/roobscoob/among-us-protocol/blob/master/07_miscellaneous/01_the_structure_of_the_gameoptionsdata_object.md). Guides recommend 15 to 30 s discussion with voice chat, and pairing short discussion with short voting (https://gamewith.net/among-us-wiki/article/show/22148). Dead crewmates still finish tasks that count toward the win.
- Secret Hitler: the bad team knows each other and gets a "leg up" to offset the accusations they face; hidden information (discarded policies) creates forced, deniable lies (https://secrethitler.io/rules). Its covert eyes-closed reveal is a barrier for visually impaired players (https://www.meeplelikeus.co.uk/secret-hitler-2016-accessibility-teardown/).
- One Night Ultimate Werewolf: the app narrates the night so no human has to; a timed day phase keeps it brisk; whole game about 15 minutes. Weakness: after the timer, players are unsure what to do next (https://www.theboardgamefamily.com/2014/05/one-night-ultimate-werewolf-game-review/, https://mechanicsofmagic.com/2022/04/07/one-night-ultimate-werewolf-critical-play-tristan-wang/).

**Murder mystery kits**: three acts (discover the crime, question and gather clues, accuse and reveal), typically three rounds of 25 to 30 minutes. Good host guides script when each clue drops and plan an "emergency" call or dramatic entrance (https://www.broadwaymurdermysteries.com/blogs/news/guide-to-hosting-a-murder-mystery-party-at-home, https://www.nightofmystery.com/?p=389499).

**Satisfying reveals (fair play)**: every clue needed must be shown before the reveal; the best clues sit in plain sight and readers should be able to flip back and find them; reveals fail when evidence first appears in the reveal scene (https://parkerpeevyhouse.substack.com/p/7-rules-for-satisfying-murder-mysteries, https://www.denofgeek.com/movies/glass-onion-whodunit-mysteries-need-play-fair-with-audience, https://strandmag.com/cluefinders/). Ellery Queen's "challenge to the reader" (announce that you now have enough to solve it) is a classic tension beat.

**Session length and onboarding**
- Reference points: Dead Man's Party ~10 min, ONUW ~15 min, paper kits 75 to 150 min (links above).
- Target for Accomplice: 20 to 25 minutes per case, cold open plus rules under 60 s (ASSUMPTION, sits between the TV party games and the paper kits).

### 1.3 Game feel and juice on TV

- "Juice it or lose it" (Jonasson and Purho, GDC 2012): flash, shake, floating text, sound and particles turn a dull game fun; treat juice like seasoning, too much becomes noise (https://eastondev.com/blog/en/posts/dev/20260521-game-feedback-feel/, https://www.wayline.io/learn/game-feel/1).
- Hit-stop of 50 to 100 ms makes an impact feel heavy; hit-stop, sound coherence and camera control are cited as the top three drivers of impact feel (same links; the IEEE study is cited secondhand). Keep screen shake small.
- Motion tokens from Material 3: short 50 to 200 ms, medium 250 to 400 ms, long up to 600 ms; emphasized decelerate `cubic-bezier(0.05, 0.7, 0.1, 1)`, emphasized accelerate `cubic-bezier(0.3, 0, 0.8, 0.15)` (https://m3.material.io/styles/motion/easing-and-duration/tokens-specs; values cross-checked in https://flutter.googlesource.com/mirrors/flutter/+/HEAD/dev/tools/gen_defaults/lib/motion_template.dart).
- Comic timing: a 2026 CogSci paper models humor as steady rhythm broken by a longer pause before the punchline (illustrated as 0.6 s setup pauses and 1.5 s before the punch) and finds timing predicts laughs better than content (https://yzhu.io/publication/humor2026cogsci/). Stand-up research found one comic's key pause around 2.4 s, varying night to night (https://scienceblog.com/the-science-of-the-pause-computational-mapping-reveals-the-hidden-engineering-behind-stand-up-comedy/). Counterpoint: a 2011 study found no consistent pre-punchline pause (https://www.degruyterbrill.com/document/doi/10.1515/HUMR.2011.015/pdf). So: use pauses deliberately, tune by playtest.
- Amazon Polly tools for timing: `<break>` works on neural and generative voices; `<prosody>` is partial; `<emphasis>`, whisper and soft phonation are **not available** on neural voices and throw errors (https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html). Speech marks give per-word timing in ms for karaoke captions, fetched in a separate request per voice (https://docs.aws.amazon.com/polly/latest/dg/output.html).

### 1.4 Accessibility for blind, low-vision and mixed-ability play

Game Accessibility Guidelines (https://gameaccessibilityguidelines.com/full-list/), most relevant items:
- Basic: high contrast text; readable default font size; no essential info by color alone; large, well spaced touch controls; subtitles for all important speech, presented clearly; no essential info by sound alone; separate volume for effects, speech, music; simple clear language; progress through text at own pace.
- Intermediate: screen reader support on mobile; visual indication of who is speaking; subtitles on before any sound plays; avoid requiring held buttons; support more than one input device; text as well as voice.
- Advanced: replay all narration and instructions; do not make precise timing essential.

Xbox Accessibility Guidelines:
- XAG 104 subtitles: max 40 characters per line, max 2 lines (3 in exceptional cases), speaker name when the speaker changes, color only as a supplement to the name, solid background with adjustable opacity, mixed case, bottom placement (https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/104).
- XAG 106 screen narration: all on-screen info needed to start, configure or finish the game must be available as audio (https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/106).
- XAG 116 time limits: let players set limits up to 10x the default ahead of time; warn at least 20 s before expiry with a one-press extend, extendable 10 times (https://devdocs.xbox.com/build/game-principles/accessibility/xag-deep-dives/xag-116-time-limits).

AbleGamers APX: 22 design patterns in "Access" and "Challenge" groups; "Second Channel" means every piece of information the player relies on is available on more than one sense (https://accessible.games/apx, https://www.york.ac.uk/computer-science/about/news/2023/accessible-player-experience/).

Mobile: WCAG 2.2 target size AA is 24x24 CSS px, AAA is 44x44 (https://www.w3.org/TR/WCAG22/#target-size-minimum); Apple suggests 44x44 pt and Android 48x48 dp (summarized at https://dequeuniversity.com/rules/attest-ios/1.0/touch-target-size).

Audio description in games is still rare; the field converts visuals into audio or haptics, and audio-only games are fully accessible to blind players (https://webs.uab.cat/arsad/wp-content/uploads/sites/251/2023/04/Xiaochun_ARSAD2023.pdf, https://repozytorium.uw.edu.pl/entities/publication/c74a542c-7a55-41bd-aad8-c04134b06c24). Accomplice already speaks every suspect line out loud, which is a head start.

### 1.5 Alexa+ MCP add-on design guide

Overview (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-design-guide-overview.html)
- Four principles: finish the task inside the conversation; glanceable ("one title, one or two supporting fields, one clear action"); far-field text with the 1.6 scale and copy readable in under a second; match Alexa's design language and use brand only for accents, badges and primary actions.

Visual foundations (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-visual-foundations.html)
- Base canvas 768x480, one root scale. Echo Show 8 and 15 (1280x800) use 1.667.
- Type tokens at base (Echo Show 8/15 value): Display1 48 (80), Display2 40 (67), Display3 32 (53), Display4 28 (47), Display5 24 (40), Headline1 20 (33), Headline2 18 (30), Body1 16 (27), Body2 14 (23), Body3 12 (20), Label1 10 (17), Label2 8 (13).
- Spacing 2, 6, 8, 12, 16, 20, 24. Radius 4, 8, 12, 16, 9999.
- Dark card #14181E, inner #1B2028; dark primary button #2D415E, secondary #232F40.
- Brand: primary brand color for key actions, links, selected states; muted secondary colors for text and containers; **no bold brand colors or gradients as large fields or backgrounds**. Support light and dark modes.
- Readable at about 3 feet, essential info at about 10 feet. Must survive Color Correction and Color Inversion.

Display modes (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-display-modes.html): Inline (default), Fullscreen (games, dense views; you supply the expand control; do not switch modes on the user unless needed), Hydrated (data only), Voice-only (always on; tool data must make sense without visuals and contain no formatting artifacts like pipes).

Conversation surface (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-conversation-surface.html): turn based; you shape Alexa's speech through returned data, not scripts; each tool response stands alone; resume after interruptions.

Layout (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-layout-and-rendering.html): Block viewport (wider than tall, horizontal scroll) is recommended for Alexa devices; read `hostContext` (`deviceClass`, `safeAreaInsets`, `theme`, `displayMode`) once at render, re-resolve on `host-context-changed`.

Brand expression (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-brand-expression.html): horizontal logo 80 px tall (dark and light), square icon 120x120 (dark and light, with and without background); logo top-left inline, top-center fullscreen.

Accessibility (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-accessibility.html): touch targets at least 48x48 px; contrast 4.5:1 for text 17 px and under, 3:1 for bold or 18 px and up; no more than 3 flashes per second; alt text 125 characters or fewer; voice-only and touch-only parity.

Components (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-components-and-patterns.html): carousels of 3 to 5 items inline, first item within 500 ms, strongest result first; cards have one entity plus optional actions.

---

## Part 2. Critique of the current build

What already works, and should be kept:
- Strong, coherent world: gouache portraits, paper clues, brass, red string. The title, briefing and reveal read as a "show", which is what Jackbox and Volley aim for.
- Warm off-white text (#F7EEDB on #110916, 16.9:1) instead of pure white. Matches TV color guidance.
- Plum and ink base is in the cool family Amazon recommends.
- Bottom button legend (Move / OK Choose / Back) on every TV screen.
- Captions for every spoken line on TV and phone, speaker names shown, "Hear it again".
- Phone has typed fallback, "Let go or tap to finish" (so hold is not required), live regions (`announce.tsx`), and a reduced-motion path on both apps.
- Prove it verdicts and the proof-chain reveal directly serve fair play.

Problems found (screenshot or file references in brackets):

1. **Safe zone breaches on TV.** The button legend sits about 1035 px down a 1080 px screen and the DEMO pill is 22 px from the left edge and 30 px from the bottom (`base.css` `.demo-pill`). Both are inside the outer 5%. [all TV shots]
2. **Text below the 28 px floor on TV.** `base.css` and `screens.css` use 16, 18, 20 and 22 px for clue kind labels, seat tag, plan legend, suspect role in the strip, nameplates and tags. [08, 09, 02]
3. **Layout collisions.** The "An empty vial" card overlaps "Muddy boot prints" on the evidence board [08]. The SPEAKING badge covers Felix Amari's name in the strip [09]. Lobby toasts cover Ana's guest card [02].
4. **Karaoke captions dim unspoken words to about 25 to 35% cream**, which is about 2.1:1 to 2.9:1 on #1A0F22, below even large-text AA. Deaf players cannot read ahead. The doctor's reply runs to 3 lines at about 50 characters. [09, 04]
5. **Suspect strip names wrap to three lines** ("Colonel / Rupert / Ashby") and compete with the role line. [08, 09]
6. **Decorative script carries important info.** Caveat is used for the verdict explanation, the victim discovery line and the culprit motive [12, 04, 15]. Android TV says not to use decorative fonts for body text.
7. **Saturated red.** `--red: #C0262F` (HSL saturation 0.67) is used for string, ACCOMPLICE tag, crime markers and "2 NEW". On ink it is only 3.1:1, and saturated red blooms on TVs.
8. **Placeholder victim art.** The flat black and white silhouette in [04] is out of style with every other gouache portrait.
9. **Demo data mismatch.** Phone shows "The Last Toast at Ashby Hall" with Dorothy Finch and Dr Orme [03, 05, 06], TV shows "The Last Move at Ashby Hall" with Felix Amari [08, 09]. A judge will notice.
10. **Role privacy.** In [05] the full Accomplice card ("You are covering for Dorothy Finch") is open in large type under the envelope. If a player taps to open and forgets, the phone on the coffee table gives the game away. There is no audio or haptic path for a blind player to learn their role privately.
11. **Phone and TV use different display serifs** (Playfair Display on TV, Iowan Old Style on phone). The brand reads as two products.
12. **Phone status gets clipped.** "1 question left" is cut off at the top of [06, 07] once the page scrolls.
13. **Echo Show sim fights the Alexa design system.** Full-bleed plum gradient background, 13 px labels in a 1280x720 frame (`echo-sim/src/styles.css` `.label`), initials "AP" instead of the portrait, pure #FFFFFF caption text, no logo placement, and the frame is 1280x720 while Echo Show 8/15 is 1280x800. [echo 03, 05]
14. **No audience or post-question engagement.** Once a player spends their 2 questions in a round, the phone has nothing to do but read clues. Players beyond 6 cannot join at all.

---

## Part 3. Prioritized changes

P0 = fix before demo or judging. P1 = high impact, next. P2 = polish.

### TV (Fire TV / Vega)

**P0**

| # | Change | Why (source) | Exact values |
|---|---|---|---|
| T1 | Put a safe-area frame on the root and move the button legend and DEMO pill inside it. | Fire TV 5% rule (https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html) | `--safe-x: 96px; --safe-y: 54px;` Legend `bottom: 54px; right: 96px`. DEMO pill `left: 96px; bottom: 54px`. Backgrounds and art may bleed to the edge. |
| T2 | Raise the text floor. | Fire TV 28 px body, XAG 101 26 px (links in 1.1) | Body and any sentence: min 28 px. One or two word uppercase labels: min 24 px with letter-spacing 0.08em. Change `.clue-kind` 20 to 24, `.seat-tag` 20 to 24, `.plan-legend` 22 to 28, `.strip-role` 22 to 28, `.spot-nameplate span` 20 to 24, `.tag` 20 to 24, `.demo-pill` 18 to 24, badge at `base.css:139` 16 to 24. |
| T3 | Fix collisions. Reserve growth room for focused cards, give toasts their own lane, move the SPEAKING badge off the name. | Android TV layouts: account for focused size increase (https://developer.android.com/design/ui/tv/guides/styles/layouts) | Board grid gap at least 10% of card width (focused scale is 1.1). Toasts in a column at `top: 54px; right: 96px`, max 2 visible, 4000 ms each, never over content. SPEAKING badge: anchor to the portrait's top edge (`top: -14px; left: 12px`) instead of over text. |
| T4 | Caption legibility: never dim unread words below 4.5:1. Mark the current word with an underline instead. Chunk to 2 lines. | XAG 104 (https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/104), WCAG 1.4.3 | Spoken words #F7EEDB, unspoken words #9F9591 (6.3:1 on #1A0F22), current word #F4C76C with 3 px underline. Max 2 lines, about 40 to 45 characters per line at 46 px; page the rest. Drive from Polly word speech marks (https://docs.aws.amazon.com/polly/latest/dg/output.html). |
| T5 | Make demo data consistent across TV, phone and Echo. | Credibility; fair play needs one case everywhere (ASSUMPTION) | One demo seed, one title, one suspect list for all three screenshot sets. |

**P1**

| # | Change | Why (source) | Exact values |
|---|---|---|---|
| T6 | Short names in the suspect strip, full name on the spotlight. | Fire TV: keep text short | Strip shows "Rupert", "Clementine", "Dr Amari", "Mrs Pemberton", "Toby" on 1 line at 32 px, role on line 2 at 28 px italic. |
| T7 | Script font only for one line of flavor, never for facts. | Android TV typography (https://developer.android.com/design/ui/tv/guides/styles/typography) | Verdict explanation, victim discovery line and motive in the body face (Inter 30 px, line-height 1.4). Keep Caveat for signatures, "Pinned" and "Evidence" labels, at 32 px minimum. |
| T8 | Desaturate the reds and add a shadow under red text and string. | Saturated red bleed (https://sepwww.stanford.edu/sep/jon/family/jos/webtv/developer3/design/satcolor/satcolor.htm); Fire TV prefers cooler colors | `--red: #A8323A` (sat 0.54) for string and tag fills, cream text on it is 5.7:1. Red text on dark: `#E07A74` (6.4:1 on #1A0F22). String: 4 px wide minimum with `drop-shadow(0 1px 1px rgba(0,0,0,.6))` so it does not shimmer. |
| T9 | Focus state recipe, everywhere. | Fire TV focus guidance; blueprint high-contrast focus | Focus ring 4 px #FFD86B plus 6 px outer glow rgba(255,216,107,.35), scale 1.06, 150 ms emphasized decelerate. Select press: scale 0.97 for 80 ms then back. |
| T10 | Replace the victim silhouette with a painted portrait in the same gouache style (mourning frame, veiled or turned away so no gore). | Visual consistency (ASSUMPTION) | 1:1 crop, same oval frame, desaturated 30% to read as "the late". |
| T11 | VoiceView labels and Text Banner text for every focusable item, and a "Read the board" action. | Vega a11y (https://developer.amazon.com/docs/react-native-vega/0.83/accessibility.html), XAG 106 | Label pattern: "Clue, physical, Muddy boot prints. Size eleven, fresh from the rain... Pinned, 1 string." Long-press OK on the board speaks all pinned clues via the narrator voice. |
| T12 | Reveal shows the moment of the lie. Before "It was Dr Felix Amari", replay the 4 to 6 s audio clip of the suspect's lie with its caption and the player who asked it. | Fair play: clue was in plain sight, flip back and see it (https://parkerpeevyhouse.substack.com/p/7-rules-for-satisfying-murder-mysteries) | Sequence: dim to 40%, play clip, freeze 600 ms, red string draws from the lie to the contradicting clue (400 ms), then stamp. Credit line: "Ana's question cracked it." |
| T13 | Results ledger adds a funny award per player, from real game events. | Jackbox: the goal is laughter (https://builtin.com/media-gaming/jackbox-games-design-party-pack) | Examples: "Most suspicious question", "Believed every word", "Asked the cook about cake 3 times". |

**P2**

| # | Change | Why (source) | Exact values |
|---|---|---|---|
| T14 | Separate sliders for music, voices, effects; music ducks under speech. | GAG basic hearing items (https://gameaccessibilityguidelines.com/full-list/) | Duck music by 12 dB with 150 ms attack and 600 ms release (ASSUMPTION). |
| T15 | Caption options: size 100/150/200%, background opacity 0 to 100%. | XAG 104, XAG 101 200% scaling | Default caption background rgba(17,9,22,.85). |
| T16 | Avoid thin 1 px rules and patterned wallpaper behind text on TV. | Thin lines vibrate on TV (https://www.elasticspace.com/2004/03/design-for-television) | Rules at least 2 px; damask background at max 6% opacity behind text areas. |

### Phone

**P0**

| # | Change | Why (source) | Exact values |
|---|---|---|---|
| P1 | Role card auto-closes, and the reveal is private for everyone. Add a "Hear my role" button that reads the role through the phone speaker or headphones at low volume, plus a distinct haptic. | Covert reveals exclude blind players (https://www.meeplelikeus.co.uk/secret-hitler-2016-accessibility-teardown/); APX Second Channel (https://accessible.games/apx) | Tap-to-open closes after 8 s or on screen blur (ASSUMPTION). Haptic: detective one 40 ms pulse; accomplice two 40 ms pulses 120 ms apart. VoiceOver announcement uses `aria-live="assertive"` only while the card is open. |
| P2 | Sticky status bar so "questions left" never scrolls away. | Jackbox: always show what to do next and who the game waits on (https://builtin.com/media-gaming/jackbox-games-design-party-pack) | 56 px tall sticky header: room code, "1 question left", "My role". |
| P3 | Hold-to-ask button label says both modes before pressing. | GAG: avoid requiring held buttons (https://gameaccessibilityguidelines.com/full-list/) | Copy: "Hold to ask, or tap once to start". Target at least 64 px tall. |

**P1**

| # | Change | Why (source) | Exact values |
|---|---|---|---|
| P4 | Use the same display face as the TV. | One brand across surfaces (ASSUMPTION) | Load Playfair Display 600/800 for display only; keep `system-ui` body for screen reader and Dynamic Type behavior. |
| P5 | Show who is speaking on the phone, not only on TV, and let players read the full answer at their own pace. | GAG: visual indicator of speaker; progress at own pace | "Speaking now" chip on the suspect card plus a 20 px animated bar icon; full transcript stays in "Latest answer" with a "Play again on TV" button. |
| P6 | Timers are adjustable and warn early. | XAG 116 (https://devdocs.xbox.com/build/game-principles/accessibility/xag-deep-dives/xag-116-time-limits) | Host setting "Relaxed timers" (2x, 4x, off). Warn 20 s before any phase ends with a one-tap "Need more time" that adds 30 s, max 3 per round so it cannot stall the room (ASSUMPTION for the cap). |
| P7 | Give players with no questions left something to do: a "Hunch" vote after every answer ("Lying / Telling the truth"), shown as a tally on TV during the reveal. | BotC ghost vote keeps everyone in (https://mechanicsofmagic.com/2024/04/09/critical-play-blood-on-the-clocktower/); Jackbox audience vote | Two large buttons, 50% width each, 72 px tall. Score +25 per correct hunch (ASSUMPTION). |

**P2**

| # | Change | Why (source) | Exact values |
|---|---|---|---|
| P8 | Accuse screen as three short steps with a progress dot row, rather than one long scroll. | Jackbox one task at a time | Step 1 who, step 2 with what, step 3 accomplice; "Back" always visible. |
| P9 | Touch targets audit. | WCAG 2.5.8 and Alexa 48 px (https://www.w3.org/TR/WCAG22/#target-size-minimum) | All controls at least 48x48 px with 8 px spacing. |

### Echo Show (Alexa+ add-on)

**P0**

| # | Change | Why (source) | Exact values |
|---|---|---|---|
| E1 | Build on the 768x480 base canvas with Alexa type tokens, and set the sim frame to 1280x800 with `zoom: 1.667`. | Visual foundations (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-visual-foundations.html) | Case title Display2 40, suspect quote Display5 24, supporting line Body1 16, kicker Label1 10 (never Label2 8 for anything a person must read). Remove the 13 px `.label`. |
| E2 | Drop the full-bleed plum gradient. Use Alexa card surfaces and spend brand on accents. | Brand rule: no bold brand colors or gradients as large fields | Dark: page Alexa default, card #14181E, inner #1B2028, text #F5EDE0 (15.3:1), brass #C9A24A for kicker and primary button (7.4:1). Light mode required: card #FFFFFF on #FAF9FB, text #2A1F17. Paper clue card can stay as a single accent object. |
| E3 | Glanceable cards: one title, one or two fields, one action. Voice-only parity. | Overview principles; display modes voice-only rule | Suspect reply card: portrait 120x120, name + role, quote max 2 lines, one action "Ask someone else". Tool data written as plain sentences, no pipes or markdown. |

**P1**

| # | Change | Why (source) | Exact values |
|---|---|---|---|
| E4 | Use the gouache portrait, not initials. | Alexa accessibility alt text rule; brand consistency | Portrait 96 px at base, radius 9999; alt text under 125 chars, for example "Painted portrait of Mrs Agatha Pike, the cook, flour on her apron". |
| E5 | Logo assets and placement. | Brand expression page | Horizontal logo 80 px tall, dark and light; square 120x120, dark and light, with and without background. Inline top-left, fullscreen top-center. |
| E6 | Inline by default; fullscreen only for the evidence board, behind an explicit "Open the board" button. | Display modes page | Suspect list as a 3 to 5 item carousel, first card within 500 ms, strongest lead first (https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-components-and-patterns.html). |
| E7 | Replace #FFFFFF caption text with #F5EDE0. | TV/ambient: avoid pure white (Smashing link) | `echo-sim/src/styles.css` `.caption-text`. |

**P2**

| # | Change | Why (source) | Exact values |
|---|---|---|---|
| E8 | Read `hostContext` once and apply a breakpoint class; respect `safeAreaInsets` and `theme`. | Layout and rendering page | Classes `.dc-echo-show`, `.dc-mobile`, `.dc-web`, re-resolve on `host-context-changed`. |
| E9 | Test with Color Inversion and Color Correction on. | Visual foundations checklist | Verify string, stamps and verdict colors still read. |

### Motion and sound recipe (applies to all surfaces)

All values are starting points to tune in playtest (ASSUMPTION built from the M3 tokens and hit-stop ranges in section 1.3).

| Moment | Motion | Sound | Polly |
|---|---|---|---|
| Focus move | 150 ms, emphasized decelerate, scale 1.06 | soft paper tick, -24 dBFS | none |
| Pin a clue | card lifts 120 ms, drops 180 ms, 60 ms hit-stop on contact | pin "thunk" | none |
| Red string link | string draws 400 ms along a slight curve, 2 px overshoot | taut string pluck | none |
| Prove it stamp | 200 ms anticipation (stamp rises, scale 1.3), 120 ms slam, 80 ms hit-stop, 6 px screen nudge (0 with reduced motion) | rubber stamp + paper rustle | narrator reads verdict after `<break time="400ms"/>` |
| Suspect answer | portrait breathes (scale 1.00 to 1.015, 4 s loop) while speaking | voice only, music ducked | insert `<break time="600ms"/>` before the last clause of a joke line |
| Culprit reveal | 1500 ms of near silence and stillness before the name; then name in 600 ms, beams rotate | single low piano note, then sting | narrator: "It was... `<break time="1500ms"/>` Dr Felix Amari." |
| Accomplice unmask | phone of the accomplice flashes their card at the same moment as TV (sync within 100 ms) | record scratch or gasp sting | not used |

Note: do not use `<emphasis>` or `amazon:effect` whisper on neural voices; they are unsupported and error (https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html). Fake emphasis with `<prosody rate="90%">` on the key word where prosody rate is supported, and verify per voice.

---

## Part 4. Three game-design improvements

### 1. Narrated cold open that is also the tutorial (60 s)

What: replace the separate "How to play" with a 45 to 60 second cold open. The narrator sets the scene over the house art, then turns to the room: "Before anyone leaves, the butler will answer one question. Whoever is holding a phone, hold the button and ask him anything." One free practice question to a non-suspect (the butler) teaches push-to-talk, captions and the TV answer in one go. Then "Pin the clue you like best" teaches pinning. Then roles are dealt.

Why: Jackbox opens with a host-style narrator walking players through each step and tests with players who never play games (https://builtin.com/media-gaming/jackbox-games-design-party-pack). Volley says familiar formats remove instruction time (https://yespress.io/volley). GAG asks for interactive tutorials and practice without failure (https://gameaccessibilityguidelines.com/full-list/). It also lets judges see the core loop in the first minute.

### 2. "The lights go out": a mid-game dramatic interruption

What: at the start of round 3, the TV cuts to black for 1.5 s, a thunderclap, then the narrator: "When the lights came back, someone had moved the decanter." A new board clue drops that is verified by the engine (it narrows, never contradicts), and every phone gets a 45 s "Emergency meeting": the room must jointly choose one suspect who is forced to answer one extra question in front of everyone. Majority vote on phones, tie broken by the player with the fewest questions asked.

Why: paper murder mystery kits plan an "emergency call or dramatic entrance" mid-game to reset energy (https://www.nightofmystery.com/?p=389499, https://www.broadwaymurdermysteries.com/blogs/news/guide-to-hosting-a-murder-mystery-party-at-home). Among Us meetings show a short, timed group discussion works (15 s discussion, 120 s vote defaults: https://github.com/roobscoob/among-us-protocol/blob/master/07_miscellaneous/01_the_structure_of_the_gameoptionsdata_object.md). It gives round 3 its own shape so it does not feel like round 2 again, and the forced public question is a spotlight moment for comedy. Because the clue comes from the same Z3-checked case, fairness is kept.

### 3. Accomplice "sabotage cards" with a public tell

What: the accomplice gets one sabotage per round, chosen privately on the phone from 2 options the engine generates as safe:
- **Smudge**: blur one board clue for everyone for 60 s ("Someone spilled the port on it").
- **Whisper**: send a fake "private clue" to one detective's phone, built from the engine's safe lies.
- **Interrupt**: cut a suspect off mid-answer with a "crash" sound so the line has to be asked again.
Each sabotage leaves a small public tell on TV ("Someone tampered with the board at 9:12"), and the reveal replays exactly when and how each sabotage happened.

Why: Push the Button's late-game "hack" lets the hidden team actively interfere, which makes them players rather than passive liars (https://techraptor.net/content/push-the-button-jackbox-fall-2019). Secret Hitler gives the hidden team a deliberate leg up to offset the accusations they face (https://secrethitler.io/rules). The public tell keeps deduction fair, and the reveal replay is a guaranteed laugh ("Theo smudged the boot prints!"). With only 3 to 6 players, the accomplice is otherwise easy to spot; reviewers found Push the Button too easy at 4 players (https://www.jumpdashroll.com/article/the-jackbox-party-pack-6-review), so giving the accomplice active tools also balances small groups.

Bonus (cheap, high value): open an **audience** seat type. Anyone past 6 players, or anyone who scans the QR late, joins as audience and casts Hunch votes (P7). Jackbox supports audiences up to 10,000 (https://www.nintendo.com/store/products/the-jackbox-party-pack-10-switch/), and the "The room suspected Amari 64%" line during the reveal is both funny and a nice stat for judges.

---

## Part 5. Suggested pacing for one case (target 20 to 25 min)

All ASSUMPTION, derived from the session references in section 1.2.

| Phase | Time | Notes |
|---|---|---|
| Lobby | until ready | QR + 4 letter code, host starts |
| Cold open + tutorial | 60 s | Improvement 1 |
| Briefing | 90 s | Skippable after first play |
| Round 1 | 5 min | 2 questions each, 1 to 2 board clues, 1 private clue each |
| Round 2 | 5 min | Accomplice sabotage unlocked |
| Lights out + Round 3 | 6 min | Improvement 2 |
| Accuse | 2 min | Timer adjustable per XAG 116 |
| Reveal + results | 3 min | Lie replay, unmask, awards |

---

## Source list

Amazon and Fire TV
- https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html
- https://developer.amazon.com/apps-and-games/blogs/2026/07/blueprint-series-pt5-accessibility
- https://developer.amazon.com/docs/vega/0.24/focus-management.html
- https://developer.amazon.com/docs/react-native-vega/0.83/accessibility.html
- https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-design-guide-overview.html
- https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-visual-foundations.html
- https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-display-modes.html
- https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-conversation-surface.html
- https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-layout-and-rendering.html
- https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-brand-expression.html
- https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-accessibility.html
- https://developer.amazon.com/docs/alexaplus/add-ons/mcp-addon-components-and-patterns.html
- https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html
- https://docs.aws.amazon.com/polly/latest/dg/output.html

Other platforms and TV craft
- https://developer.android.com/design/ui/tv/guides/styles/layouts
- https://developer.android.com/design/ui/tv/guides/styles/typography
- https://developer.apple.com/design/human-interface-guidelines/designing-for-tvos
- https://smashingmagazine.com/2025/09/designing-tv-principles-patterns-practical-guidance/
- https://sepwww.stanford.edu/sep/jon/family/jos/webtv/developer3/design/satcolor/satcolor.htm
- https://www.elasticspace.com/2004/03/design-for-television
- https://avisynthplus.readthedocs.io/en/latest/avisynthdoc/corefilters/limiter.html
- https://m3.material.io/styles/motion/easing-and-duration/tokens-specs
- https://www.w3.org/TR/WCAG22/

Accessibility
- https://gameaccessibilityguidelines.com/full-list/
- https://devdocs.xbox.com/build/game-principles/accessibility/xag-deep-dives/xag-101-text-display.md
- https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/104
- https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/106
- https://devdocs.xbox.com/build/game-principles/accessibility/xag-deep-dives/xag-116-time-limits
- https://accessible.games/apx
- https://www.meeplelikeus.co.uk/secret-hitler-2016-accessibility-teardown/
- https://dequeuniversity.com/rules/attest-ios/1.0/touch-target-size

Party and hidden-role games
- https://builtin.com/media-gaming/jackbox-games-design-party-pack
- https://techraptor.net/content/push-the-button-jackbox-fall-2019
- https://www.jumpdashroll.com/article/the-jackbox-party-pack-6-review
- https://www.nintendo.com/store/products/the-jackbox-party-pack-10-switch/
- https://www.whats-on-netflix.com/news/netflix-games/netflix-releases-its-knives-out-tie-in-game-just-in-time-for-christmas
- https://yespress.io/volley
- https://developer.amazon.com/en-US/blogs/alexa/alexa-skills-kit/2020/05/8-things-we-learned-from-alexa-games-week
- https://mechanicsofmagic.com/2024/04/09/critical-play-blood-on-the-clocktower/
- https://www.smartcompany.com.au/?p=341421
- https://github.com/roobscoob/among-us-protocol/blob/master/07_miscellaneous/01_the_structure_of_the_gameoptionsdata_object.md
- https://secrethitler.io/rules
- https://www.theboardgamefamily.com/2014/05/one-night-ultimate-werewolf-game-review/
- https://www.broadwaymurdermysteries.com/blogs/news/guide-to-hosting-a-murder-mystery-party-at-home
- https://www.nightofmystery.com/?p=389499
- https://parkerpeevyhouse.substack.com/p/7-rules-for-satisfying-murder-mysteries
- https://www.denofgeek.com/movies/glass-onion-whodunit-mysteries-need-play-fair-with-audience

Game feel and timing
- https://eastondev.com/blog/en/posts/dev/20260521-game-feedback-feel/
- https://www.wayline.io/learn/game-feel/1
- https://yzhu.io/publication/humor2026cogsci/
- https://scienceblog.com/the-science-of-the-pause-computational-mapping-reveals-the-hidden-engineering-behind-stand-up-comedy/
- https://www.degruyterbrill.com/document/doi/10.1515/HUMR.2011.015/pdf
