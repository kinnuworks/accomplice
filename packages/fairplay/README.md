# fairplay

Generate deduction mysteries and prove with Z3 that each one has exactly one solution.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tests: 28 passing](https://img.shields.io/badge/tests-28%20passing-brightgreen.svg)](test)
[![Node >= 22](https://img.shields.io/badge/node-%3E%3D22-339933.svg)](package.json)

Repository: [github.com/kinnuworks/fairplay](https://github.com/kinnuworks/fairplay)

![generate, verify with Z3, play](docs/how-it-works.svg)

fairplay writes a whodunit from a seed: a house with a floor plan, a cast of suspects with motives and voices, a crime, where everyone was all evening, who lies and why, and a deck of clues dealt over three rounds. Then `verifyCase` re-encodes the case for the Z3 SMT solver and checks it without trusting the generator. A case that fails a check is reported with `ok: false` and plain notes, and `generateVerifiedCase` moves on to the next seed.

**Used by:** Accomplice, a Fire TV party game where AI suspects answer questions out loud.

## Run it

Node 22 or newer. Z3 ships as WebAssembly, so there is nothing native to compile. The package is not on npm yet, so build it from the repository:

```sh
git clone https://github.com/kinnuworks/fairplay && cd fairplay
npm install && npm run build
```

Save this as `example.mjs` in the repository root and run `node example.mjs`. (Inside the repository, Node resolves `'fairplay'` to the package itself.)

```js
import { generateCase, verifyCase, shutdownSolver } from 'fairplay';

const c = generateCase({ seed: 7, tone: 'classic', difficulty: 2 });
console.log(c.title);
console.log('Suspects:', c.suspects.map((s) => s.name).join(', '));

const report = await verifyCase(c);
console.log('ok:', report.ok, '| culprit:', report.culprit, '| matches truth:', report.culprit === c.truth.culprit);
console.log('key clues:', report.keyClues.join(', '), '| solvable by round:', report.solvableByRound);
console.log('safe accomplice lies:', report.safeAccompliceLies, '| verified in', report.ms, 'ms');

await shutdownSolver();
```

Output (Node 26.12.0, Apple M5):

```text
The Marigold Manor Mystery
Suspects: Teddy Marchbanks, Mrs. Meena Iyer, Ned Furrow, Pippa Quill, Letitia Sharpe
ok: true | culprit: journalist | matches truth: true
key clues: r1b2, r2s0, r3s0 | solvable by round: 3
safe accomplice lies: 3 | verified in 249 ms
```

The case text is identical for the same options on any machine. The `ms` value varies, and the first call in a process includes about 100 ms of Z3 start up.

More to try:

```sh
npx tsx examples/cli.ts 42 classic --solve      # a full case in your terminal
npx serve .                                     # then open /examples/playground/
```

## What the solver guarantees

`verifyCase(c)` sets `report.ok` to `true` only when every check below passes. Each check is a Z3 query on a model of the case: rooms, doors, five time slots, where each suspect is at each slot, where each item is, who did it and with what. The source is `src/verify.ts`.

| Guarantee | What is checked | Report field |
| --- | --- | --- |
| The true story fits | The real timeline satisfies the movement rules and every clue. | part of `ok` |
| Unique culprit | With the clues every table sees (the board plus private clues for the first three seats), exactly one culprit and one means fit, and they are the intended ones. The same holds with every seat's clues. | `uniqueCulprit`, `culprit` |
| Every key clue is necessary | Each clue is removed in turn. The clues whose removal leaves more than one answer are the key clues. This list must match the generator's own `key` flags exactly, and must not be empty. | `keyClues` |
| Solvable within 3 rounds | Clues are added round by round. The earliest round with a unique answer must be 2 or 3. A table holding every seat's round 1 clues must not have a unique answer. | `solvableByRound` |
| Safe sabotage | Hiding any one clue that is not in `keyClues` leaves the answer unique, because `keyClues` is exactly the set of clues whose removal breaks uniqueness. Accomplice uses this for its "smudge a clue" move, and also re-checks the reduced case with `verifyCase`. Hiding two clues at once is not checked. | `keyClues` |
| Safe accomplice lies | Each lie from `safeLiesForAccomplice` is added to all the clues as if true, and the answer must stay unique and correct. There must be at least one such lie. | `safeAccompliceLies` |
| Safe slips | For each suspect who lies, the true fact `objectionSlip` would reveal is added to the round 1 clues, and the case must still not be solvable in round 1. | part of `ok` |
| Two reasoners agree | The built-in reasoner in `src/logic.ts` (used by the generator) must give the same uniqueness answer as Z3. | part of `ok` |

The tests in `test/verify.test.ts` generate and verify 200 seeds per tone across all three difficulties and require at least 95% to pass (all 400 pass today). They also check, with the built-in reasoner, that removing each key clue makes the answer ambiguous, and that a case with its key clues stripped is rejected. `test/play.test.ts` checks that accomplice lies are false statements and that every slip is a true fact that never places the culprit at the crime.

## API

Main entry `fairplay` (Node, includes Z3). Browser entry `fairplay/core` has everything except `verifyCase`, `generateVerifiedCase`, `shutdownSolver` and `inMinTable`, and loads no WebAssembly. Types such as `Case`, `Clue`, `Fact` and `VerifyReport` are exported from both.

Everything is synchronous and deterministic except the functions that return a Promise.

```ts
generateCase(opts: GenerateOptions): Case
// GenerateOptions = { seed: number; tone: 'classic' | 'cozy'; difficulty: 1 | 2 | 3; suspectCount?: 4 | 5 }

verifyCase(c: Case): Promise<VerifyReport>
// VerifyReport = { ok, uniqueCulprit, culprit: string | null, keyClues: string[],
//                  solvableByRound: 1 | 2 | 3 | null, safeAccompliceLies: number, ms: number, notes: string[] }

generateVerifiedCase(opts: GenerateOptions, maxTries = 25): Promise<{ c: Case; report: VerifyReport; tries: number }>

shutdownSolver(): Promise<void>

sliceFor(c: Case, suspectId: string): SuspectSlice
checkReply(c: Case, suspectId: string, claims: Claim[]): ClaimCheck
publicView(c: Case): PublicCase

evaluateTheory(c: Case, pinnedClueIds: string[], theory: { culprit: string; item?: string }): Promise<'follows' | 'possible' | 'contradicted'>
proofChain(c: Case): ProofStep[]
safeLiesForAccomplice(c: Case): AccompliceLie[]
objectionSlip(c: Case, suspectId: string, said?: Claim[] | string): Objection
describeFact(c: Case, f: Fact): string
```

- **`generateCase`** builds a case. Same options, same case. `difficulty` 1 uses four suspects, two decoy items, one innocent liar and more direct clues. 2 and 3 use five suspects, three decoys and up to two innocent liars, and 3 leans on clues that must be chained together.
- **`verifyCase`** runs the checks in the table above. `notes` explains any failure in plain words.
- **`generateVerifiedCase`** tries `seed`, `seed + 1`, and so on until a case verifies. If none of `maxTries` verify, it returns the last attempt, so check `report.ok`.
- **`shutdownSolver`** stops Z3's worker threads so a Node process can exit. Safe to call more than once.
- **`sliceFor`** returns what one suspect knows (`knows`), the lies they must keep up (`mustLie`), and what they must never say (`mayNotReveal`), as plain sentences. Give this, and only this, to whatever plays the suspect.
- **`checkReply`** takes location claims extracted from a suspect's answer (`{ kind: 'location', s, room, slot }`) and returns `{ ok, violations }`. It flags falsehoods that are not that suspect's permitted lie, claims that give away the culprit, and claims about people the speaker never saw.
- **`publicView`** strips the solution, lies, alibis and clues. Safe to send to every screen.
- **`evaluateTheory`** says whether a theory is proven, still possible, or ruled out by the pinned clues alone. It uses the built-in reasoner and makes no Z3 call.
- **`proofChain`** gives ordered steps from clues to the answer, each with `says`, `therefore` and the suspects it `eliminates`.
- **`safeLiesForAccomplice`** gives one to three false sightings a secret accomplice may say aloud.
- **`objectionSlip`** handles a player shouting "Objection!". If the answer contained a lie, the suspect admits one true fact (`wasLying: true`, `slip`, `fact`). Otherwise it returns a `retort`. The culprit is never made to place themselves at the crime.
- **`describeFact`** turns a typed fact into one sentence, for captions and screen readers.

Lower level helpers (`analyse`, `worldOf`, `toIFact`, `slipFact`, `inMinTable`, `MIN_SEATS`) are exported for tools and tests.

### What is in a case

| Field | What it is |
| --- | --- |
| `title`, `place`, `dateLine`, `intro`, `briefing` | The story, plus short narrator lines for opening slides |
| `rooms` | Five to seven rooms with `x, y, w, h` on a 16 x 9 grid and the doors between them |
| `slots` | Five times of the evening, half an hour apart |
| `suspects` | Name, `shortName`, role, speaking traits, motive, voice id, portrait key, and their claimed alibi |
| `items` | The means and some decoys, each with the room it is kept in |
| `crime` | Where and when it happened, what happened, and the means |
| `clues` | Title, `text`, a `short` card face of 12 words or fewer, round, board or private seat, and the typed `fact` behind it |
| `truth`, `lies` | The real timeline, the culprit, who held the means, and every lie with its reason |
| `confession`, `headline`, `paperName`, `clockChimes` | Extras for the reveal |

Two tones: **classic**, a bloodless country house whodunit, and **cozy**, which is safe for children (a missing cake, a swapped prize marrow). Three settings: Ashby Hall, The Sapphire Express and Marigold Manor. Ten suspect archetypes, each with an Amazon Polly voice id.

## Measured numbers

Measured on 23 October 2026: Apple M5 (10 cores), Node 26.12.0, load average about 5.

| | Result |
| --- | --- |
| Tests (`npm test`) | 28 passing in 3 files, 61 s (most of it is verifying 400 cases) |
| Generate + verify one case, median of 10 (seeds 1 to 10, difficulty 2) | classic 143 ms (generate 4 ms, verify 140 ms); cozy 149 ms (generate 4 ms, verify 144 ms) |
| First Z3 call in a process, including solver start up | about 235 ms |
| `npm run stats -- 200`, seeds 1 to 200 per tone, difficulty 2 | 200 / 200 classic and 200 / 200 cozy verify on the first seed |
| Median verify time over those 200 seeds | classic 134 ms, cozy 136 ms |
| Earliest solvable round over those 200 seeds | round 3 in every case |
| Median key clues per case | 4 |

The 10 case timing excludes one warm up case so that Z3 start up is not counted. Each verification makes several dozen Z3 queries: truth, uniqueness, one per clue for necessity, one per round, and one per accomplice lie and objection slip. CI runs the tests and a 50 seed benchmark on Node 22 and 24.

## How the proof works

The unknowns are which room each suspect was in at each time, who did it, and with what. The rules:

1. People move only through doors, one room per half hour, or stay put.
2. The culprit was in the crime room at the crime time, holding the means.
3. Every item starts where it is kept. Only the means moves, and only while the culprit carries it.
4. Every clue is true. A clue is a typed fact: someone was or was not somewhere, two people were together, an item was in a room, someone had an item.

**Building.** The generator writes a true story first. It then asks its built-in reasoner whether any other story fits the clues so far with a different culprit or means. If one does, it adds a true fact that the other story gets wrong. It repeats until no other story survives, then removes clues the rest already imply. This is counterexample guided selection.

**Checking.** `verifyCase` gives the same rules and clues to Z3. Z3 finds a story that fits, is told to exclude that culprit and means, and is asked again. If the answer is unsat, the solution is unique. The other checks repeat this with clues removed, with only early rounds, and with lies or slips added.

**Small groups.** Key clues are dealt only to the shared board and the first three seats, so the proof holds for any table of three or more players. Extra seats get true flavour clues.

## Limits

- Not published to npm yet. Build from the repository.
- Three settings, two tones, ten archetypes. Variety comes from combining them.
- Facts are about places and objects at five fixed half hour slots. There is no reasoning about motives, sounds, or overlapping times.
- The proof covers the typed facts. The clue text is generated from those facts and is covered by tests, but Z3 does not read the text, and whether players find the answer depends on how clues are presented.
- Safe sabotage is proven for hiding one clue at a time.
- `checkReply` only understands location claims, and you have to extract them from speech yourself. `objectionSlip` can take raw text, but then it only matches room names and times.
- `evaluateTheory` uses the built-in reasoner. `verifyCase` checks that this reasoner agrees with Z3 on the case's own clue set, but not on every subset of clues a player might pin.
- The Z3 slip check covers the slip each suspect gives when `objectionSlip` is called without an answer. When you pass the claims from a specific answer, a different lie may be chosen, and that slip is screened by the built-in reasoner only.
- Z3 runs in worker threads. Call `shutdownSolver()` or a Node script will not exit.
- English only.

## Roadmap

- More settings and a content pack format, so others can ship their own houses and casts.
- New fact types: sounds through walls, times between slots, locked doors.
- Difficulty measured by proof length.
- Translations.

## Contributing

Issues and pull requests are welcome, especially new settings and clue phrasing. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md). If a case looks unfair, open an issue with the seed, tone and difficulty.

## Prior art

Mystery generators, clue and alibi planners, and logic puzzle makers with unique solutions have been built for decades, using story grammars, planners, constraint solvers and answer set programming. fairplay is a small TypeScript package in that tradition, tuned for spoken party play, with an SMT solver checking every case before it is used.

## Licence

MIT, copyright Dhiraj Kavuri. See [LICENSE](LICENSE). Changes are listed in [CHANGELOG.md](CHANGELOG.md).
