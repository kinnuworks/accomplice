# Blind judging panel, round 6 (Oct 23 2026, deadline day)

The hackathon is "Build, Ship, Shape: Amazon Developer Hackathon" on Devpost. Each entry was scored 1 to 5 on four criteria (Technical Implementation, Design & UX, Potential Impact, Quality of the Idea), for a total out of 20. The judges also picked a winner for each of four prizes: the Fire TV track, the Alexa+ track, the AWS Builder mini challenge and the Open Source mini challenge.

## Method

- **Entries.** There were 11 entries: the 10 "top threats" from `COMPETITORS_R6.md` section (c), plus ours. Flipbook and Patch Hours were already in that list.
- **Descriptions.** Every entry got a neutral description of about 115 to 165 words, plus a "visual evidence" line.
- **Our description.** It was written from `SUBMISSION.md`. Anything still in [brackets] was not credited, so the packet says "No video, no playtest".
- **Our visual evidence.** I looked at real screenshots: 10 TV, 6 phone, 3 Echo simulator and 2 Vega Virtual Device captures. The descriptions of them are neutral and include the flaws (see below).
- **Blinding.** Names were removed and the entries were shuffled into Entry A to K. We were **Entry G**.
- **Judges.** Five subagents scored independently, each with the same packet and a different persona: (1) Fire TV product VP, (2) Alexa+ developer evangelist, (3) Vega OS engineer, (4) AWS solutions lead, (5) hostile skeptic.
- **Second pass (hypothetical).** Five fresh subagents got the same packet with only Entry G changed to fill in the brackets. They re-scored only G and made their prize picks again.
- **Caveat.** All judges are the same underlying model, so expect about ±1 point of noise per judge per entry.

Packets used, for reproducibility:
- Scored pass: `/private/tmp/claude-501/-Users-kinnu-amazon/c81cc733-a28b-4f49-9211-c5da4e88b771/scratchpad/packet.md`
- Hypothetical pass: `.../scratchpad/packet_hypo.md` in the same folder

## 1. Ranked table (averages of 5 judges, de-anonymized)

| Rank | Entry | Anon | VP | Alexa | Vega | AWS | Skeptic | **Avg /20** |
|---|---|---|---|---|---|---|---|---|
| 1 | Every Seat | A | 19 | 19 | 18 | 19 | 19 | **18.8** |
| 2 | Wick | C | 18 | 17 | 18 | 17 | 17 | **17.4** |
| 3 | Patch Hours | F | 17 | 18 | 17 | 18 | 16 | **17.2** |
| 4 | Your Own Commentator | I | 18 | 16 | 16 | 17 | 15 | **16.4** |
| 5 | Alibi | E | 16 | 17 | 15 | 16 | 14 | **15.6** |
| 6 | Flipbook | J | 15 | 15 | 15 | 14 | 15 | **14.8** |
| 7 | StoryQuest | K | 16 | 14 | 15 | 13 | 13 | **14.2** |
| 8 | Tiny Racers | D | 15 | 14 | 14 | 12 | 11 | **13.2** |
| **9** | **Accomplice (ours)** | **G** | **14** | **13** | **13** | **14** | **10** | **12.8** |
| 10 | Couch Game Studio | H | 12 | 12 | 13 | 12 | 9 | **11.6** |
| 11 | Sealed Case for Alexa+ | B | 9 | 11 | 10 | 9 | 9 | **9.6** |

Our score is the same as in R5 (12.8). Our rank fell from 7th to 9th because the new entries (Every Seat, Your Own Commentator, Alibi) all landed above us.

## 2. Our per-criterion averages (scored pass)

| Criterion | VP | Alexa | Vega | AWS | Skeptic | **Avg** |
|---|---|---|---|---|---|---|
| Technical Implementation | 4 | 3 | 3 | 3 | 2 | **3.0** |
| Design & UX | 3 | 3 | 3 | 4 | 2 | **3.0** |
| Potential Impact | 3 | 3 | 3 | 3 | 2 | **2.8** |
| Quality of the Idea | 4 | 4 | 4 | 4 | 4 | **4.0** |
| **Total** | 14 | 13 | 13 | 14 | 10 | **12.8** |

Every judge gave the idea a 4. Everything else is capped by missing proof.

**All five judges named us the #1 "biggest weakness" among the top 3 they called out.** Their reasons:
- **Fire TV VP:** "Its whole pitch is a party game for three to six people, yet there is no video, no playtest and no run on Fire TV hardware or real Alexa+, so the fun is completely unproven."
- **Alexa+ evangelist:** It "promises the most (Fire TV, Alexa+, multiplayer, an accomplice role)" but "almost none of the experience can be credited".
- **Vega engineer:** "The 'Vega app' is a web stage inside a wrapper," with no video and no hardware run. The TV and phone screenshots come from different generated cases.
- **AWS lead:** "The main AI model sits outside AWS, so the architecture is unproven end to end."
- **Skeptic:** "Nothing in it can be verified." The UX evidence is static screenshots from different cases, "the 1.56 s latency is a single number with no stated method", and it "claims all four tracks".

## 3. Prize picks per judge (scored pass)

| Judge | Fire TV | Alexa+ | AWS Builder | Open Source |
|---|---|---|---|---|
| Fire TV VP | Every Seat | Alibi | Wick | Every Seat |
| Alexa+ evangelist | Every Seat | Alibi | Wick | Every Seat |
| Vega engineer | Wick | Alibi | Every Seat | Flipbook |
| AWS lead | Every Seat | Alibi | Every Seat | Wick |
| Skeptic | Every Seat | Alibi | Wick | Flipbook |
| **Tally** | Every Seat 4, Wick 1 | **Alibi 5/5** | Wick 3, Every Seat 2 | Every Seat 2, Flipbook 2, Wick 1 |

We got **0 picks out of 20.** Every Seat is the new front-runner for Fire TV, and Alibi wins Alexa+ unanimously. Sealed Case, which won Alexa+ in R5, is now last overall.

## 4. HYPOTHETICAL: brackets filled (not real evidence)

> **This section is hypothetical.** It assumes the following exist and are on the Devpost page:
> - a 3-minute video of 5 friends playing on a TV with phones, where the accomplice is caught in round 3 and the laughter is visible;
> - "3 games, 5 people, 2 of 3 groups asked for another case";
> - the quote "I was the accomplice and nearly got away with it".
>
> None of this exists yet.

| Criterion | VP | Alexa | Vega | AWS | Skeptic | **Avg** | Change |
|---|---|---|---|---|---|---|---|
| Technical Implementation | 4 | 4 | 3 | 3 | 3 | **3.4** | +0.4 |
| Design & UX | 5 | 5 | 4 | 4 | 4 | **4.4** | +1.4 |
| Potential Impact | 4 | 4 | 3 | 3 | 3 | **3.4** | +0.6 |
| Quality of the Idea | 5 | 5 | 4 | 4 | 4 | **4.4** | +0.4 |
| **Total** | 18 | 18 | 14 | 14 | 14 | **15.6** | **+2.8** |
| Rank each judge gave us (of 11) | 2 | 2 | 8 | 6 | 7 | | |

**Result:** 15.6 would put us level with Alibi for 5th, up from 9th. The two product-minded judges would place us 2nd. The three technical judges stay at 14, because the video does not answer:
- no Fire TV hardware run;
- a web stage inside the Vega app rather than native UI;
- a dialogue model outside AWS;
- a thin playtest;
- sprawl across four tracks.

**Hypothetical prize picks** (fresh judges): Fire TV went to Wick 5/5, Alexa+ to Alibi 5/5, AWS Builder to Every Seat 5/5 and Open Source to Flipbook 5/5. **We still win 0 of 20.**
- The Fire TV prize goes to Wick because it is "the only entry shown working on a real Fire TV Stick". In the scored pass Every Seat took it. Either way, the hardware run is the tiebreaker.
- The Alexa+ evangelist said outright that "in G Alexa+ is a secondary mode".

## 5. Our top weaknesses, with concrete fixes (ordered by points per hour)

1. **No video and no playtest.** All 5 judges flagged this, and fixing it is worth about +2.8 on average and +4 to +5 with the product judges.
   - Run 3 real games tonight. Pull the numbers from the server log.
   - Record a video of about 3 minutes in which the caught-accomplice moment and real laughter appear in the first 10 seconds. Add YouTube chapters.
   - Put the link in the first line of the Devpost page, and fill the playtest line with the real numbers and one real quote.
2. **No run on Fire TV hardware.** This decides the Fire TV prize in both passes.
   - If anyone can get a Fire TV Stick (a Vega-capable model), sideload the existing armv7/aarch64 vpkg. Film 10 seconds of the title screen and lobby on a real TV with the remote, and add the measured cold start to the numbers table.
   - If you can't, film the VVD run in the video and keep "not on hardware" as the first item under Limits.
3. **A web stage inside the Vega app, and screenshot hygiene.** The Vega engineer and the skeptic both noticed.
   - Regenerate all TV, phone and Echo screenshots from one seeded case. At the moment the TV says Mrs Pargeter with the decanter, the phone says Dorothy Finch with the candlestick, and the Echo says Tom Bramble.
   - Fix the pin graphics that overlap clue titles on the evidence board.
   - Hide or shorten the trycloudflare tunnel URL shown in the VVD lobby. The room code is enough.
   - In "How we built it", add one sentence on why the stage is web-rendered (shared code with phones, measured 749 ms first frame and 249 MiB), so it reads as a deliberate choice.
4. **The dialogue model is outside AWS, and there is no Bedrock, Nova or AgentCore.** The AWS lead and the skeptic both marked this down.
   - Try Bedrock (Nova Lite or Micro) from a non-AISPL account or another region. Even one measured run through the existing "one setting" switch would turn a limit into evidence.
   - If that is impossible, move the CDK stack, the CloudWatch dashboard and the $150 budget cap higher up the AWS section, and state the measured cost per game.
5. **Sprawl across four tracks, and Alexa+ as a side mode.** The skeptic called "claims all four tracks" sprawl, Alibi wins Alexa+ 10 out of 10 times, and the evangelist sees our Alexa+ part as secondary.
   - Lead the page with one track: the Fire TV party game. Present Alexa+ only as "the voice host for a party game where one of your friends is lying" and give it 15 seconds in the video, not a section of equal weight.
6. **Numbers without a stated method.** The skeptic only saw "1.56 s" with no method.
   - In the measured-numbers table, put the n and the tool on every row, for example "1.56 s median, n=__ questions, server timings".
   - Add a "What is real / what is simulated" table at the top. Every leader has one.
7. **Weak Open Source case.** We got no Open Source picks, and Flipbook wins it on form.
   - Give `fairplay` a README in Flipbook's style: a CI badge, a test count, an "honest limits" list, a 20-line "use it in your own deduction game" example, and an evidence folder for the Z3 claims (for example, N cases generated and the share rejected).

## Bottom line

On today's evidence we come 9th of 11 at 12.8, with 0 prize picks.

If we add the video and the playtest, we rise to about 15.6, level for 5th, and the product-minded judges would put us 2nd. Even then we win no prize. To win the Fire TV track we would also need a real Fire TV hardware run, consistent screenshots and a single-track story, and even with those we face Wick's hardware proof and Every Seat's measured accessibility work.
