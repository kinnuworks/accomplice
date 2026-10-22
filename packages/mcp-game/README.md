# @accomplice/mcp-game

The Accomplice add-on for voice assistants: an MCP server (spec 2025-11-25, Streamable HTTP) that lets a smart display host a living-room murder mystery. Built for Alexa+ add-ons, and it works with any MCP client.

## What it offers

**Tools.** Each one returns a short spoken line (`speech`), a plain text copy for voice-only devices, and `structuredContent` for the screen.

| Tool | What it does |
|---|---|
| `start_case` | Builds a new case that has exactly one fair answer. Runs as an MCP task with status updates. `weekly: true` plays the case of the week. |
| `case_summary` | The case file: victim, place, time, suspects, clues. |
| `list_suspects` | Who is under suspicion, with roles and motives. |
| `question_suspect` | Asks a suspect a question. Names or roles work ("the cook"). |
| `examine_clue` | Reads a clue card, or lists the board. |
| `next_round` | Pins the next round's clues. |
| `get_hint` | One deduction step. A second hint waits until the players act on the first. |
| `accuse` | Confirms with the household first (elicitation, or a spoken yes), then reveals the answer. |
| `my_detective_record` | The household's career across sessions: solved, streak, favourite suspect, unfinished case. |
| `resume_case` | Picks up last night's case, or joins the game on the TV with a room code. |
| `send_to_tv` | Moves the case to the Fire TV and returns the room code and phone link. |

**Resources.**
- `ui://accomplice/board.html`: an MCP Apps view (case file, suspect card, evidence board, verdict stamp, detective record, TV handoff). Every tool points to it through `_meta.ui.resourceUri`.
- `accomplice://skill/SKILL.md`: the open-format agent skill, also in `skill/accomplice/`. It tells any agent host when to use the game, how to call each tool, how to narrate aloud, and the safety rules.

## Using it

```ts
import { createMcpHandler } from '@accomplice/mcp-game';

const mcp = createMcpHandler(gameApi);            // the game server's API, or createFakeGameApi() for tests
http.createServer((req, res) => req.url?.startsWith('/mcp') ? mcp(req, res) : notFound(res));
// Fastify: app.all('/mcp', (req, reply) => { reply.hijack(); return mcp(req.raw, reply.raw, req.body); })
```

The game server mounts it at `/mcp` automatically. Its room based API is adapted for you: each household gets a room, and a household without one joins the game already running on the TV.

**Households.** State is keyed by household, never by MCP session, the way Alexa+ keeps its own conversation. The household comes from the `X-Household-Id` header, a hash of the bearer token, or the `household` argument. Sessions are optional: send `initialize` to get one (needed for elicitation), or just POST any request without one.

**Detective records** go to DynamoDB when `ACCOMPLICE_RECORDS=dynamodb` and `ACCOMPLICE_RECORDS_TABLE` are set (partition key `household`), otherwise to a JSON file at `ACCOMPLICE_RECORDS_FILE` (default `.data/detective-records.json`).

**Narrator voice.** When the game offers `narrate(text)`, spoken lines carry a `narrationUrl` in the same voice the TV uses.

## The house host

`packages/host-agent` is a Strands Agents agent that plays the game through this server's MCP tools, for free-form speech the Echo page's quick router cannot handle. See `docs/AWS.md`, section "Strands Agents".

## Running and testing

```sh
pnpm --filter @accomplice/mcp-game dev     # the add-on alone on :8787 with the test game
pnpm --filter @accomplice/mcp-game test    # the SDK client against real Streamable HTTP
```

The Echo Show simulator in `apps/echo-sim` is a real MCP client for this server.
