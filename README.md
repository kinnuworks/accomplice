# Accomplice

**Demo video:** https://youtu.be/TiMqMkAqtYM · **Play live:** http://Accomp-Alb16-mcZdJ1MHVPFR-1726733199.ap-south-1.elb.amazonaws.com/tv/ · **Fire TV package:** [v1.0.0 release](https://github.com/kinnuworks/accomplice/releases/tag/v1.0.0)

A murder-mystery party game for Fire TV. Up to six people question AI suspects out loud from their phones, and one of the people on the couch is secretly helping the killer.

- **TV (Vega OS):** the case, the suspects, the evidence board and the reveal. D-pad only.
- **Phones:** scan the QR code, no install. Your phone holds your secret role, your clues, hold-to-talk and your votes. Works with VoiceOver and TalkBack.
- **Alexa+:** the same game as an MCP add-on, with an Echo Show style board. You can also say "send it to the TV".

Every case is generated fresh and checked by a solver before anyone sees it: exactly one culprit fits the clues, every key clue is needed, and the case can be solved by round 3. That engine is open source as [`fairplay`](packages/fairplay).

## How a game goes

1. The TV plays a 60-second cold open. Everyone scans the QR code.
2. Each phone shows a sealed role. One player may be the accomplice: they know who did it and try to steer the room away.
3. Hold your phone and ask a suspect anything. They answer in their own voice within about two seconds. They lie only where the case says they lie, and every sentence is checked against the case before it is spoken.
4. Pin clues on the board, use your one **Objection!**, survive the blackout in round 3.
5. The room accuses the culprit and votes on the accomplice. The reveal replays the chain of clues that proves the answer, the culprit confesses, and you get a newspaper front page to keep.

Cozy mode swaps the murder for a stolen cake and keeps everything else. Players can ask questions and read captions in Hindi.

## Repository

| Path | What it is |
|---|---|
| `apps/server` | Fastify + WebSocket game server. Suspects, voices (Amazon Polly), speech to text (Amazon Transcribe), Hindi (Amazon Translate), MCP endpoint, DynamoDB snapshots. |
| `apps/tv-web` | The 10-foot TV stage (React). Served at `/tv/`. |
| `apps/vega` | The Vega OS app that hosts the TV stage. |
| `apps/phone` | The phone controller (React). Served at `/p/`. |
| `apps/echo-sim` | Echo Show style client for the Alexa+ add-on. |
| `packages/fairplay` | Case generator and Z3 verifier. MIT. |
| `packages/mcp-game` | MCP server for Alexa+ (spec 2025-11-25, Streamable HTTP, tasks, elicitation, MCP Apps). |
| `packages/protocol` | Shared message types. |
| `infra` | AWS CDK stack: ECS Fargate, ALB, S3, DynamoDB, Secrets Manager, CloudWatch, Budgets. |
| `e2e` | Full-game audit harness with screenshots and accessibility checks. |

## Run it locally

Needs Node 22+, pnpm, AWS credentials with Polly, Transcribe and Translate, and a model API key in `apps/server/.env` (see `apps/server/.env.example`).

```bash
pnpm install
pnpm build
pnpm --filter @accomplice/server start
```

Open `http://localhost:8787/tv/` on a big screen and scan the QR code with your phones. Phones need HTTPS for the microphone, so for real devices set `PUBLIC_URL` to an HTTPS tunnel.

Tests:

```bash
pnpm test
pnpm --filter @accomplice/e2e run audit
```

## Deploy

See [docs/AWS.md](docs/AWS.md).

## More

- [Architecture](docs/ARCHITECTURE.md)
- [Friction log](docs/FRICTION_LOG.md)
- [Product feedback](docs/PRODUCT_FEEDBACK.md)

## License

MIT
