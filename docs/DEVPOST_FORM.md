# Devpost "Additional info" answers

## AWS Builder: Which AWS services did you incorporate and how?
Accomplice runs on one AWS CDK stack, live in ap-south-1 (http://Accomp-Alb16-mcZdJ1MHVPFR-1726733199.ap-south-1.elb.amazonaws.com/tv/).
- Amazon ECS on AWS Fargate (ARM) runs the Node game server behind an Application Load Balancer. App Runner was ruled out because it has no WebSockets.
- Amazon Polly voices every suspect (neural voices in ap-south-1, one per character) and uses word speech marks to drive word-by-word captions on the TV.
- Amazon Transcribe streaming turns each player's hold-to-talk question into text (about 0.63 s to final transcript).
- Amazon Translate lets any player ask in Hindi and read captions in Hindi.
- Amazon DynamoDB stores room snapshots (a game survives a server restart or deploy), fair-play audit rows and detective records for the Alexa+ add-on.
- Amazon S3 caches generated audio, so repeated narrator lines cost nothing after the first game.
- AWS Secrets Manager holds API keys; Amazon CloudWatch has a game dashboard (rooms, answer latency, case generation time); AWS Budgets caps spend at $150 a month; SSM Parameter Store publishes the current phone URL.
- Strands Agents SDK powers an optional "house host" agent that drives the game through our MCP tools.
Cost: about $48 a month fixed and $0.32 of AWS per 25-minute, 4-player game. Amazon Bedrock is blocked on our AWS India (AISPL) account, so suspect dialogue uses a model outside AWS; switching to Bedrock is one setting. Full write-up: https://github.com/kinnuworks/accomplice/blob/master/docs/AWS.md

## Open Source: description
I built and released fairplay, an MIT-licensed TypeScript library that generates deduction mysteries and proves with the Z3 solver that each one has exactly one solution. For every generated case it checks that exactly one suspect fits all the clues, that every key clue is needed (remove it and the answer is no longer unique), and that the case can be solved by round 3. Cases that fail are thrown away. In our measurements it generates and verifies a case in about 143 ms (median of 10), 200 of 200 seeds verified on the first try, and it has 28 tests. It matters because AI-written mysteries often contradict themselves and become unsolvable; fairplay gives any deduction game a guarantee that the puzzle is fair before a player sees it. Accomplice uses it for every case, and to check that the hidden accomplice's sabotage never makes a case unwinnable.

## Feature requests
1. Critical: Bedrock model access for AWS India (AISPL) accounts, or an error that names the account type. Our suspects had to use a model outside AWS.
2. Important: Alexa+ MCP toolkit access for hackathon builders, with a published limits table (timeouts, payload size, tool count). We could only test with our own simulator and the MCP Inspector.
3. Important: a stable Vega Virtual Device (it went offline after reporting ready) and a `vega device screenshot` command.
4. Nice-to-have: Polly generative voices in ap-south-1.

## Feedback Q1: tools used
Vega OS SDK and CLI with the Vega Virtual Device (Fire TV app, packaging, performance KPIs); Alexa+ add-on docs and the Model Context Protocol (MCP server for Alexa+); Amazon Polly, Transcribe and Translate (voices, speech to text, Hindi); AWS CDK, ECS Fargate, DynamoDB, S3, Secrets Manager, CloudWatch, Budgets (hosting); Strands Agents SDK (house host agent); Z3 via z3-solver (case verification); ElevenLabs (narrator voice).

## Feedback Q2: what worked well
Vega: one-line SDK install; the WebView template built for three architectures first time; the KPI tools measured cold start, memory and fluidity. Polly: speech marks made word-synced captions easy, neural voices return in about 0.6 s from Mumbai. Transcribe streaming: about 0.63 s to final transcript. Translate: worked first time. CDK: synth and diff were fast and least-privilege IAM was easy. Alexa+ design guide: its card and far-field type advice shaped our Echo screens. Strands: MCP client support worked out of the box.

## Feedback Q3: what needs work
Bedrock blocked on AISPL accounts with a misleading error. CloudFront refused new distributions until account verification, which rolled back our first deploy and left the stack in ROLLBACK_FAILED. Vega Virtual Device went offline after reporting ready; `vega project generate -o` writes into the output folder; no CLI screenshot; the WebView blocks cleartext HTTP and the manifest setting for it is undocumented; `vega build -b Release` produced a package without JavaScript; the WebView did not always fire the audio `ended` event, which stalled our voice queue. Alexa+ docs disagree on the MCP protocol version and list no limits. App Runner has no WebSockets. Full friction log: https://github.com/kinnuworks/accomplice/blob/master/docs/FRICTION_LOG.md

## Feedback Q4: onboarding
Vega: about 25 minutes from SDK download to the app running on the virtual device. Polly, Translate: minutes. Transcribe streaming: under an hour, most of it on browser audio capture. CDK: an hour including bootstrap. Alexa+: an hour of reading, but no way to test against a real client without the partner toolkit.

## Feedback Q5: build again?
Yes. Vega's React Native and WebView path made a 10-foot party game practical in days, Polly and Transcribe made talking to characters feel immediate, and CDK made the whole backend reproducible. With Bedrock access and the Alexa+ toolkit we would move the suspects and the voice host fully onto Amazon.
