# Accomplice: architecture and build contract

A living-room mystery party game for Fire TV (Vega OS). 3 to 6 players. The TV is the stage, phones are private controllers and microphones, AI suspects answer out loud in their own voices. One player may secretly be the culprit's accomplice. Every case is checked by a logic engine (Z3) before play, so there is always exactly one fair answer.

Writing rules for ALL text (UI copy, README, comments): plain, warm, human. No mention of any AI vendor's assistant brand in product text. No em dashes. Name things for players, not engineers.

## Repo layout (pnpm workspace, TypeScript, Node >= 22, ESM)

```
packages/protocol   shared TS types: WebSocket messages, case/public views (owner: lead)
packages/fairplay   case engine: generate, verify (Z3), slices, claim check, proof chain (owner: engine agent)
packages/mcp-game   MCP server factory for the game (Streamable HTTP, spec 2025-11-25) (owner: mcp agent)
apps/server         Node game server: rooms, phases, AI suspects, TTS, audio, static hosting, /mcp (owner: server agent)
apps/tv-web         10-foot TV UI (React + Vite), runs in browser and inside the Vega WebView (owner: tv agent)
apps/phone          phone web app (React + Vite), accessible first (owner: phone agent)
apps/echo-sim       Echo Show style MCP client simulator (React + Vite) (owner: mcp agent)
apps/vega           React Native for Vega shell that hosts tv-web (owner: lead, later)
assets/art          portraits, scenes (PNG/WebP)  assets/audio  SFX, music, pre-rendered lines
```

Ports in dev: server 8787 (HTTP + WS at /ws + MCP at /mcp, also serves built tv-web at /tv, phone at /p, echo-sim at /echo). Vite dev servers: tv-web 5173, phone 5174, echo-sim 5175, all proxy /ws, /api, /audio, /mcp to 8787.

## Game flow (phases)

`lobby -> briefing -> investigate (3 rounds) -> accuse -> reveal -> results`

1. lobby: TV shows room code (4 letters) + QR to `https://<host>/p?room=CODE`. Phones join with a name. Host (first phone or the TV remote) picks tone (classic | cozy) and starts.
2. briefing: narrator voice sets the scene; each phone gets its secret role card: `detective` or `accomplice` (accomplice only if >= 4 players; accomplice learns the culprit and gets "safe lies" they may tell).
3. investigate: each round, every player gets 2 questions. A player picks a suspect on the phone, holds the talk button and asks out loud (browser speech recognition; typed fallback). The suspect answers on the TV with voice + captions. Each round also reveals 1 to 2 physical clues on the board (shared) and 1 private clue per player (on phone). Players can pin clues and link them on the TV board with the remote; "Prove it" asks the engine whether the pinned theory follows, is possible, or is contradicted.
4. accuse: each phone votes culprit (+ means) and, if an accomplice existed, who the accomplice was.
5. reveal: TV replays the proof chain step by step (clue -> fact -> eliminated suspect), then unmasks culprit and accomplice. Scores.

## The engine contract (packages/fairplay)

```ts
export type Tone = 'classic' | 'cozy';
export interface GenerateOptions { seed: number; tone: Tone; difficulty: 1 | 2 | 3; suspectCount?: 4 | 5; }
export function generateCase(opts: GenerateOptions): Case;              // deterministic from seed
export function verifyCase(c: Case): Promise<VerifyReport>;               // Z3
export function generateVerifiedCase(opts: GenerateOptions, maxTries?: number): Promise<{ c: Case; report: VerifyReport; tries: number }>;
export function sliceFor(c: Case, suspectId: string): SuspectSlice;      // only what this suspect knows + allowed lies
export function checkReply(c: Case, suspectId: string, claims: Claim[]): ClaimCheck; // claims extracted from a reply
export function evaluateTheory(c: Case, pinnedClueIds: string[], theory: Theory): Promise<'follows'|'possible'|'contradicted'>;
export function proofChain(c: Case): ProofStep[];                         // for the reveal
export function safeLiesForAccomplice(c: Case): AccompliceLie[];         // lies that keep the case uniquely solvable
export function publicView(c: Case): PublicCase;                          // safe to send to TV/phones (no solution)
```

Case model (summary; full types in packages/protocol):
- setting: title, place, date line, tone, intro paragraph (narrator).
- rooms: 5 to 7 named rooms with adjacency (for the floor plan).
- slots: 5 time slots (e.g. 8:00, 8:30, 9:00, 9:30, 10:00 pm).
- suspects: 4 to 5, each { id, name, role ("the cook"), traits, voiceId, portrait, motive, alibiClaim per slot }.
- victim (classic: a death, bloodless; cozy: a theft, e.g. the birthday cake), crimeRoom, crimeSlot, means (weapon or tool) with where it was kept.
- truth: position[suspect][slot] = room, culprit id, means.
- clues: { id, kind: 'physical'|'document'|'testimony', text, visibility: 'board'|'private', round, fact: FactRef } where FactRef is a typed atom the solver understands: `at(suspect, room, slot)`, `notAt(...)`, `had(suspect, item, slot)`, `itemIn(item, room, slot)`, `saw(suspectA, suspectB, room, slot)`.
- lies: per suspect, which alibi facts they lie about (culprit always lies about crime slot; 1 to 2 innocents lie about something embarrassing but irrelevant: red herrings).

Verification (Z3): variables pos[s][t] in rooms, culprit in suspects, holder of means per slot. Constraints: movement only between adjacent rooms between consecutive slots; every truthful clue fact; culprit is at crimeRoom at crimeSlot and had means. Checks: (1) exactly one culprit satisfiable with all clues; (2) for each clue marked key, removing it makes >1 culprit possible (necessity); (3) solvable by round 3; (4) each accomplice safe lie keeps (1) true. Report includes stats: solve depth, key clues, time ms.

## AI suspects (apps/server)

Provider interface so we can swap vendors with one env var:
```ts
interface TextModel { complete(req: { system: string; messages: {role:'user'|'assistant'; content:string}[]; maxTokens?: number; json?: boolean }): Promise<string>; }
```
`MODEL_PROVIDER=anthropic|bedrock` (anthropic uses ANTHROPIC_API_KEY from apps/server/.env; bedrock uses AWS creds, model ids configurable). Reply pipeline: question -> prompt built ONLY from sliceFor() -> short in-character reply (<= 2 sentences, spoken style) -> extract claims (second small call, JSON) -> checkReply(); on violation retry once, then use a safe deflection line -> TTS -> broadcast.

Voices: `TTS_PROVIDER=polly` (Amazon Polly neural/generative, each suspect a distinct voice; narrator voice separate) with an mp3 cache on disk by hash. Later `nova-sonic`. Audio served at `/audio/<hash>.mp3`.

## WebSocket protocol (packages/protocol)

Single endpoint `/ws?role=tv|phone&room=CODE&pid=<playerId>`. JSON messages `{ t: string, ... }`. Server is authoritative. See packages/protocol/src/index.ts for exact types. TV and phones must only render from server state (`room:state` for public state, `you:state` for a phone's private state).

## Accessibility (non-negotiable)

- Every TV event is also spoken by the narrator and shown as captions (large, high contrast).
- Phone app: semantic HTML, every control labeled, works fully with VoiceOver and TalkBack, 48px+ targets, haptic + audio cue on talk start/stop, "Read my clues" button and voice command, no time limits that cannot be extended, respects reduced motion.
- TV: visible focus ring, everything reachable by D-pad, Back never loses progress without confirmation, text readable at 3 m (min 28px body at 1080p).

## Design direction

Witty, warm, theatrical; a parlour at night. Deep ink and plum backgrounds, brass and candle-gold accents, paper-card clues with handwriting accents, red string on the board. Display serif for titles, clean sans for body. Motion is purposeful (cards flip, string draws, portraits lean in when speaking). Sound: soft ambient room tone, card flip, pin, string pull, typewriter for notes, gavel or bell at accusation, reveal sting.
