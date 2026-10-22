# Product feedback

For each tool: what we used it for, what worked, what needs work, how onboarding went, and whether we'd build with it again. The full friction log with repro steps is in [FRICTION_LOG.md](FRICTION_LOG.md).

## Vega OS SDK, Vega CLI and the Vega Virtual Device

- **Used for:** the Fire TV app (Vega WebView template hosting our 10-foot game stage), building packages for three architectures, and testing on the Vega Virtual Device.
- **What worked:** a one-line installer; `vega project list-templates` and the WebView template gave a working shell in minutes; `npm run build:debug` built armv7, aarch64 and x86_64 packages first time; `vega run-app` installed and launched cleanly when the device was connected; the supported-libraries page is clear and current.
- **What needs work:** the virtual device repeatedly went offline a few minutes after reporting "ready" with an empty error log; `vega project generate -o <dir>` writes files into `<dir>` instead of `<dir>/<name>`; no CLI screenshot command and the on-device `screenshooter` fails with a permission error; no documented way to reach a dev server on the host.
- **Onboarding (zero to hello world):** about 25 minutes including the SDK download, which is good. Most time after that went to restarting the virtual device.
- **Would we build with it again?** Yes. React Native knowledge transfers directly, and the build tooling is fast. Fix the virtual device's stability and it becomes a great experience.

## Alexa+ add-on documentation (MCP toolkit overview, client lifecycle, design guide)

- **Used for:** designing a self-hosted MCP server (spec 2025-11-25, Streamable HTTP) with tasks, elicitation and an MCP Apps board, plus an Echo Show style client so judges can see it working.
- **What worked:** the design guide's principles (end-to-end task completion, glanceable cards, far-field type) directly shaped our UI. Knowing that Alexa+ renders MCP Apps via `_meta.ui.resourceUri` and keeps conversation context itself told us to key game state by household.
- **What needs work:** the lifecycle page's sample uses protocol version 2025-03-26 while the overview says 2025-11-25; capabilities Alexa+ declares (elicitation, sampling) aren't listed; no limits (timeouts, payload size, tool count). The toolkit and simulator being partner-only means every hackathon team builds its own simulator.
- **Onboarding:** reading the docs took an hour; without the toolkit we couldn't test against a real client.
- **Would we build with it again?** Yes. MCP is a clean way to bring a game to Alexa+, and we'd love toolkit access to test for real.

## Amazon Polly

- **Used for:** every suspect's voice (neural voices in ap-south-1, chosen per character), the narrator lines recorded ahead of time (generative voices in us-east-1), and word speech marks that drive word-by-word captions on the TV.
- **What worked:** speech marks are the reason our captions feel alive; neural voices return in about 0.6 s from Mumbai; the voice catalogue covers British, American and Indian English, which suits a country-house mystery cast.
- **What needs work:** generative voices are only in us-east-1, which adds about 1.4 s per line from India; SSML emphasis isn't supported on neural voices, so comic timing has to come from breaks and punctuation.
- **Onboarding:** minutes. The first call worked.
- **Would we build with it again?** Yes, absolutely.

## Amazon Transcribe (streaming)

- **Used for:** turning players' spoken questions on their phones into text, streamed as 16 kHz PCM from the browser.
- **What worked:** about 0.63 s from end of speech to final transcript; accurate on suspect names after a small fuzzy-match pass.
- **What needs work:** a browser-ready example (AudioWorklet to PCM to the streaming API through a small server) would save every web developer the same afternoon.
- **Onboarding:** under an hour with the SDK.
- **Would we build with it again?** Yes.

## Amazon Translate

- **Used for:** optional Hindi play: a player can ask in Hindi and read captions in Hindi while the rest of the table plays in English.
- **What worked:** worked first time; fast enough for live captions.
- **What needs work:** nothing blocking.
- **Would we build with it again?** Yes.

## Amazon Bedrock

- **Used for:** we planned to run suspect dialogue on Amazon Nova and Nova Sonic, but could not use it.
- **What needs work:** on our new AWS India (AISPL) account every model returned "Operation not allowed" or "not available for this account", while IAM allowed the calls. The errors never mention the account type. See the friction log for details.
- **Would we build with it again?** Yes, as soon as access works. The server already has a Bedrock provider behind one setting.

## AWS CDK, ECS Fargate, CloudFront, S3, DynamoDB, Secrets Manager, CloudWatch, Budgets

- **Used for:** one-command deployment of the game: Fargate runs the game server, CloudFront gives phones the HTTPS they need for the microphone and serves the apps from S3, DynamoDB stores room snapshots (games survive a restart), fair-play audit records and detective records, Secrets Manager holds API keys, CloudWatch has a game dashboard, and a Budget caps spend.
- **What worked:** CDK synth and diff were quick; least-privilege IAM was easy to express; CloudFront handles WebSockets.
- **What needs work:** our first deploy failed because a new account can't create CloudFront distributions until AWS Support verifies it, and nothing warned us before the deploy. The rollback then stuck on a non-empty bucket. CloudFront is now behind a flag. Separately, App Runner doesn't support WebSockets, so a small real-time game needs a load balancer, which is the largest fixed cost.
- **Would we build with it again?** Yes.
