# Competitor round 6, Oct 23 2026 (deadline day)

Read-only research. It builds on `COMPETITORS_UPDATE.md` (sweep up to the morning of Oct 23) and `JUDGES_R5.md` (blind panel: Wick 18.4, Flipbook 17.6, Patch Hours 17.2, ours 12.8 in 7th).

Sources used this round:
- Devpost built-with tag pages (alexa, react-native, amazon-web-services, amazon-alexa), newest first. Ids above 1,499,500 gave 47 slugs we had not seen before.
- Devpost search JSON, 32 queries: fire tv, vega, alexa+, mcp, game, party, mystery, accessibility, family, trivia, detective, multiplayer, kids, board game, puzzle, whodunit, murder, suspects, phone controller, game night, plus each rival by name.
- 65 Devpost project pages fetched and parsed. The submission block confirms which ones are entered in amazonappdev2026.
- GitHub (`gh api`, `gh search repos`) and the GitLab API (Alibi's code is only on GitLab).
- YouTube metadata and auto-captions through yt-dlp. Search results sorted by upload date came from the results URL with `sp=CAI%3D`, because the `ytsearchdate` scheme does not work in this yt-dlp build.

Blocks I respected:
- The hackathon project gallery returns 200 but says there are no projects yet.
- The amazon-bedrock, alexa-skills-kit and model-context-protocol tag pages return 404.
- yt-dlp would not load the Couch Quiz and Tiny Racers videos. YouTube oEmbed confirms both still exist, so I did not go further.

---

## Headline

1. **Alibi is new, and it is the most important new entry for us.** It is an Alexa+ detective game where you question the suspects out loud. Every case is proven fair with Z3. The suspects cannot leak the solution, and that is measured with a 300-run adversarial evaluation. Everything is deployed with AWS CDK. It submitted on Oct 22 at 18:58 EDT. It makes three of our claims ("solver-checked cases", "AI suspects that cannot cheat", "CDK deploy"), and its evidence for each is stronger and measured. It is now the favourite for Alexa+, and a serious contender for AWS Builder.
2. **Every Seat** and **Your Own Commentator** are new and serious Fire TV entries. Both lead with measured numbers and use a lot of AWS (AgentCore, Nova, CDK or CloudFormation).
3. **Nothing changed in our genre** apart from StoryQuest (a new video and 14 commits) and Couch Game Studio (agent and design commits late on Oct 22, still no Devpost page or video). RoomRiddle, Couch Quiz, D20 FireVerse, Tiny Racers, Mystery Night and Sealed Case all have identical Devpost text and no new commits since Oct 22 12:00 UTC.
4. **The top three in the R5 panel have not changed since Oct 21** (Wick, Patch Hours) or Oct 15 (Flipbook). What they show the judges is fixed, so we know exactly what we are up against.

---

## (a) New or materially updated strong entries

All entries below are confirmed in amazonappdev2026 through the Devpost submission block, unless noted otherwise.

| Entry | Track and prizes in reach | What it is | How it is built | Evidence | Threat to us |
|---|---|---|---|---|---|
| **Alibi** ([devpost](https://devpost.com/software/alibi-v5mjgt) · [code on GitLab](https://gitlab.com/RaYYeR220/alibi) · [video 2:55](https://youtu.be/0xgwrl7HppU)) | Alexa+, AWS Builder (Apache-2.0, so possibly Open Source too) | Voice detective game around an Echo Show: question 3 to 5 suspects in your own words, search rooms, show evidence and watch a lie break (in a recorded voice). It has a red-string case board, lab results that arrive "tomorrow" through EventBridge Scheduler, a simulated in-conversation checkout for more cases, and custom cases starring your family. | A deterministic disclosure engine (open, guarded, locked and solution facts) means the voice model never holds the answer, and a fail-closed output guard checks every reply. A Z3 prover checks one provable culprit, that talking alone cannot solve the case, that the key evidence is needed, and that every lie can be exposed. 11 MCP App views, two-tier OAuth, UCP checkout. Lambda, DynamoDB, Cognito, S3, Step Functions plus Strands, AgentCore Identity, Polly, CDK. | Live MCP endpoint and a browser smart-display simulator. 243 ms p95 per tool call, deployed. A 300-run attack evaluation against a baseline (baseline leaked locked facts in 3 runs, Alibi in 0 out of 1,800 turns). 2,000 random sessions per case. A custom case built in 5 min 44 s live. 89 commits from Oct 20. **Limits it states:** Alexa+ is simulated, the model is an OpenAI-compatible API (no Bedrock access), and the GitHub account is "under review", so the code is only on GitLab. The video has 0 views. | **Very high on Alexa+ and high on AWS Builder.** It covers the same "fair, leak-proof AI mystery" ground as us, with stronger measurements. What it lacks: it is not multiplayer with private roles, has no hidden human, no Fire TV and no phones. |
| **Every Seat** ([devpost](https://devpost.com/software/every-seat) · [repo](https://github.com/zion-off/every-seat) · [video 2:51](https://youtu.be/5a1ERC8vv6E)) | Fire TV, AWS Builder, Open Source | A film player that adapts each film for the whole couch at once. It dims strobes in advance, switches to a comfort audio track for loud moments, gives a 5-second heads-up before scares, and plays timed audio description on a blind viewer's own phone. An MCP voice companion sets who is watching. | It defines a new open cue format, SenseVTT (on npm). Detectors (ffmpeg, EA IRIS on Fargate) plus a Strands agent on Nova Pro inside AgentCore Runtime write the cues, and Polly speaks the descriptions. Vega app built on W3C media and Shaka. CDK. | A strobe goes from IRIS FAIL (0.33) to PASS (0.071). Dim timing within about 20 ms of plan, measured frame by frame on the VVD. A 90-second clip runs through the pipeline for about $0.03. Repo created Oct 23 02:43Z (100+ commits). Video uploaded Oct 23. | **High for Fire TV and AWS Builder.** It also takes the "a blind viewer can join the group" point we make. |
| **Your Own Commentator** ([devpost](https://devpost.com/software/your-own-commentator) · [repo](https://github.com/UgaTheDev/your-own-commentator)) | Fire TV, AWS Builder | Pick from 7 commentators (rookie, kid, a two-voice booth, fantasy, plus Spanish, Hindi and Mandarin) for a recorded basketball game, switching mid-play. Ask "why?" by phone and get a spoken answer in about 3 seconds. Also recaps, replays with tracked players, and a watch party. | Vega app. Nova Pro reads events and the score graphic, Nova 2 Lite writes lines and judges them, Nova 2 Sonic does speech recognition, Polly gives 8 voices. RF-DETR plus ByteTrack tracking. ECS, API Gateway WebSocket, CloudFormation. | Code checks on numbers, plays and jerseys: invented plays fell from 20 of 300 lines to 0 of 494. It reports its own failures, such as Nova Pro video-only precision of 0.03. VVD build. 100+ commits since Sep 26. | **Medium-high.** Same prize pool, with very strong measured grounding. |
| **Shout Out Games** ([devpost](https://devpost.com/software/shout-out-games) · [video 2:22](https://youtu.be/RLzJI1X0tt0)) | Fire TV | 12 voice party games. Scan a QR code and the phone becomes the microphone: scream, sing a pitch or say words. One of them, *The Imposter*, has players find the imposter among four AI animal suspects. | Plain JavaScript in a Kotlin WebView on Fire OS. Phone audio is analysed with Web Audio and sent over WebRTC, with a relay as fallback. OpenAI models for 3 games. | Video with real voices and real phones. Tested on a real stick ("most of our Fire TV bugs only appeared on the stick"). No public repo. Adapted from the team's existing website games. | **Medium** for the "Fire TV party game" slot. It is noisy and fun on camera, but not Vega and not AWS. |
| **Plot Speaks** ([devpost](https://devpost.com/software/plot-speaks) · [repo](https://github.com/volocent/plotspeaks) · [video 2:45](https://youtu.be/X4eQEYynFUY)) | Alexa+ | Bring your own AI: you connect your existing assistant (Claude or Gemini today, Alexa+ "as soon as the preview opens") to an MCP server that runs murder mysteries, trivia and story games. The server holds the answer key. | Cloudflare Workers, D1, Workers AI, MCP Apps, Google sign-in. AGPL. | Live site, video, 40 commits. Echo Show is shown only as a concept. | **Low-medium.** It is another "the server holds the truth" mystery, but not on AWS. |
| **Doodle Theater** ([devpost](https://devpost.com/software/doodle-theater) · [video 2:52](https://youtu.be/Wq8gsPuDpx8)) | Fire TV, AWS Builder | A child's drawing is photographed and rigged into a 16-joint puppet that acts out a branching bedtime story narrated by Polly. Stage directions fire on their cue words. | Compose for TV (Fire OS). OpenCV rigging. A Strands agent on Bedrock writes the story, with Bedrock Guardrails. | 58 views (high for this field), CI tests, v1.0.0 release. | **Medium.** Delightful and emotional. Seen in the Oct 22 YouTube scan, but never written up. |
| **Couch Coach** ([devpost](https://devpost.com/software/couch-coach-31odap)) | Fire TV, AWS Builder | The phone is the camera and the Fire TV is the coach. It shows a live skeleton, counts reps, scores form, and a spoken AI coach remembers each family member. | Expo, react-native-tvos (Fire OS), MediaPipe on the phone, AppSync Events, Bedrock (Claude Haiku), Polly, CDK. | **Shown on a real Fire TV Stick (3rd gen).** 35 commits. | Medium-low. It is fitness, not games, but follows the same phone-plus-TV pattern. |
| **Thodu TV** ([devpost](https://devpost.com/software/thodu-tv)) | Fire TV | An accessible TV for older and disabled people. Switch scanning, large tiles, Hindi and Telugu, and a one-press Help that reaches family. | React Native TV on Amazon's multi-TV sample, ntfy alerts. | 223 tests, a judge release, recorded on an Amazon Fire TV cloud device. | Low-medium. Accessibility, a different genre. |
| **StoryQuest** (update) | Fire TV | Same product as before (family films where you choose the path). | Since the last sweep: a new demo video (Oct 22, 2:54), age-appropriate dialogue, approved scripts for the family's own ideas, clips preloaded, and the website linked to the code. | 14 commits since Oct 22 12Z. Releases for 3 stick models plus the VVD. In-App Purchasing. | Medium-high (unchanged rating, stronger evidence). |
| **Couch Game Studio** (update) | Fire TV, AWS Builder, Open Source | Same product as before (kids invent games out loud). | Since the last sweep: the Game Director now runs on Bedrock Mantle (Qwen3 235B), there is a VVD test checklist, a navy and gold design pass, Docker and CI. | Repo last pushed Oct 22 22:35Z. **Still no Devpost page and no video found.** | High only if it gets submitted. |

Other new entries in the window, not game threats: Kitchen Table, Hearth (two different entries), Homebase, DoseWise, PACT, Amma's Hour, Board Clerk, Attic, Imali, Outing Copilot, Corral, Kodra and Match Night Copilot (all Alexa+ assistants). Also PressPath TV (adaptive D-pad navigation, 3 commits), Amazon LookUp (shoppable X-Ray), WatchParty AI, FamilyFlow AI, FocusTV and Wander TV. Ludo King Pro and "Interactive Educational Quiz / Game" are entered but weak (a plain APK on Google Drive, and a text-only page).

Not in this hackathon: Whodunit, Verdict: The AI Detective, Infinite Mysteries, CaseZero, Murdoria and Cold Case (YouTube, March 2026).

---

## (b) Deep dives: why they score, and their honest weaknesses

### Wick (R5: 18.4, ranked 1st)

**Status:** Devpost page created Oct 21. Last commit Oct 21 21:17Z: "Wick ran on a real Fire TV Stick". Release v1.2.1 has vpkg files for 3 architectures plus a Fire OS APK and SHA256SUMS. Video (3:04, 7 views) has chapters in its description. 989 commits, one author, since Sep 14.

**Why judges rate it high:**
- **A human anchor in the first screen.** The README quotes "a real door, October 2026": a 79-year-old with memory loss and her daughter in Italy, from one conversation. The daughter "liked two things most: the door card and the notes". It is one interview, but it is concrete, has a date and is credited, so judges read it as real-user validation.
- **Scale numbers in the first 15 seconds of the video**: "1 in 6 over 60 by 2030", "~900,000 deaths a year linked to loneliness", "250M+ Fire TV sold". It also cites BLS for "4+ hours of TV a day".
- **Real hardware on camera**: it unboxes a Fire TV Stick 4K Select at 1:05. No other top-three entry shows hardware.
- **A measured table, with the tool named for each number**: door to card 2.3 s median, Vega cold start 722 ms mean over 10 runs (`vega exec perf kpi-visualizer`), 64 MiB PSS, MCP p95 230–241 ms against Alexa's 500 ms target.
- **A "What is real, and what is simulated" table.** It says exactly what was never seen on hardware (a Ring doorbell, "Alexa, pause"). Being honest about this makes the remaining claims more believable.
- **It uses every Amazon surface** (Vega and Fire OS, Ring, Alexa+ over MCP, AgentCore, Strands, Step Functions, Terraform over OIDC), plus a "Why Amazon" table showing that only Amazon has all three.
- **It gives back to the platform**: an npm package `vega-calm-ui` and a pull request to Amazon's AgentCore SDK.
- **Story discipline**: every feature is described as "what she sees" and "what it never does".

**Honest weaknesses:**
- It has only one real-user data point (an interview, not a usage session) and a six-week simulated household.
- The door, its centrepiece, depends on Ring webhooks it never received (it used a stand-in doorbell). Notes only appear while Wick is in front, so in normal TV watching they wait.
- The scope is huge (3 core features plus "sixteen on top"), so a skeptic can call it sprawl.
- It is not entertainment, which matters if the Fire TV judges reward fun.
- **What we can exploit:** we can beat it on *real people using the thing*. One recorded session with real players and logged outcomes is stronger user evidence than one interview. Wick's evidence that her life improves is a single quote.

### Flipbook (R5: 17.6, ranked 2nd; won Open Source in 5 of 5 judge picks)

**Status:** created Oct 12. Last real commit Oct 15. Video 2:54 (Oct 13). MIT-0. 448 tests. CI, CodeQL, gitleaks. A landing page and a pitch deck.

**Why judges rate it high:**
- **One press, one payoff, shown in the first 10 seconds** ("you land just before the first goal... You saw the goal before the score"). The problem fits in one sentence, and everyone has spoiled a score by scrubbing.
- **A clever use of something already on the device**: it reads the BIF trickplay file the Vega player already downloads, with no video decode and no model. Judges reward "used the platform in a way Amazon did not think of".
- **Engineering rigour you can audit**: pre-registered parameters with a sha256, a held-out match, 95% confidence intervals, a fair baseline (a plain frame differ fires 237 false markers), and an `evidence/` folder behind every number.
- **An "Honest limits (9)" list** that names the limits before a judge can (VVD only, AI-labelled truth, a small sample).
- **Platform citizenship**: it found a header defect in Amazon's own sample BIF (the multiplier is 0xFFFFD8F0), filed an upstream issue, and keeps a 19-entry friction log. It also used Kiro and the Amazon Devices Builder Tools MCP, and records where they failed.
- **The Open Source case is the README itself**: badges, a security policy, Dependabot, "attacks defeated" with a test line for each.

**Honest weaknesses:**
- It never ran on Fire TV hardware.
- Its accuracy rests on 3 held-out goals labelled by AI (the confidence interval runs from 0.094 to 0.992).
- It has no AWS at all, so it cannot compete for AWS Builder.
- Its audience is narrow: amateur full-match replays with a BIF file and a fixed score graphic.
- It has had no updates in 8 days.
- **What we can exploit:** nothing directly on Fire TV, because it is a different genre. On Open Source, fairplay can match its *form*: badges, CI, a test count, an evidence file, a "use it in your own game" example and honest limits. Our use case is broader (any deduction game).

### Patch Hours (R5: 17.2, ranked 3rd)

**Status:** repo created Oct 21 15:32Z. 26 commits in one day. Last commit Oct 21 19:34Z. Video 2:43 (1 view). Release v1.0 with `patch-hours-fire-tv.zip` and `./run.sh`. Live site with a "scripted run" for judges who have no phone.

**Why judges rate it high:**
- **A sharp, cited medical problem in the first sentence**: "In 152 children ... mean compliance was 44%" (Wallace et al., IOVS 2013), plus a 2026 review. The impact is easy to believe.
- **A mechanic that is the product**: the reward (the cartoon) is the reminder. "Nobody has to nag." The idea is clear in one line and it is shown working on camera within 1:12.
- **It measures itself on camera**: "It measures its own delay, 1.5 seconds". A hand over the eye is refused.
- **Privacy by construction, stated as a rule**: only on/off plus confidence leaves the phone, and the API rejects any other field or any body over 512 bytes.
- **It is easy to run as a judge**: a one-command VVD zip, a scripted phone stand-in, and `vvd-kit` (a doctor tool it released for other Vega builders).
- **A "What's real and what's simulated" table**, and a Limits list.

**Honest weaknesses:**
- VVD only, and the demo face is synthetic: there are no children and no families.
- Precision and recall are measured on frames from the same session (it admits these are an upper bound).
- AWS is thin: Bedrock is reached through Vercel AI Gateway because the model quota was 0, plus a guardrail, Polly and S3.
- The Fire TV app does not speak the pause prompt (an audio player froze it), and pairing does not survive a restart.
- The repo was built in one day.
- **What we can exploit:** its strength is a cited problem plus one clear loop. We can copy that structure: one cited problem, one loop, one measured number on screen. We can beat it on real users, because it has none.

### Sealed Case for Alexa+ (R5: 10.8 overall, but won Alexa+ in 4 of 5 judge picks)

**Status:** one commit, Sep 28. Devpost created Sep 27. Video 87 s, no narration, 7 views. 13 tests. It has not changed since.

**Why judges rated it high for Alexa+:**
- **It names the structural problem precisely**: "If the script is in the model's context, the model knows who did it. You can't instruct that away." MCP is presented as the fix itself, not as an add-on.
- **The proof is a test, not a claim**: a differential test replays 1,200 random tool calls against a copy with a different culprit, and responses must be byte-identical before an accusation. The authors planted two leaks to show the test catches them.
- **Voice-first design details**: a `speech` field of at most 2 sentences on every result, testimony quoted word for word, a misheard question does not use up a turn, and the accusation is read back with a two-step "yes".
- **It is purely Alexa+**: no screen to distract, so the judges read it as "made for voice".
- **It says exactly what was reused** from the earlier WebMCP game.

**Honest weaknesses:**
- It has never been tested on Alexa+ or the MCP Inspector, by its own statement.
- One case, one player, one commit, a terminal-only video, and the engine was reused.
- **It is now superseded by Alibi**, which makes the same structural argument with a measured adversarial evaluation, Z3 fairness proofs, MCP Apps, account linking, checkout and AWS. If the judges see both, the Alexa+ prize most likely moves from Sealed Case to Alibi, not to us.
- **What we can exploit:** neither Sealed Case nor Alibi is a group game with hidden roles. Our Alexa+ pitch only works as "the voice host for a party game where one of your friends is lying". We cannot win as "an AI mystery that can't cheat", because two entries already own that and Alibi measured it.

### What the top three have in common (the pattern to copy)

1. A problem stated in one sentence with a number and a source.
2. A demo video of 2:40 to 3:05 whose first 10 seconds show the payoff, with a chapter list in the description.
3. A "What is real / what is simulated" table and a numbered list of honest limits.
4. A table of measured numbers that names the tool or file each number came from.
5. A one-command way for a judge to run it on the VVD (a tagged release with vpkg and a script), plus a browser fallback.
6. One human element: an interview (Wick) or a cited cohort (Patch Hours). Flipbook has none, and relies on rigour instead.
7. A friction log, and something given back to the platform (an upstream issue, an npm package, a toolkit).

---

## (c) Top 10 threats: neutral descriptions for a blind packet

All are written in the same form (what it is, how it works, how it is built, evidence, limits), at about 120 words each.

**1. Wick** (Fire TV, Vega and Fire OS; AWS Builder; Open Source)
A Fire TV home screen for an older person living alone, shared with her family. When the Ring doorbell rings, a card with the camera picture and a one-sentence description appears over her film in about 2.3 seconds. Family notes wait for a measured quiet point in the film, and she answers each with one button. Relatives use a simulated Alexa+ surface that calls a 26-tool MCP server, and an AgentCore agent proposes errands she must confirm. Built with React Native for Vega, Strands, Bedrock, Step Functions and Terraform. Evidence: a 3-minute video on a real Fire TV Stick 4K Select, VVD cold start of 722 ms and 64 MiB of memory, tagged releases, live web builds, about 989 commits, and one interview with a mother and daughter. Ring hardware and real Alexa+ were not tested.

**2. Flipbook** (Fire TV, Vega; Open Source)
A feature for the Vega video player that jumps to just before the next score change in a sports replay without revealing the score. It reads the trickplay thumbnail file the player already downloads. The user draws a box once around the broadcaster's score graphic, and Flipbook marks each change that holds. Scrub previews hide the score. No video is decoded and no AI model is used. Built on Amazon's Vega video sample in React Native and TypeScript. Evidence: a 2:54 video on the Vega Virtual Device, 448 passing tests, CI with CodeQL, an evidence folder behind each number, device timings over 19 relaunches, and a held-out test in which 2 of 3 goal jumps landed before the play. It was not run on Fire TV hardware, its test labels were made by AI, and it has no cloud backend.

**3. Alibi** (Alexa+; AWS Builder)
A voice detective game for Alexa+, played around an Echo Show. Players question three to five suspects in their own words, search rooms and confront suspects with evidence. A rule-based engine decides what each suspect may reveal, so the voice model never holds the solution, and an output filter blocks facts the player has not earned. Each case is checked with the Z3 solver to show that one culprit can be proven and every lie exposed. It includes on-screen card views, account linking, a simulated checkout for more cases, and custom family cases generated in under six minutes. Built with TypeScript, Python, Lambda, DynamoDB, Step Functions, Polly and CDK. Evidence: a 2:55 video, a live endpoint and browser simulator, 243 ms p95 latency, and a 300-run adversarial evaluation. It was not tested on real Alexa+, and it uses a non-Amazon model.

**4. Patch Hours** (Fire TV, Vega)
A Fire TV app for children prescribed an eye patch for amblyopia. A parent's phone camera checks that the patch is on, using a small classifier trained on the phone in a few seconds. The cartoon on the TV plays only while the patch is visible and pauses about 1.5 seconds after it comes off. Worn minutes are logged. Each week, Amazon Nova writes a note for the eye clinic, which is checked against the logged numbers and screened by a Bedrock guardrail, and Polly records a cheer for the child. Built with React Native for Vega, Next.js, MediaPipe and CloudFormation. Evidence: a 2:43 video, a live site with a scripted demo, a one-command install for the Vega Virtual Device, and cited adherence research. Tested on the virtual device only, with a synthetic face rather than real families.

**5. Every Seat** (Fire TV, Vega; AWS Builder; Open Source)
A Fire TV film player that adapts each film for everyone watching together. A cloud pipeline runs loudness, cut and flash detectors and an Amazon Nova agent to write a cue file in a new open format, SenseVTT, that marks flashes, sudden loud moments and scares. During playback the app dims strobes in advance, switches to a softer audio track, gives a five-second warning before scares, and plays timed audio description on a blind viewer's own phone. A voice companion records who is on the couch. Built with React Native for Vega, Strands on AgentCore, Nova, Polly, Fargate and CDK. Evidence: a 2:51 video, dimming timed frame by frame on the Vega Virtual Device, one strobe moved from fail to pass in EA's IRIS analyzer, and a published npm package. Submitted a few hours before the deadline.

**6. StoryQuest** (Fire TV, Vega)
An interactive family film app for Fire TV. Each chapter is about a minute of AI-generated video with spoken dialogue. The family picks the next path with the remote or speaks its own idea, which is screened and turned into an approved script before the next chapter is generated. Dialogue and pacing adjust to the audience, from simple lines for young children to fuller scenes for adults. Finished stories can be shared with a QR code. Built with React Native for Vega, a Fastify server, a language-model story director and a hosted video model, with Amazon Bedrock as an optional provider. Includes Amazon In-App Purchasing for custom chapters. Evidence: a 2:54 demo video, a live website, install packages for three Fire TV Stick models and the virtual device, and active development through the final day.

**7. Your Own Commentator** (Fire TV, Vega; AWS Builder)
A Fire TV app that lets each viewer choose a commentator for a recorded basketball game: a rookie who explains the rules, a kid voice, a two-voice booth, a fantasy analyst, and versions in Spanish, Hindi and Mandarin, switchable mid-play with the remote. Viewers can pause and ask "why?" from a phone and hear an answer in about three seconds. It also offers recaps, replays with tracked players, and a watch party. Every spoken line must pass code checks on numbers, plays and jersey numbers before it is voiced. Built with React Native for Vega, Amazon Nova models, Nova Sonic, Polly, an open-source player tracker, ECS and CloudFormation. Evidence: a demo video, a Vega Virtual Device build, and a measured drop in invented plays from 20 of 300 lines to 0 of 494. Uses amateur footage only.

**8. Don't Go To Bed: Tiny Racers** (Fire TV, Vega)
A top-down party racing game that runs locally on Vega OS. Players scan a QR code on the TV and steer with a phone or tablet browser. Up to four people race, and bots fill the field to eight. It has five household-themed tracks, nine characters, power-ups, drafting and ramps, and the team reports tuning the controls after testing with children. Built with React Native for Vega and a game engine compiled with TeaVM, with Cloudflare Workers and Durable Objects relaying controller input. Evidence: a public repository with a judge setup guide, a tagged judging release, and a demo video. It has no AI features and no AWS backend. The last change was on October 20.

**9. Couch Game Studio** (Fire TV, Vega; AWS Builder; Open Source)
A tool for children to invent video games on the TV. A child speaks or types an idea on a phone, or photographs a drawing to use as the hero. An agent on Amazon Bedrock, built with Strands, fills in a strict game specification. Simulated players then test the game, and difficulty is adjusted until children usually win. The model never writes code. The TV runs four game types with modifiers, up to four phones join as controllers, and remixes are spoken aloud. Built with React Native for Vega, Node, Bedrock and Docker, with an offline fallback. Evidence: a public repository with server, engine and Vega tests, CI, and a test checklist for the Vega Virtual Device. No Devpost page or demo video was found.

**10. Sealed Case for Alexa+** (Alexa+)
A one-player, voice-only murder mystery for Alexa+, served from a self-hosted MCP server. The assistant acts as game master: it searches places, questions suspects, quotes testimony word for word, and reads an accusation back before grading it once the player confirms. The solution stays inside the server process. A test replays 1,200 random calls against a copy of the case with a different culprit and shows that every response is identical until an accusation is made. The case and engine come from the authors' earlier browser game; the server and voice layer are new. Built with Node.js and the MCP SDK. Evidence: a public repository with 13 tests and an 87-second video without narration. One case, one commit, and not tested on real Alexa+.

Next five, if the packet needs more: Doodle Theater (Fire TV, drawing becomes a puppet in a story), D20 FireVerse (Fire TV tabletop RPG), RoomRiddle (Fire TV co-op AI mystery, our closest genre rival), Shout Out Games (Fire TV voice party games on a real stick), Couch Coach (Fire TV fitness, real stick).

---

## (d) Concrete moves for Accomplice in the remaining hours

These are ordered by points per hour. Each comes from what the leaders show and we do not.

1. **Ship the video before anything else, and copy the structure the leaders use.** All three leaders have a video of 2:43 to 3:04 that shows the payoff in the first 10 seconds and has chapters in the description. Every R5 judge marked us down for having no video. Open on the human moment: a suspect cracks, or the accomplice is caught, with real people reacting. Show "one press: Fire TV app on [VVD or stick]" on screen, as Wick and Patch Hours do. Put chapters in the YouTube description and put the link in the first line of the Devpost page.

2. **Record one real session and log it from the server, not from memory.** None of the top three has a real usage session: Wick has one interview, Patch Hours uses a synthetic face, Flipbook uses AI labels. If we play even 2 or 3 games with real people tonight and publish what the server logged (cases played, solved or not, rounds to solve, whether the accomplice was caught, mean answer latency), we become the only entry in the top group with real players as evidence. Add one player quote, with permission. Do not claim the blind-player session unless it actually happens.

3. **Stop leading with "solver-checked, leak-proof AI suspects". Alibi now owns that claim, with stronger measurements.** Lead with what only we have: *one of your friends is secretly working with the killer, and the solver guarantees the case can still be solved despite their sabotage*. Z3 checking the human accomplice's sabotage and the Objection slip is unique: Alibi and Sealed Case prove fairness only for a single, cooperative player. Put that sentence in the tagline and in the AWS Builder and Open Source write-ups.

4. **Add the two tables every leader has.** (a) "What is real and what is simulated", one row each for the Fire TV app (VVD build), phones, Alexa+ (MCP server reached by the simulator and third-party MCP clients), AWS (deployed), and players. (b) "Measured", where each row names the command or file behind it: the VVD cold start and memory we have just recorded, MCP turn latency, Z3 checks per case and rejection rate, and test counts. Add a numbered "Honest limits" list. Patch Hours and Flipbook show that this raises believability and does not cost points.

5. **Make judge setup a single command, as Patch Hours, Wick and Tiny Racers do.** We already have release packages and a judge run script (commit `4f33d75`). Publish them as a tagged GitHub release with the `.vpkg` files, `run.sh` and SHA256 checksums, and link it next to the HTTPS phone URL at the top of the testing instructions.

6. **Bring fairplay's README up to Flipbook's standard for Open Source.** Flipbook won Open Source 5 of 5 on form: CI badges, a test count, an evidence folder, a security file and honest limits. Add CI and test badges to fairplay, a 10-line "verify your own deduction puzzle" example, the 28-test count, a tagged v1.0.0, and one line on what it proves that a Z3 one-off does not (sabotage-robustness and solvability by a given round). Remember that Alibi's Apache-2.0 case prover will also be judged here.

7. **Shrink the Alexa+ pitch or drop it.** Alibi has MCP Apps, account linking, checkout and a 300-run evaluation. We cannot outdo that today. Either pitch the Alexa+ add-on in one paragraph as "the voice host for a group game with hidden roles", which neither Alibi nor Sealed Case is, or spend that write-up effort on Fire TV. Do not claim anything about Alexa+ that we have not shown with a real MCP client.

8. **Open the Devpost page with one cited problem line, as Patch Hours and Wick do.** Use a factual hook that can be sourced. For example, Sealed Case's own framing: party mysteries need a host who never gets to play, so the AI host lets everyone play, including the one who is lying. If we use a number, cite it (for example a source on time families spend together in front of the TV). Do not make one up.

What not to spend time on: new features, kids mode, Hindi, extra cases. Every leader wins on evidence for one loop, not on breadth. Wick's breadth is the most common criticism a skeptic would make of it.
