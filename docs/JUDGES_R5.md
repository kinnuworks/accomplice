# Round 5 blind panel (Oct 23)

5 independent judges, each run as a separate subagent with the same anonymized packet of 11 entries (A to K, shuffled). Every entry got a neutral description of 95 to 155 words. Ours was written from SUBMISSION.md plus what the screenshots show (8 TV, 7 phone, 4 Echo). Bracketed placeholders were listed as "not yet evidenced".

Packet notes on our screenshots: painted 1930s art and D-pad hints on every TV screen. The reveal proof-chain screen (`26-reveal-proof-chain.png`) has the names "Colonel Hargreaves" and "Mysterio" overlapping. At 200% text the phone breaks "Objectio / n!" and "Hargreave / s" mid-word. The Echo Strands log shows the model `claude-haiku-4-5`, not an Amazon model.

There were only 11 entries, not 12: the top 8, plus Patch Hours and Flipbook (Wick is in the top 8), plus ours. PLAN.md has no description of Patch Hours, so its entry was written from its public README (github.com/itssaharsh/patch-hours). Flipbook's was written from github.com/edycutjong/flipbook.

## Scores (/20, average of 5)

| Rank | Entry | Fire TV VP | Alexa+ evang. | Vega eng. | AWS lead | Skeptic | **Avg** |
|---|---|---|---|---|---|---|---|
| 1 | H: Wick | 19 | 19 | 18 | 19 | 17 | **18.4** |
| 2 | F: Flipbook | 18 | 18 | 18 | 17 | 17 | **17.6** |
| 3 | B: Patch Hours | 17 | 18 | 18 | 17 | 16 | **17.2** |
| 4 | G: StoryQuest | 16 | 15 | 15 | 15 | 13 | **14.8** |
| 4 | K: Tiny Racers | 16 | 14 | 15 | 15 | 14 | **14.8** |
| 6 | C: D20 FireVerse | 14 | 15 | 14 | 15 | 13 | **14.2** |
| 7 | **D: Accomplice (ours)** | 13 | 14 | 12 | 14 | 11 | **12.8** |
| 8 | A: Couch Quiz | 14 | 13 | 13 | 13 | 10 | **12.6** |
| 9 | J: RoomRiddle | 13 | 12 | 13 | 13 | 11 | **12.4** |
| 10 | I: Couch Game Studio | 12 | 12 | 12 | 13 | 11 | **12.0** |
| 11 | E: Sealed Case | 11 | 13 | 11 | 10 | 9 | **10.8** |

Our per-criterion averages: Tech 3.8, Design/UX 2.8, Impact 2.4, Idea 3.8.

We placed 7th, down from 16.8 (1st) in round 4. The main cause is the stricter rule this round: every placeholder counts as missing evidence (no video, playtest or Vega numbers). The screenshot defects listed in the packet also cost points.

## Prize picks per judge

| Judge | Fire TV (Vega) | Alexa+ | AWS Builder | Open Source |
|---|---|---|---|---|
| Fire TV VP | H Wick | E Sealed Case | **D ours** | F Flipbook |
| Alexa+ evangelist | H Wick | E Sealed Case | **D ours** | F Flipbook |
| Vega engineer | F Flipbook | E Sealed Case | **D ours** | F Flipbook (D runner-up) |
| AWS lead | H Wick | H Wick | **D ours** | F Flipbook |
| Skeptic | F Flipbook | E Sealed Case | **D ours** | F Flipbook (D runner-up) |

All 5 judges gave us AWS Builder. None gave us Alexa+: Sealed Case won it 4 of 5 even though it has also never been tested on real Alexa+. Flipbook won Open Source 5 of 5.

## Our weaknesses named by judges, ranked, with fixes

1. **No demo video (5/5).** Without a video, judges treat the loop as unproven. *Fix:* record the 3-minute shot list with real friends and phones. Put measured latency on screen, and link the video at the top of the write-up.
2. **Alexa+ appears only in a self-built simulator (5/5).** As a result we lose the Alexa+ prize to a voice-only entry. *Fix:* say plainly that the MCP server runs against real MCP clients, and show it in the video driven by a third-party MCP client as well as the simulator. Lead the Alexa+ pitch with voice-only play, not the board. Otherwise stop competing for Alexa+ and put that effort into Fire TV.
3. **No playtest, so the fun isn't shown (5/5). This is the main reason Impact is 2.4.** *Fix:* run one real session tonight and log one number, for example "4 of 5 groups asked for another case". Add one player quote. Run the blind-player session only if it really happens; otherwise delete that claim.
4. **Visible UI bugs in the screenshots (5/5).** On the reveal proof chain, "Colonel Hargreaves" overlaps "Mysterio". At 200% text, "Objection!" and "Hargreaves" break mid-word. *Fix:* truncate or wrap suspect names in the reveal row, use `overflow-wrap: normal` and `hyphens: none` on headings, and reshoot both sets.
5. **No Vega device evidence (4/5).** The Vega engineer and skeptic noted that the TV stage is React inside Vega and has no device numbers. *Fix:* run it on the Vega Virtual Device and record cold start, memory and frame rate, with a screenshot of the VVD window. Publish a tagged release with the `.vpkg` and a judge `run.sh`, as Tiny Racers and Patch Hours do.
6. **Too many features for the proof behind them (skeptic, plus 2 others indirectly).** *Fix:* cut kids mode, Hindi and the agent host from the main description and keep them as one line under "also". Pitch the single loop.
7. **AWS gaps (no judge named these; seen in the screenshots).** The agent host runs Claude Haiku, not an Amazon model, and the live URL is HTTP. *Fix:* label the agent model as swappable and Bedrock-ready (Bedrock is blocked on the account), and give judges the HTTPS phone URL.

What already works: AWS Builder (5/5 picks) and the Z3 case checking plus measured latency. Judges praised these even while marking the entry down overall.
