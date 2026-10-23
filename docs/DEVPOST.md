# Accomplice: Devpost text (paste-ready)

Demo video: https://youtu.be/TiMqMkAqtYM

## Tagline (under 200 characters)

A murder-mystery party game for Fire TV where one of your friends is secretly helping the killer. Question AI suspects out loud from your phone and catch them both.

## Inspiration

Mystery party games are great once a year, because someone has to buy a box, read the rules and host. AI mystery games fix the hosting, but the ones we tried had two problems: the AI sometimes contradicts itself, so the case can't be solved, and playing against a computer gets quiet fast. We wanted the AI to do the hosting and the acting, and the people in the room to supply the tension.

## What it does

Up to six people sit in front of a Fire TV. A case opens with a short cold open, and everyone scans a QR code. No install.

Your phone is your secret. It shows a sealed role, and one player may be the **accomplice**, who knows who did it and has to steer the room wrong without getting caught.

Then you play one loop, three times: **hold your phone, ask a suspect anything, listen for the lie.** Each suspect answers in their own voice in about 1.6 seconds. They lie only where the case lets them, and you can call **Objection!** once per game to make a lying suspect slip a true detail. In round 3 the lights go out and a new clue arrives.

At the end the room names the culprit and votes on the accomplice. The reveal walks through the clues that prove the answer, the culprit confesses, and everyone gets a newspaper front page with their names on it.

**Alexa+, voice only.** The same case plays through an Alexa+ MCP add-on with no screen at all: "Alexa, start a mystery", "ask the cook where she was at nine", "I think it was the butler". Alexa confirms the accusation before it counts. An Echo Show gets an evidence card, and "send it to the TV" moves the game to the living room.

Also: a Cozy mode for kids (a stolen cake, no murder), questions and captions in Hindi, and a phone that works fully with VoiceOver and TalkBack.

## What is real and what isn't

| Part | Status |
|---|---|
| Fire TV app | Real Vega OS app, run on the Vega Virtual Device. Not yet tried on a Fire TV stick. |
| Phones | Real: any iPhone or Android browser, no install. |
| Suspects' voices and listening | Real Amazon Polly, Transcribe and Translate calls. |
| Cases | Generated fresh each game and checked by Z3 before play. |
| Alexa+ | A real MCP server, tested with the official MCP Inspector and our Echo Show simulator. Not tested on a real Alexa+ device, because the toolkit is partner-only. |
| AWS deploy | Real, live in ap-south-1. |
| Suspect dialogue model | A model API outside AWS, because Bedrock is blocked on our account. One setting switches to Bedrock. |

## Measured numbers

| What | Number | How measured |
|---|---|---|
| Phone question to first spoken word | 1.56 s median, 2.84 s p95 | Server timings over a real-API game simulation |
| Speech to text | 0.63 s | Amazon Transcribe final-transcript latency |
| Vega app, first frame | 749 ms (median of 5) | `vega exec perf kpi-visualizer`, Vega Virtual Device |
| Vega app, live stage drawn | 1,452 ms (median of 5) | Same tool, includes the network trip |
| Vega app memory | about 249 MiB title, 260 MiB lobby | `perf activity-monitor` |
| Alexa+ tool calls, live | 1 to 2.6 s | MCP calls against the deployed server |
| Phone accessibility | 0 axe violations on 32 screens | axe-core in the e2e harness |
| Case engine tests | 28 passing | `fairplay` test suite |

## Limits

1. Not yet run on a physical Fire TV.
2. Not yet run on a real Alexa+ device.
3. Tested end to end with scripted phones and full automated games; no organised playtest with outside players yet.
4. Suspect dialogue uses a model outside AWS.
5. The phone link is a tunnel address that changes when the server restarts. The TV link stays fixed and always shows the current one.

## How we built it

**A traitor who can't break the case.** The accomplice gets one secret action per round, such as burying a clue. Before it happens, Z3 checks that the case is still solvable without that clue, so sabotage makes the game harder but never unwinnable. If the solver can't confirm that in time, the sabotage is refused. Objection slips are screened by the engine's solver too, so a slip can't hand over the answer early.

**Cases that can always be solved.** Our engine, `fairplay`, generates a case (people, rooms, a timeline, alibis, clues) and checks it with the Z3 solver before anyone plays: exactly one culprit fits every clue, removing any key clue breaks that, and the proof can be reached by round 3. Cases that fail are thrown away.

**Suspects who can't leak.** Each suspect only receives its own slice of the case and a list of what it may lie about. The culprit's identity is never in another suspect's prompt. Replies stream sentence by sentence, and every sentence goes through a deterministic claim checker before it is spoken. A sentence that contradicts the case is dropped and regenerated.

**Voices and captions.** Amazon Polly neural voices give each suspect a distinct voice from the Mumbai region, and Polly speech marks light up captions word by word. Amazon Transcribe streaming turns the phone's hold-to-talk into text in about 0.63 s. Amazon Translate handles Hindi.

**TV.** A 10-foot React stage inside a Vega OS app, built from Amazon's Vega WebView template. We chose the WebView so one stage runs on Fire TV, in any browser for judges, and on the Echo Show card; the native side handles the remote, launch and the offline fallback. D-pad only, tested at 1080p and 720p (39 screens each, no clipped text). On the Vega Virtual Device (release build, median of 5 runs): first frame in 749 ms, the live stage fully drawn in 1,452 ms including the network trip, and about 249 MiB of memory at the title screen including the WebView renderer. A release package for armv7, aarch64 and x86_64 and a judge run script are in the repo ([docs/VEGA.md](VEGA.md)).

**Phones.** A web page with large targets, screen-reader labels on everything, and haptic cues for hold-to-talk. 31 screens with zero axe accessibility violations.

**Alexa+.** An MCP server on spec 2025-11-25 over Streamable HTTP: case generation runs as a task, the accusation uses elicitation to confirm, and the evidence board is an MCP Apps `ui://` card. Game state is keyed by household so the conversation can pick up later. It isn't tied to our own client: the official MCP Inspector CLI lists all 11 tools on the live server and starts a case through `tools/call`. On the live server a new case takes 1 to 2.6 s to start and a suspect answers in 1.1 to 2.3 s, depending on the case and whether the session is new. An optional house host built with Strands Agents connects to the same MCP tools and follows the add-on's SKILL.md, so it can answer questions like "remind me what the cook said" and question a suspect for you. It never accuses without a spoken yes. Simple commands skip the agent and answer instantly; agent answers start speaking in 0.9 to 2.9 s. Its model is one setting; Bedrock would be the default if our account could use it.

**AWS.** The whole backend is one CDK stack, live in ap-south-1 at http://Accomp-Alb16-mcZdJ1MHVPFR-1726733199.ap-south-1.elb.amazonaws.com/tv/ (phones join over HTTPS through the QR code).
- ECS Fargate (ARM, 0.5 vCPU) runs the game server behind a load balancer. App Runner was ruled out because it has no WebSockets.
- DynamoDB stores room snapshots, so a game survives a server restart or a deploy, plus detective records.
- Polly, Transcribe and Translate do every voice, every question and the Hindi mode.
- S3 caches generated audio, so repeated narrator lines cost nothing after the first game.
- Secrets Manager holds keys, and a CloudWatch dashboard tracks rooms, answer latency and case generation time.
- A budget alarm caps spend at $150 a month.

Cost: about $48 a month fixed, and $0.32 of AWS per 25-minute, 4-player game ($0.44 with Hindi), itemised in [docs/AWS.md](AWS.md). The suspect dialogue model is the one part outside AWS: Bedrock is blocked on our AWS India account, and switching to Nova is one setting.

## Challenges we ran into

- Amazon Bedrock is blocked on our new AWS India (AISPL) account: every model returns "Operation not allowed". We built the voice pipeline on Polly, Transcribe and Translate and kept a Bedrock provider behind one setting.
- CloudFront refused to create a distribution until AWS Support verifies the account, which rolled back our first deploy. CloudFront is now one flag in the stack.
- The Vega Virtual Device kept going offline after reporting ready. The friction log has the details and a workaround.
- Speed. The first version took over 4 seconds to answer. Streaming by sentence, checking each sentence as it arrives, and a short spoken filler brought the first sentence to 1.56 s median (2.84 s at p95).

## Accomplishments we're proud of

- A solver proves every case can be won before anyone plays it.
- Tests check that innocent suspects never receive the culprit's identity, that prompts are built only from each suspect's slice, and that a reply which leaks twice falls back to a safe deflection.
- Every phone screen passes axe accessibility checks with zero violations, and everything shown on the TV is also spoken, so the game is built to be played by ear.

## What we learned

The AI is better as the cast than as the opponent. The fun comes from the people on the couch accusing each other, and the AI's job is to stay consistent long enough for them to do it.

## What's next

- **Fire TV app:** an Amazon Appstore subscription for unlimited cases, with one free case each week. Every generated case is verified, so the catalog never runs out.
- **Weekly case:** everyone gets the same case on Friday nights, with a leaderboard for fewest questions asked.
- **Detective records:** your household's solve streak and title carry across games (already stored in DynamoDB).
- More languages through Translate, and real Alexa+ testing once the toolkit opens up.

## Built with

amazon-polly, amazon-transcribe, amazon-translate, amazon-dynamodb, amazon-ecs, aws-fargate, elastic-load-balancing, amazon-s3, aws-secrets-manager, amazon-cloudwatch, aws-budgets, aws-cdk, strands-agents, vega-os, react-native, react, vite, typescript, node.js, fastify, websockets, z3, model-context-protocol, elevenlabs

## Mini challenges

**AWS Builder:** see the AWS section above and [docs/AWS.md](AWS.md). Services in the live path: Polly, Transcribe, Translate, DynamoDB, ECS Fargate, ALB, S3, Secrets Manager, CloudWatch, Budgets, all deployed with CDK.

**Open Source:** `fairplay`, the case generator and verifier, is published separately under MIT at github.com/kinnuworks/fairplay with 28 tests. It works for any deduction game, not only ours.

## Testing instructions

1. Open http://Accomp-Alb16-mcZdJ1MHVPFR-1726733199.ap-south-1.elb.amazonaws.com/tv/ on a laptop or TV browser, or install the Vega package from https://github.com/kinnuworks/accomplice/releases/tag/v1.0.0 on the Vega Virtual Device (`apps/vega/scripts/judge-run.sh <package>`).
2. Scan the QR code with two or more phones (iPhone Safari or Android Chrome). Allow the microphone.
3. Press Start on the TV with the remote or Enter key. Hold the talk button on a phone and ask a suspect a question.
4. Alexa+: open http://Accomp-Alb16-mcZdJ1MHVPFR-1726733199.ap-south-1.elb.amazonaws.com/echo/ for the Echo Show simulator, or point any MCP client at the HTTPS address shown in the TV lobby, plus /mcp.

Code: https://github.com/kinnuworks/accomplice (MIT). Case engine: https://github.com/kinnuworks/fairplay (MIT, v1.0.0). Vega packages: https://github.com/kinnuworks/accomplice/releases/tag/v1.0.0
