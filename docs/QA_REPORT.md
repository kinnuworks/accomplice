# Accomplice QA report

Independent end to end audit. Harness: `e2e/` (package `@accomplice/e2e`). Re-run after every fix round with:

```
pnpm --filter @accomplice/e2e run audit            # builds tv-web + phone, all mock scenarios (~25 min)
pnpm --filter @accomplice/e2e run audit --real     # same, plus a short run against the real text model
pnpm --filter @accomplice/e2e run audit --only=main --skip-build
```

Use `run audit`: plain `pnpm --filter ... audit` is shadowed by pnpm's built-in security audit. Each run writes `e2e/out/<timestamp>/` (`e2e/out/latest` points at the newest one) with one folder per phase, holding the TV and phone screenshots. The folder also gets `report.md` (grouped automated findings), `results.json` (raw data) and the server log. The harness starts its own server on a free port from 8799 up, with `MODEL_PROVIDER=mock` and its own cache in `e2e/.cache`. It only ever signals the PID it started.

Evidence below comes from run `e2e/out/2026-10-22T21-10-34` (abbreviated `R/`). That run covered all six scenarios: main 4 players, resilience, 3 players, 6 players + 1 audience, cozy, and real provider. The issues reproduced in the earlier full runs (`2026-10-22T20-17-21`, `2026-10-22T20-50-22`) and in the final mock re-run `2026-10-22T21-37-05`, where every remaining failed step is a product finding rather than a harness problem.

What was exercised through the real UI: hosting and the tone toggle from the TV remote, joining from iPhone 15 and Pixel 7 emulation, the tone choice on the host phone, the cold open and briefing skip, the secret role envelope, the practice question, typed questions (including two phones at once), objection, hunch, pinning, red string and Prove it (D-pad only), phone theory proposal plus agree/not yet, accomplice smudge, blackout emergency vote and free question, accusation votes, reveal beats, the ledger and Play again. Resilience covered a phone refresh, a TV refresh, a phone going offline and coming back, a phone leaving for good during the vote, and a player with no questions left.

Automated per-screen checks: console errors and warnings, uncaught exceptions, failed or 4xx requests, viewport and container overflow, truncation, overlapping controls, the TV safe area (96/54 px), text under 28 px (TV) or 14 px (phone), contrast sampled from the screenshot, TV focus visibility, axe-core on phones, audio requested vs served, phase durations, question to first audio latency, and a copy audit.

Clean results worth knowing: **0 console errors, 0 uncaught exceptions, 0 failed requests, 0 audio 404s** (19 sfx, 3 music beds, 112 voice files all served). axe-core reported **no violations** on any phone screen. A TV refresh mid-game returns to the right screen. A phone refresh rejoins as the same player with notes intact. A phone that leaves during the accusation does not block the reveal. The 3-player game deals no accomplice. A 7th phone is seated in the audience. Copy is free of em dashes, stock AI words and vendor brands.

## P0: crash or blocker

### 1. There is no way to leave round one (tv, server)
- Repro: start any game, finish or skip the practice question, ask questions in round 1. Look for any control on the TV (D-pad) or the host phone that moves to round 2 or to the accusation.
- Expected: a "Next round" / "Time to accuse" control on the TV (and the host phone), or an automatic move on once every question is used or the soft timer ends.
- Actual: no screen sends `tv:next` during `investigate`. Only Briefing, Tutorial, Reveal and Results send it, and `Room` never auto-advances a round. The game is stuck in round 1 forever. The harness had to send `tv:next` over a raw socket to continue, and it flags this every run.
- Screens: `R/main/31-no-advance-control-r1-to-r2/`, same in every scenario.

### 2. The clock-chime overlay gets stuck and covers the TV for the rest of the game (tv)
- Repro: reach round 3, which sends a chime and then a blackout event straight after.
- Expected: "The clock strikes N." shows for a few seconds and then goes.
- Actual: in `StageFx.tsx` the effect's cleanup clears the hide timer when any later `event` arrives (blackout, emergency, smudge, objection). The new effect returns early because the kind is not `chime`, so `setChime(null)` never runs. A full-screen 96% dark layer (z 58) then sits over the blackout vote, the free question, the accusation, the whole reveal (including "Nobody was the Accomplice"), the newspaper and the ledger. Focus checks report every focused button as "covered by div.chime".
- Screens: `R/main/35-round3-blackout/tv.png`, `R/main/39-accuse-tv/tv.png`, `R/main/51-reveal-newspaper/tv.png`, `R/main/53-results-ledger/tv.png`, `R/three/74-reveal-accomplice/tv.png`.

### 3. Answers play 17 to 34 s after the question because the TV queues them behind the narrator (tv, server)
- Repro: ask a question right at the start of round 1, or during the practice round.
- Expected: the suspect starts talking within about 3 s.
- Actual: the server has the first sentence ready in 0.2 to 2.7 s (the real model's first part arrives in 2.1 to 2.7 s, per `/api/rooms/:code/timings`). The TV director, however, plays one FIFO `lineQueue`, so the answer waits behind every queued narrator line: round intro, clue texts, the tutorial lines, even the lobby "Welcome, X" and join prompts. Measured question to first `play()` on the TV: 33.9 s (practice question), 31.2 s, 19.8 s and 17.1 s. In the real-provider run, the lobby line "Scan the code or enter room code ZKBC" was still captioned during round 1. Knock-on effects: the hunch vote (20 s of server time) and the objection window (answer end + 6 s of server time) close before the room has heard the answer, and the TV shows "Lying or truthful?" while the suspect is still "listening".
- Screens: `R/main/12-round1-start/tv.png`, `R/main/11-tutorial-answer/tv.png` (the house answer is never shown), `R/real/03-real-answer/tv.png`, plus the latency table in `R/report.md`.

## P1: broken or ugly

### 4. Phone avatars render as words: "fox Ada", "badger" over "Esme" (phone)
- Repro: join with any calling card and look at the lobby, top bar, ballot or results on the phone.
- Expected: the avatar emoji or icon.
- Actual: `Join` sends the avatar id (`fox`, `owl`, `badger`) and the server stores the id, but the phone renders `p.avatar` as text. Long ids overflow the 40 px circle and sit over the name. The TV maps the ids to art correctly.
- Screens: `R/six/79-six-audience-lobby/phone7-iPhone15.png`, `R/main/53-results-ledger/phone3-iPhone15.png`.

### 5. The talk dock sits on top of the suspect picker (phone)
- Repro: round 1 on iPhone 15 (393x852) or Pixel 7. Scroll any suspect card into view and tap its centre.
- Expected: every suspect card can be tapped.
- Actual: the sticky dock (talk button + "Type instead") covers the middle of the cards it overlaps. On first view the whole "Who do you want to question?" grid is under the dock, and the dock's translucent panel shows text bleeding through it. The harness check "every suspect card can be tapped" fails on both devices every run (for example "Mr. Crale under talk__label").
- Screens: `R/main/13-FAIL-every-suspect-card-can-be-tapped/`.

### 6. Red string is invisible (tv)
- Repro: pin two neighbouring cards, then OK on one, "Tie red string", OK on the other.
- Expected: a sagging red string between the pins.
- Actual: the server records the link and the cards say "Pinned +1", but `.strings` is drawn at z-index 0 under the cards. Between neighbouring cards the whole path is hidden behind them.
- Screens: `R/main/23-board-linked/tv.png`.

### 7. The interrogation spotlight is a half-transparent mess over the board (tv)
- Repro: ask a suspect a question and watch the TV while they are being questioned.
- Expected: the board drops back and the suspect is lit.
- Actual: `.spotlight` only has a 0.35 alpha backdrop. Clue cards, the "Bram is asking" note and the portrait all show through each other, and the ghosted portrait renders inside the clue grid.
- Screens: `R/main/15-round1-two-asks/tv.png`, `R/cozy/97-cozy-answer/tv.png`, `2026-10-22T20-04-53/main/13-FAIL-two-phones-ask-at-the-same-moment/tv.png`.

### 8. The narrator caption bar covers controls and names (tv)
- Repro: lobby with anyone joining, or round start.
- Expected: captions in a reserved band.
- Actual: the caption panel is drawn over the Cozy tone button (it covers "Cozy, A stolen cake"), the suspect strip names (Kitty, Isadora, Wilf) and the bottom of "Start the case".
- Screens: `R/main/04-lobby-tone-cozy/tv.png`, `R/six/81-six-round1/tv.png`, `R/main/11-tutorial-answer/tv.png`.

### 9. Accomplice result contradicts itself (tv)
- Repro: finish a 4-player game where the accomplice is not caught.
- Expected: one story everywhere.
- Actual: the TV ledger always labels the accomplice "Smooth, but caught" (hard coded in `Results.tsx`). The newspaper on the same TV says "Cleo, still at large", and every phone says "They slipped away".
- Screens: `R/main/53-results-ledger/tv.png` vs `R/main/53-results-ledger/phone3-iPhone15.png`.

### 10. The audience phone looks like a normal player in the lobby (phone)
- Repro: 6 players seated, a 7th phone joins.
- Expected: "You're in the audience" from the start.
- Actual: the server seats the phone in the audience, but the phone shows the player lobby ("The guests are arriving", guest list, "Waiting for the host") without itself on the list and with no explanation. The audience screen only appears after the game starts. The TV lobby does not show the watcher either.
- Screens: `R/six/79-six-audience-lobby/phone7-iPhone15.png`.

### 11. A stale verdict dialog survives into the next round (tv)
- Repro: in round 2, let the table settle a phone theory so the TV verdict dialog opens. Nobody presses OK. The round advances.
- Expected: the dialog closes on a phase or round change.
- Actual: "Bram's theory... POSSIBLE" stays open over round 3 and the blackout. The verdict also persists on the phones' Investigate screen.
- Screens: `2026-10-22T20-50-22/main/35-sabotage-done/tv.png`, `.../36-round3-blackout/tv.png`, `.../37-emergency-vote-open/phone1-iPhone15.png`.

### 12. A real-model answer speaks about the suspect in the third person (server)
- Repro: real provider run; ask Hugo Mysterio "Did you see anyone near the scene of the crime?"
- Actual: "Hugo was in the Store Room at 10:00 pm, and there he saw only Rohan Kapoor..." spoken by Hugo himself. The checker dropped one sentence (`dropped: 1`) and the fallback left a narrator-style line in the suspect's mouth.
- Screens: `R/real/04-real-after/`, latency table in `R/report.md`.

### 13. Clue card text is cut off on the TV board (tv)
- Repro: round 1 to 3 board.
- Actual: the card face clamps to 2 to 3 lines and `.clue-text` overflows by 39 to 40 px ("Isadora claims the Dining Room at 4:30 pm. Nobody..."). `.clue-title` and `.inv-title` are 3 to 4 px too short, which clips descenders. The full text only appears in the side panel when the card has focus, so the room can only ever read one card.
- Screens: `R/main/32-round2-start/tv.png` (21 truncation hits across phases in `R/report.md`).

## P2: polish

14. **3-player TV accuse copy mentions an accomplice** (tv). "If you think someone at this table helped them, say so." appears for every classic game, including 3 players. The phone ballot correctly omits the accomplice question. `R/three/73-FAIL-no-accomplice-question-on-the-ballot/tv.png`.
15. **A dropped phone is never marked away** (server). With the network cut for 15 s, the server still lists the player as connected (no WS heartbeat or timeout), so emergency votes and proposals wait on them. Reconnect then works. `R/resilience/60-phone-offline-still-connected/`.
16. **Briefing button says "Begin round one" but opens the practice round** (tv). `Briefing.tsx` sends `tv:next` and the server goes to `tutorial`. `R/main/08-briefing-ready/tv.png`.
17. **Proof chain reads "So: So ..."** (phone). The Reveal adds a "So:" prefix to engine text that already starts with "So". `R/main/51-reveal-newspaper/phone1-iPhone15.png`.
18. **Name spellings differ between TV and phone** (tv/phone). The TV normalises titles ("Mrs Pargeter", "Dr Sen") while phones show "Mrs. Dolly Pargeter" and "Dr. Anjali Sen". TV captions keep the raw form ("Mrs. Dolly Pargeter lied..."), so the TV disagrees with itself too.
19. **"N new" clue badge exceeds the clue count** (phone). The tabs read "Clues 6 / 8 NEW" in round 3. `2026-10-22T20-50-22/main/37-emergency-vote-open/phone1-iPhone15.png`.
20. **TV safe area**: `.inv-head` text starts at y 40 (limit 54) on every investigate screen. "Open the case" and "The ledger" end at x 1836 (limit 1824). 32 grouped hits in `R/report.md`.
21. **TV text under 28 px**: tone blurbs (24 px), OK key caps (18 to 22 px), hints, clue kind labels. Phone: avatar labels on the join form are 12.8 px. 184 grouped hits.
22. **Low contrast**: on the TV, the "Guests" heading sits on gold (1.4:1) and the "Host" seat tag (dark on dark) is around 1.3:1. On the phone, "Close the envelope" and "or double-tap to open" on the open envelope are around 1.1:1. (Many other TV contrast hits sit under the stuck chime overlay, #2.)
23. **Phone tabs wrap to two rows** on both devices ("Notes" alone on row two). The theory sheet's item rows are 43 px tall (target 44).
24. **The secret role card overlaps the envelope button**: "Read it to me" and "Hide" sit on top of the envelope's hit area, and "To: Cleo" is clipped on the accomplice card. `R/main/07-briefing-roles-open/phone3-iPhone15.png`.
25. **The practice character has placeholder art** (silhouette) while every suspect has a painted portrait. In one Ashby Hall case the house character "Hobbs, the butler" was also a suspect with the same name.
26. **Hunch bar renders as a stray 1 px line** when there are 0 votes (TV "Lying or truthful?" chip).
27. **The newspaper headline names the detective with the most points even if the accomplice scored more** ("Bram takes a well earned bow" while Cleo, the accomplice, tops the table). Also "well earned" wants a hyphen.

## Timing (main scenario, mock model, real Polly voices)

lobby 43 s, briefing 45 s (skipped with OK), tutorial 47 s, round 1 246 s, round 2 81 s, round 3 43 s, accuse 26 s, reveal 97 s, results 43 s. Server prerender of narrator and filler audio takes 20 to 36 s per case, in the background. Theory checks take 42 to 167 ms. Real model: first answer sentence ready in 1.7 to 2.3 s server side. The TV queue (#3) is what players feel.

## Harness notes for the next round
- Every flow step that fails becomes a finding with a screenshot, and the scenario continues. The TV is driven only by the keyboard (arrows and Enter). Phones are driven through role and label selectors.
- The one non-UI action is the protocol `tv:next` fallback for #1. Once a visible control exists (any `[data-nav]` on the TV, or a host phone button, matching "next round", "time to accuse" and similar), the harness uses it and the P0 disappears.
- Phone taps scroll the control to the middle first. Anything still on top is listed under "Phone controls a tap could not reach" in `report.md`.
- Contrast is sampled from screenshot pixels around each text run, so it is approximate. Overlays that legitimately dim the screen show up as low contrast.
