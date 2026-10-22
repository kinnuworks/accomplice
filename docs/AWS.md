# Accomplice on AWS

Accomplice runs on AWS in Mumbai (ap-south-1), close to the players. A TV, up to six phones and an Echo all open one HTTPS address. That address serves the web apps, the game sockets, live speech and the voice add-on.

![Architecture](architecture.svg)

The whole stack is one AWS CDK app in [`infra/`](../infra). It is plain TypeScript, so every service and permission can be read in [`infra/lib/accomplice-stack.ts`](../infra/lib/accomplice-stack.ts).

## How a game flows through AWS

1. The TV opens `https://<cloudfront>/tv/`. CloudFront serves the app from S3, and it does not touch the server.
2. The TV opens a WebSocket to `/ws`. CloudFront passes it to the load balancer, which sends it to the game server on Fargate. The server creates a room and shows a QR code.
3. Phones scan the code and open `/p/?room=CODE` the same way. Their game socket also goes to `/ws`.
4. A player holds the talk button and asks a suspect a question. The phone streams microphone audio over `/stt` to the server, and the server forwards it to **Amazon Transcribe** streaming. Words come back while the player is still talking.
5. The server writes the suspect's reply with a language model. Before anything is spoken, the fair play checker tests every claim in the reply against the case solution. A reply that would leak the secret is rewritten or deflected.
6. **Amazon Polly** turns the reply into speech in the suspect's voice. It also returns speech marks (the time of every word), so the TV can light up each caption word as it is spoken. Suspects use neural voices in Mumbai, which take about 0.6 s per line. The narrator uses generative voices in us-east-1, rendered while the lobby fills.
7. Each audio file is named by a hash of its text and voice. The server copies it to **S3** under `audio/`, and CloudFront then serves it with a one year cache. If a line has not reached S3 yet, CloudFront quietly falls back to the server, which has the same file.
8. A player who picked Hindi gets captions, clues and questions through **Amazon Translate**.
9. While the game runs, the server stores a snapshot of each room in **DynamoDB**, plus every fair play check and the final result. All-time counters are updated in place, so the stats page shows real numbers.
10. The server writes metrics as structured log lines. **CloudWatch** turns them into graphs for rooms, questions and answer latency.

## Services used and why

| Service | What it does here | Why this one |
|---|---|---|
| **Amazon Polly** | Voices for every suspect (neural, ap-south-1) and the narrator (generative, us-east-1). Speech marks give word timings for synced captions. | Many distinct voices and accents, fast neural voices in Mumbai, and word level timing from the same service that makes the audio. |
| **Amazon Transcribe** (streaming) | Turns the player's spoken question into text as they speak, over a WebSocket from the phone. | Partial results arrive while the player talks, so the suspect can start answering about a second after they stop. Supports English (India) and Hindi. |
| **Amazon Translate** | Per player language: captions, clues and questions in Hindi while the room plays in English. | Fast, cheap per character, and cached per line, so a phrase is translated only once. |
| **Amazon ECS on AWS Fargate** | Runs the Node game server container: one ARM task with 0.5 vCPU and 1 GB. | The game depends on two long lived WebSockets (`/ws` and `/stt`). App Runner does not support WebSockets, so it was ruled out. Fargate needs no servers to manage and costs about $10.60 a month at this size. |
| **Application Load Balancer** | Sends traffic from CloudFront to the task, runs health checks, and keeps idle sockets open for up to an hour. | Required in front of Fargate for WebSockets and rolling deploys. Its security group only accepts CloudFront's origin-facing IP list. |
| **Amazon CloudFront** | One HTTPS address with a free certificate. Routes `/tv /p /echo /assets /audio` to S3 and everything else to the server, WebSockets included. | Phones need HTTPS to use the microphone, and CloudFront provides it without a custom domain. India edge locations keep app loads fast, and audio downloads stay off the server. |
| **Amazon S3** | Private bucket for the built web apps, art, music and the voice cache. Only CloudFront can read it (Origin Access Control). | Hashed files are cached for a year. The voice cache outlives the container: a new task restores it from S3 instead of paying Polly again. |
| **Amazon DynamoDB** (on demand) | Game table: room snapshots (7 day TTL), fair play audit rows, game results and all-time counters. Records table: detective records for the voice add-on. | Pay per request, which costs nothing when idle. Single digit millisecond writes never slow the game, and the data survives restarts and deploys. |
| **AWS Secrets Manager** | Holds the language model API key and the optional ElevenLabs key. ECS injects them as environment variables when the task starts. | Keys never appear in the image, the template or git. One secret costs $0.40 a month. |
| **Amazon CloudWatch** | Log group (14 day retention), metrics in the `Accomplice` namespace, and a dashboard named `Accomplice`. | Metrics are written as Embedded Metric Format log lines, so no metrics agent or extra API calls are needed. |
| **AWS Budgets** | The existing `red-herring-cap` budget ($150 a month) watches the account. | Hard guardrail for the hackathon. The stack itself is designed to use about a third of it. |
| **Amazon ECR, IAM, VPC** | ECR stores the container image (CDK pushes it). IAM roles follow least privilege. The VPC has two public subnets and no NAT gateway. | Leaving out the NAT gateway saves about $33 a month. The task gets a public IP for outbound calls, and its security group only allows the load balancer in. |

Bedrock is not used. It is not available on this account, and the server runs with `MODEL_PROVIDER` unset.

### Least privilege

The game server's task role can only:

- `polly:SynthesizeSpeech`, `polly:DescribeVoices`
- `transcribe:StartStreamTranscription`, `transcribe:StartStreamTranscriptionWebSocket`
- `translate:TranslateText` (plus `comprehend:DetectDominantLanguage`, which Translate needs when the source language is automatic)
- `dynamodb:GetItem/PutItem/UpdateItem/Query` on the game table, and `GetItem/PutItem` on the records table
- `s3:GetObject/PutObject` on `audio/*` in its bucket, and `s3:ListBucket` limited to the `audio/` prefix

The execution role (used by ECS, not by the app) can read only the stack's own secret and write only to its own log group.

## What the server does on AWS

The AWS code lives in `apps/server/src/aws/`. Each piece is off unless its environment variable is set, so local play is unchanged.

| Env var (set by CDK) | File | Effect |
|---|---|---|
| `ACCOMPLICE_TABLE` | `store.ts` | Room snapshots (gzip, only written when the state changed), audit rows, results, and atomic all-time counters. Adds `GET /api/stats/all-time`. |
| `AUDIO_BUCKET` | `audio-sync.ts` | Watches the local voice cache and uploads new files to `s3://bucket/audio/`. On start it restores the cache from S3. |
| `EMF_METRICS=on` | `metrics.ts` | Metrics written as log lines: `ActiveRooms`, `RoomsInGame`, `ConnectedClients`, `Questions`, `AnswerLatencyMs`, `ReplyMs`, `FirstSentenceMs`, `CaughtViolations`, `Deflected`, `GamesStarted`, `GamesFinished`, `GameDurationMs`, `CaseGenMs`, `NarrationMs`. |
| `ACCOMPLICE_RECORDS=dynamodb`, `ACCOMPLICE_RECORDS_TABLE` | `packages/mcp-game` | Detective records for the voice add-on, stored by household. The table's partition key is `household`, which is the attribute name the package writes. |

Only two existing server files were touched, each with one line: `audit.ts` calls `onAudit()` and `server.ts` calls `initAws()`.

Room snapshots are written today and can be read back with `getSnapshot(code)`. Rebuilding a live room from a snapshot needs a restore hook in `room.ts`, which has not been added yet. Until then, a deploy or restart in the middle of a game ends that game, but its audit rows and stats are kept. During a hackathon, deploy between games.

## Cost

Prices are on-demand list prices for ap-south-1 from the AWS Price List API (October 2026), in USD, for 730 hours a month.

### Fixed monthly cost (the stack running, no games)

| Item | Calculation | Per month |
|---|---|---|
| Fargate task, ARM, 0.5 vCPU / 1 GB | 0.5 x $0.02383 + 1 x $0.00261 = $0.0145 per hour | $10.60 |
| Application Load Balancer | $0.0239 per hour, plus about 0.1 LCU | $18.00 |
| Public IPv4 addresses | 3 (load balancer in 2 zones, plus the task) x $0.005 per hour | $10.95 |
| CloudWatch custom metrics | about 13 metrics x $0.30 (the first 10 are free under the free tier) | $3.90 |
| CloudWatch dashboard | 1 dashboard (the first 3 are free under the free tier) | $3.00 |
| CloudWatch Logs | under 1 GB ingested at $0.67/GB, 14 day retention | $0.70 |
| Secrets Manager | 1 secret | $0.40 |
| ECR image storage | about 0.5 to 2 GB across deploys at $0.10/GB | $0.20 |
| S3, DynamoDB, CloudFront, Lambda (deploy helper) | inside free tiers at hackathon scale (CloudFront: 1 TB and 10M requests a month free) | $0.30 |
| NAT gateway | not used | $0.00 |
| **Total fixed** | | **about $48** |

### Cost per game

Assumptions: 25 minutes, 4 players, 16 spoken questions, one case. Polly bills speech marks per character too, so each line counts twice.

| Item | Calculation | Per game |
|---|---|---|
| Polly neural (suspects) | 16 answers x 250 chars x 2 (audio + marks) = 8,000 chars x $16/M | $0.13 |
| Polly generative (narrator) | about 2,500 new chars x 2 x $30/M (fixed lines are cached in S3 and reused) | $0.15 |
| Transcribe streaming | 16 questions x 15 s minimum = 240 s x $0.0001667 | $0.04 |
| Translate (only when someone plays in Hindi) | about 8,000 chars x $15/M | $0.12 |
| DynamoDB, S3, CloudFront | a few hundred writes, a few MB of audio | under $0.01 |
| **AWS total per game** | | **$0.32 in English, $0.44 with Hindi** |

The language model API is billed by its provider, outside AWS, and is not part of these numbers. Repeated narrator lines cost nothing after the first game, so later games cost closer to $0.20 to $0.30 each on AWS.

**Budget check:** about $48 fixed leaves about $100 of the $150 cap, which covers roughly 250 to 300 games a month. A busy judging week is far below that.

**Ways to spend less:** switch to 0.25 vCPU / 0.5 GB with `-c cpu=256 -c memoryMiB=512`, which saves about $5. Run `destroy` after judging, after which only the retained DynamoDB tables remain, at $0 when idle. If games run slow, go up with `-c cpu=1024 -c memoryMiB=2048` (+$10.60).

## Deploy and destroy

You need the AWS CLI logged in, Docker running, Node 22 or newer, and pnpm.

```sh
# 1. one time: install the CDK app and bootstrap the account in ap-south-1
npm --prefix infra ci && npm --prefix infra run bootstrap

# 2. build the web apps, build and push the image, create everything (about 10 minutes)
npm --prefix infra run deploy

# 3. copy the API keys from apps/server/.env into Secrets Manager and restart the task
infra/scripts/put-secrets.sh
```

The game URL is printed as `Accomplice.Url`, and it is also saved in `infra/cdk-outputs.json`. Open `<Url>/tv/` on the TV. Until step 3 has run, the game works in offline mode with canned suspect replies.

To preview changes without deploying: `npm --prefix infra run diff` (or `synth`).

To destroy:

```sh
npm --prefix infra run destroy
```

This removes everything except the two DynamoDB tables, which are kept on purpose so game history survives. To delete them as well:
`aws dynamodb delete-table --region ap-south-1 --table-name <GameTableName>` (and the same for `<RecordsTableName>`, both from the stack outputs).

### Notes

- **Redeploys and keys.** The secret is created with empty values. Redeploying never overwrites keys set by `put-secrets.sh`, because the template value does not change.
- **No secrets in the image.** `.dockerignore` excludes every `.env` file. Keys reach the container only through Secrets Manager.
- **Rolling deploys.** ECS starts the new task, waits for `/api/health`, and only then stops the old one. If the new task fails its health check, the circuit breaker rolls back.
- **Dashboard.** CloudWatch, then Dashboards, then `Accomplice` (the link is in the `DashboardUrl` output). It shows rooms, questions, answer latency p50/p95, suspect reply time, fair play catches, CPU and memory, load balancer errors, and recent server warnings.
