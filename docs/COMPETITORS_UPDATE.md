# Competitor refresh, Oct 23 2026 (final day)

Scope: what appeared or changed since the night of Oct 22. Read-only research.

Sources:
- Devpost built-with tag pages (alexa, react-native, amazon-web-services, amazon-alexa), newest first, with ids above 1497849. That gave 60 new pages.
- Devpost search JSON for: Fire TV, Vega, Alexa, Alexa+, MCP, Ring, Bee, game, mystery, detective, party, accessibility, blind. Plus targeted queries: whodunit, murder mystery, trivia, family game night, phone controller TV game.
- GitHub `gh search repos` for repos created on or after Oct 21.
- YouTube search sorted by upload date (yt-dlp).

Notes on method:
- The HTML search page returned 403, so I used the JSON endpoint instead. I did not try to get around the block.
- Tag pages for fire-tv, vega, alexa-plus and mcp return 404 because those tags are not recognized. Entries using only those tags were found through search.

## Headline

No new entry combines voice-questioned AI suspects, solver-checked cases and a hidden human accomplice. The closest rivals in format (RoomRiddle, Couch Quiz, Sealed Case, Mystery Night) have had no commits since Oct 22 12:00 UTC.

Two entries are new to our radar and matter:
- **Couch Game Studio** (GitHub only so far): a Fire TV game in the same Fire TV + AWS Builder + Open Source combination as us.
- **StoryQuest** (Devpost): a polished family Fire TV experience.

## New strong entries (since Oct 22 night)

| Entry | URL | Track | Mechanic | Quality evidence | Threat |
|---|---|---|---|---|---|
| Couch Game Studio | [repo](https://github.com/priteshvirat24/couch-game-studio) (no Devpost page found yet) | Fire TV (Vega), plus AWS Builder and Open Source | Kids describe a game by voice or text, or photograph a drawing. A Strands "Game Director" agent on Bedrock fills a validated GameSpec, robot players playtest and balance it, and the game plays on the TV with the D-pad. Phones join as co-op controllers (up to 4 players). Remixes are spoken. | Repo created Oct 22 20:29Z, last push 22:07Z. Detailed README with screenshots and architecture. 22 server tests plus Vega lint and Jest. Offline fallback. Apache-2.0. | **High.** It goes after the same Fire TV living-room game prize and the same two mini challenges. Its agent story is strong (a tool-using agent playtests its own output) and it is easy to grasp in a demo. Its weakness: it may not be submitted yet, and it has no demo video. |
| StoryQuest | [devpost](https://devpost.com/software/storyquest-l2k9of) · [repo](https://github.com/inventionsbyhamid/storyquest) · [live](https://storyquest.dijmo.com) | Fire TV (Vega) | Family choose-your-path AI films. Each chapter is 3 × 15 s generated video clips (fal MiniMax), and the family picks the next path with the remote or speaks its own idea. QR share of the full story. | React Native for Vega, real Amazon In-App Purchasing (Sparks), kid-safety checks, Bedrock as an optional model provider. Live site, demo video, commits through Oct 22 20:09Z. | **Medium-high.** It is a family Fire TV entertainment product with a business model and strong visuals. It is not a game of deduction and gives no fairness or accessibility proof. |
| Goodnight TV | [devpost](https://devpost.com/software/goodnight-tv) | Fire TV (Vega) | A bedtime routine that dims the TV step by step for kids. | RN for Vega + AWS, video, clear real-world problem. | Low-med. It competes for Fire TV prize slots but in a different genre. |
| Aside | [devpost](https://devpost.com/software/aside-an-ai-that-watches-with-you-and-never-spoils) | Fire TV | Spoiler-free "what just happened / who's that / describe the scene" for a film. | Live TV web build, repo, video. It includes a blind and low-vision "describe the scene" mode. | Low-med. It overlaps our accessibility claim on Fire TV. |
| WordWatch | [devpost](https://devpost.com/software/wordwatch) | Fire TV (Vega) | Pause, D-pad onto a subtitle word, get definition, translation and pronunciation. | Strict TS, Jest, Bedrock Nova Lite content pipeline. | Low. |
| AccessFlow | [devpost](https://devpost.com/software/accessflow-adaptive-navigation-for-fire-tv-accessibility) | Fire TV | Adapts D-pad navigation paths for users with motor impairments. | Repo and demo page. | Low. It is accessibility work, but on a different axis (motor). |
| Porchlight | [devpost](https://devpost.com/software/porchlight-9uw5q2) | Ring (+ Alexa+, Fire TV) | Learns an elder's normal day from Ring Event History and flags when expected events are absent. | Kotlin Compose for TV, Strands, Bedrock, WebRTC. | Low (other track). |
| Muni | [devpost](https://devpost.com/software/muni-gsjtny) | Multi-device | Tracks spoken promises and closes them with Ring, Fire TV and AWS evidence. | Rich demo, real AWS EventBridge. | Low (other track). |
| FireSpot, FireTouch NEXUS, Sync.Audio | [FireSpot](https://devpost.com/software/firespot-72hx6m) · [NEXUS](https://devpost.com/software/firetouch-nexus) · [Sync.Audio](https://devpost.com/software/sync-audio) | Fire TV | Retro emulator launcher, a touchscreen-remote design concept (Canva, no code), and multi-headphone audio sync. | Weak or concept-level. | Low. |

New Alexa+ entries in the same window are mostly productivity and care assistants: Hearth, AURA+, Cappy, Livevault, Swaddle, HomeMend, ScamSentry and others. None is a game.

Seen in this sweep but posted before Oct 22: Fire TV and Alexa+ party or family games that were already in the Oct 22 crawl but not on the hand-tracked rival list. Recorded here for completeness:
- HeyTrivi.app ([devpost](https://devpost.com/software/heytrivi)): Alexa+ as a family trivia host. It judges simultaneous spoken guesses and keeps a lasting score. Built with Nova, Polly and Lambda.
- Don't Go To Bed: Tiny Racers ([devpost](https://devpost.com/software/don-t-go-to-bed-tiny-racers)): a top-down party racer on Vega for up to 8 entrants, with phones as steering wheels.
- Meme Mimic ([devpost](https://devpost.com/software/meme-mimic)): Vega party game where players copy GIPHY memes, phones vote, and Polly voices the host.
- HearthCast TV ([devpost](https://devpost.com/software/hearthcast-tv-fire-tv-vega-os-family-game-night)): 4-seat trivia and story theater.
- Fire Motion, Fire Beats and WandDuels: phone-as-camera or phone-as-wand motion games.
- Connect Four AI ([devpost](https://devpost.com/software/connect-four-ai-for-fire-tv)): shows the AI's win-chance bars.
- The Last Light ([devpost](https://devpost.com/software/the-last-light-w7z18i)): co-op space-rescue decision game on Android TV.

Known rivals, checked for changes: RoomRiddle (last push Oct 20), Couch Quiz (Oct 18), Sealed Case (Sep 28) and Mystery Night (Oct 20) have no new commits since Oct 22 12:00 UTC. No material change.

Off-hackathon (not threats): Whodunit (Jac, Sri Lanka hackathon) and Afterfall (Knight Hacks) are AI interrogation games but are not in amazonappdev2026.

## Top 8 threats overall: neutral descriptions

Written for a blind judging packet: what it is, what it does, how it is built, and the evidence.

**1. RoomRiddle** (Fire TV, Vega)
A cooperative murder-mystery game for Fire TV. The TV shows an illustrated crime scene and story. Each player joins from a phone, which works as a private notebook, and the group investigates together. Players question AI-driven suspects by typing; the suspects reply in synthesized voices and are guarded so they do not reveal the solution. The game ships with five authored cases and painted 2.5D art. It uses a third-party LLM (Groq) and Edge TTS. Evidence: public repository with CI, formally submitted Devpost page and a demo video. No commits since Oct 20.

**2. Couch Game Studio** (Fire TV, Vega; AWS Builder; Open Source)
A tool for kids to make video games on the TV. A child speaks or types a game idea on a phone, or photographs a drawing to use as the hero sprite. An agent on Amazon Bedrock, built with Strands, writes a structured game specification, has simulated players test it, and adjusts difficulty before play. The TV runs four genres with modifiers on the D-pad, and up to four phones join as controllers. Evidence: public repository created Oct 22 with tests, screenshots and an offline fallback. No Devpost page or video found yet.

**3. StoryQuest** (Fire TV, Vega)
An interactive family story app for Fire TV. Each chapter is about a minute of AI-generated video with sound and spoken lines. The family chooses the next path with the remote, or speaks its own idea, and the next chapter is generated in seconds. Finished stories can be shared through a QR code. Built with React Native for Vega, a Fastify server, a language-model story director and a hosted video model. Includes kid-safety checks and Amazon In-App Purchasing for custom chapters. Evidence: live website, public repository and demo video.

**4. D20 FireVerse** (Fire TV)
A tabletop role-playing one-shot, compatible with 5th edition rules, played on Fire TV. One to three players, possibly in different homes, join a room using the D-pad or a phone that becomes a controller and character sheet. An authoritative server handles movement, combat, checks and every dice roll, and the TV animates each roll and narrates scenes with per-character voices and synced subtitles. Built as a TypeScript monorepo with PixiJS and Three.js inside a Kotlin WebView app, plus local Kokoro TTS. Evidence: public repository, downloadable APK, website and demo video.

**5. Couch Quiz** (Fire TV, Vega)
A family quiz game for Fire TV. The D-pad on the TV picks a topic and difficulty, including a kids mode, or a custom topic. Players join by QR code on their phones without installing an app, and each phone becomes a private four-button answer pad. An AI host on Amazon Bedrock generates questions on any topic and comments on answers, and faster correct answers score more. Built with React Native for Vega, API Gateway, Lambda and DynamoDB. Evidence: public repository and demo video of about three minutes. No commits since Oct 18.

**6. Wick** (Fire TV, Vega; Alexa+; Ring)
A Fire TV home screen for an older person living alone, managed with family. Ring doorbell events appear as cards over whatever is playing, and family notes wait for a natural pause before showing. Weekly summaries are written from counted facts and checked by guardrails, and an AgentCore agent proposes errands that she confirms. A large-text, high-contrast mode is enforced throughout. Built with React Native for Vega, Strands, Bedrock AgentCore, Step Functions, Rekognition and MCP. Evidence: about 989 commits, a published npm UI package, live web builds and a real-device demo.

**7. Don't Go To Bed: Tiny Racers** (Fire TV, Vega)
A top-down party racing game running locally on Vega OS. Players scan a QR code on the TV and steer with a phone or tablet browser. Up to four humans race, and bots fill the field to eight. There are five household-themed tracks, nine characters, power-ups, drafting and ramps. The controls were tuned after testing with children. Built with React Native for Vega and a TeaVM-compiled engine, with Cloudflare Workers and Durable Objects relaying controller input. Evidence: public repository with judge setup instructions, a tagged judging release and a demo video.

**8. Sealed Case for Alexa+** (Alexa+)
A single-player, voice-only murder mystery for Alexa+, served from a self-hosted MCP server. Alexa+ acts as game master: it searches rooms, questions suspects, quotes testimony word for word and handles a two-step accusation. The case solution never leaves the server process, and tests check that tool responses do not leak the culprit. Scenarios come from the authors' existing published catalog, and there is no screen or multiplayer. Built with Node.js and JavaScript. Evidence: public repository with 13 tests and a demo video. The team states it has not been tested on real Alexa+.

## What to stress in our final copy (based on the above)

- Couch Game Studio and StoryQuest both lead with "AI makes content for the family on the TV." Our first lines should name what neither does: you question suspects aloud, every case is checked by a solver so it can be won, and one player is secretly a human accomplice.
- Couch Game Studio also has a strong agent-with-tool story (robot playtests). Our fairplay solver check is the equivalent proof, so name it in the AWS Builder and Open Source write-ups with test counts.
- On accessibility, Aside, aloud, Sightline and AccessFlow give Fire TV judges other reference points. Keep our claim concrete: a blind player can complete a full case by audio alone, as shown in the video.
