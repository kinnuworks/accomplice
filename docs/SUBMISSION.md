# Devpost submission draft

Items in [brackets] still need a real number or link before submitting. Don't fill them with guesses.

## Tagline (under 200 characters)

Question AI suspects out loud from your phone and find the killer, while one person on your couch is secretly helping them. Every case is solver-checked so it can be won.

## Inspiration

Mystery party games are great once a year, because someone has to buy a box, read the rules and host. AI mystery games fix the hosting, but the ones we tried had two problems: the AI sometimes contradicts itself, so the case can't be solved, and playing against a computer gets quiet fast. We wanted the AI to do the hosting and the acting, and the people in the room to supply the tension.

## What it does

Up to six people sit in front of a Fire TV. A case opens with a short cold open, and everyone scans a QR code. No install.

Your phone is your secret. It shows a sealed role, and one player may be the **accomplice**, who knows who did it and has to steer the room wrong without getting caught.

Then you play one loop, three times: **hold your phone, ask a suspect anything, listen for the lie.** Each suspect answers in their own voice in about 1.6 seconds. They lie only where the case lets them, and you can call **Objection!** once per game to make a lying suspect slip a true detail. In round 3 the lights go out and a new clue arrives.

At the end the room names the culprit and votes on the accomplice. The reveal walks through the clues that prove the answer, the culprit confesses, and everyone gets a newspaper front page with their names on it.

Other ways in:
- **Alexa+:** the same game as an MCP add-on. Ask Alexa to start a case, question suspects by voice, and see the board on an Echo Show. "Send it to the TV" moves the game to the living room.
- **Cozy mode:** a stolen cake instead of a murder, for kids.
- **Hindi:** any player can ask in Hindi and read captions in Hindi while the rest play in English.
- **Blind and low-vision players:** everything on the TV is also spoken, the phone works with VoiceOver and TalkBack, and the board can be read aloud. [Result of the playtest with a blind player, in their words.]

## How we built it

**Cases that can always be solved.** Our engine, `fairplay`, generates a case (people, rooms, a timeline, alibis, clues) and checks it with the Z3 solver before anyone plays: exactly one culprit fits every clue, removing any key clue breaks that, and the proof can be reached by round 3. Cases that fail are thrown away. The accomplice's sabotage and the Objection slip are checked the same way, so neither can make the case unsolvable or give it away early.

**Suspects who can't leak.** Each suspect only receives its own slice of the case and a list of what it may lie about. The culprit's identity is never in another suspect's prompt. Replies stream sentence by sentence, and every sentence goes through a deterministic claim checker before it is spoken. A sentence that contradicts the case is dropped and regenerated.

**Voices and captions.** Amazon Polly neural voices give each suspect a distinct voice from the Mumbai region, and Polly speech marks light up captions word by word. Amazon Transcribe streaming turns the phone's hold-to-talk into text in about 0.63 s. Amazon Translate handles Hindi.

**TV.** A 10-foot React stage inside a Vega OS app, D-pad only, tested at 1080p and 720p (39 screens each, no clipped text). [Vega Virtual Device numbers: cold start, memory, frame rate.]

**Phones.** A web page with large targets, screen-reader labels on everything, and haptic cues for hold-to-talk. 31 screens with zero axe accessibility violations.

**Alexa+.** An MCP server on spec 2025-11-25 over Streamable HTTP: case generation runs as a task, the accusation uses elicitation to confirm, and the evidence board is an MCP Apps `ui://` card. Game state is keyed by household so the conversation can pick up later. A house host built with Strands Agents connects to the same MCP tools and follows the add-on's SKILL.md, so it can answer questions like "remind me what the cook said" and question a suspect for you. It never accuses without a spoken yes. Simple commands skip the agent and answer instantly; agent answers start speaking in 0.9 to 2.9 s.

**AWS.** One CDK stack: ECS Fargate (ARM) behind a load balancer, DynamoDB for room snapshots (a game survives a server restart) and detective records, S3 for the voice cache, Secrets Manager, a CloudWatch game dashboard and a $150 budget cap. [Live URL.]

## Challenges we ran into

- Amazon Bedrock is blocked on our new AWS India (AISPL) account: every model returns "Operation not allowed". We built the voice pipeline on Polly, Transcribe and Translate and kept a Bedrock provider behind one setting.
- CloudFront refused to create a distribution until AWS Support verifies the account, which rolled back our first deploy. CloudFront is now one flag in the stack.
- The Vega Virtual Device kept going offline after reporting ready. The friction log has the details and a workaround.
- Speed. The first version took over 4 seconds to answer. Streaming by sentence, checking each sentence as it arrives, and a short spoken filler brought the first sentence to 1.56 s median (2.84 s at p95).

## Accomplishments we're proud of

- A solver proves every case can be won before anyone plays it.
- Tests check that innocent suspects never receive the culprit's identity, that prompts are built only from each suspect's slice, and that a reply which leaks twice falls back to a safe deflection. [Leak count from the real-model audit run.]
- A blind player can play the whole game alongside sighted friends. [Confirm after the playtest.]

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

**Open Source:** `fairplay`, the case generator and verifier, is published separately under MIT at github.com/kinnuworks/fairplay with [N] tests. It works for any deduction game, not only ours.

## Testing instructions

1. Open [live URL]/tv/ on a laptop or TV browser, or install the Vega package from the repository's releases on a Fire TV or the Vega Virtual Device.
2. Scan the QR code with two or more phones (iPhone Safari or Android Chrome). Allow the microphone.
3. Press Start on the TV with the remote or Enter key. Hold the talk button on a phone and ask a suspect a question.
4. Alexa+: open [live URL]/echo/ for the Echo Show simulator, or point any MCP client at [live URL]/mcp.

Repositories are shared with the judges listed in the rules and testing@devpost.com.

## Video shot list (about 3 minutes; the user narrates)

1. 0:00–0:15 Cold open on the TV, then four friends on a couch scanning the QR code.
2. 0:15–0:30 Close-up of one phone: the wax seal breaks and it says ACCOMPLICE. They hide it.
3. 0:30–1:10 The loop: hold to talk, ask a suspect, the voice answers, captions on screen. Show the response time on screen. One suspect lies; someone calls Objection; the slip.
4. 1:10–1:30 Lights go out in round 3. Room reaction.
5. 1:30–1:55 Accusation and the reveal: GUILTY stamp, confession, accomplice unmasked, newspaper on a phone.
6. 1:55–2:15 The blind player's turn, with their consent, in their words.
7. 2:15–2:35 Alexa+ on the Echo simulator: "send it to the TV".
8. 2:35–3:00 How it works in one diagram: solver-checked cases, sealed suspects, AWS. End on the newspaper.
