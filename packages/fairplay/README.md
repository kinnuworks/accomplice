# fairplay

Murder mysteries that play fair, checked by a logic solver.

fairplay builds a fresh whodunit from a number (a seed). You get a setting with a floor plan, a handful of suspects with motives and voices, a crime, a timeline of where everyone really was, the lies some of them will tell, and a deck of clues dealt out over three rounds. Then a second, independent solver (Z3) checks the case before anyone plays it:

- **Exactly one answer.** Using only the clues, there is one culprit and one means that fit, and they are the right ones.
- **Every key clue matters.** Remove a key clue and the answer stops being unique.
- **It takes the whole game.** The case cannot be solved after round 1, and can be solved by round 3.
- **The accomplice cannot break it.** Any lie the engine hands to a secret accomplice keeps the answer unique.

Every clue card has a full `text` and a `short` face line of 12 words or fewer, every suspect has a `shortName`, and each case carries a `briefing` of four to six short narrator lines for the opening slides.

If a case fails any check, it is thrown away and the next seed is tried.

It was written for *Accomplice*, a living room party game where AI suspects answer questions out loud, so it also tells each suspect exactly what they know (and must lie about) and checks what they said afterwards. You can use it for anything that needs a fair mystery: a party game, a puzzle generator, a test bed for reasoning agents.

## Two tones

- **classic**: a bloodless country house style whodunit. Somebody is found very dead and very politely so. Witty, no gore.
- **cozy**: kid safe. The birthday cake vanished. The prize marrow was swapped for a supermarket courgette. Nobody dies.

Settings include Ashby Hall (a Cotswolds country house), The Sapphire Express (a snowbound night train) and Marigold Manor (a hill station villa in the monsoon). Ten suspect archetypes (the cook, the gardener, the butler, the heiress, the family doctor, the retired colonel, the painter, the society columnist, the stage magician, the hard-up nephew) work in both tones, each with a distinct Amazon Polly voice.

## Install

```sh
npm install fairplay z3-solver
```

Node 22 or newer. Z3 runs as WebAssembly, so there is nothing native to build.

## Example

```ts
import { generateVerifiedCase, proofChain, evaluateTheory, shutdownSolver } from 'fairplay';

const { c, report, tries } = await generateVerifiedCase({ seed: 2026, tone: 'classic', difficulty: 2 });

console.log(c.title);              // "Murder at Ashby Hall"
console.log(c.intro);              // narrator paragraph
console.log(report);               // { ok: true, uniqueCulprit: true, keyClues: [...], solvableByRound: 3, ms: 240, ... }

for (const clue of c.clues.filter((x) => x.round === 1 && x.visibility === 'board')) console.log(clue.text);

const pinned = c.clues.filter((x) => x.visibility === 'board').map((x) => x.id);
console.log(await evaluateTheory(c, pinned, { culprit: 'butler' })); // 'follows' | 'possible' | 'contradicted'

for (const step of proofChain(c)) console.log(step.says, '->', step.therefore);

await shutdownSolver(); // lets Node exit
```

## API

| Function | What it does |
| --- | --- |
| `generateCase({ seed, tone, difficulty, suspectCount? })` | Builds a case. Same input, same case, every time. Synchronous. |
| `verifyCase(case)` | Checks the case with Z3 and returns a `VerifyReport`: `ok`, `uniqueCulprit`, `culprit`, `keyClues`, `solvableByRound`, `safeAccompliceLies`, `ms`, `notes`. |
| `generateVerifiedCase(opts, maxTries = 25)` | Tries consecutive seeds until one verifies. Returns `{ c, report, tries }`. |
| `sliceFor(case, suspectId)` | What one suspect knows, in plain sentences ("At 9:00 pm you were in the Library."), the lies they must keep up, and what they must never reveal. Feed this, and only this, to whatever plays the suspect. |
| `checkReply(case, suspectId, claims)` | Checks location claims pulled from a suspect's reply. Flags falsehoods that are not that suspect's own permitted lie, anything that gives away the culprit, and claims about people the speaker never saw. |
| `evaluateTheory(case, pinnedClueIds, { culprit, item? })` | Using only the pinned clues: does the theory follow, is it merely possible, or is it contradicted? |
| `proofChain(case)` | Ordered steps from clues to the answer, each naming who it rules out. Made for a dramatic reveal. |
| `safeLiesForAccomplice(case)` | One to three false statements an accomplice may say aloud without making the case unfair. |
| `publicView(case)` | The case with the solution, lies, alibis and clues removed. Safe to send to every screen. |
| `describeFact(case, fact)` | One plain sentence for a clue's underlying fact, for captions and screen readers. |
| `shutdownSolver()` | Stops Z3's worker threads so a script can exit. |

Types (`Case`, `Clue`, `Fact`, `VerifyReport` and friends) live in `@accomplice/protocol` in the Accomplice repo; in the standalone package they ship alongside the code.

## How a case is built

1. **Pick a setting and cast.** A floor plan of 5 to 7 rooms with doors, five time slots, four or five suspects, a means (the candlestick, or the tea trolley someone used to wheel away the cake) and a few decoy items.
2. **Write the truth.** Every suspect takes a walk through the house, one room per slot, only through doors. The culprit's walk passes the means where it is kept, picks it up, and reaches the crime room at the crime slot. Nobody else is in that room then.
3. **Decide who lies.** The culprit lies about where they were at the crime slot. One or two innocents lie about something embarrassing at another time (eating trifle straight from the bowl). Those red herrings always have a clue that exposes them.
4. **Choose clues by argument.** The generator asks a small built-in reasoner for any *other* explanation that still fits the clues so far: a different culprit, or a different means. It then picks a true fact that this explanation gets wrong and adds it as a clue. It repeats until no other explanation survives, then drops any clue the others already imply. This is counterexample guided selection, and it means every chosen clue earns its place.
5. **Deal the clues.** Key clues are spread across the three rounds, on the shared board or with the first three seats (a game always has at least three players), with at least one in the last round. Extra seats get true flavour clues. A filler clue is only accepted if the case is still unsolvable before round 3.

## How verification works

`verifyCase` encodes the case for Z3 from scratch, without trusting the generator:

- `pos[s][t]`, the room of suspect *s* at slot *t*, as a small bit vector; moves only along doors.
- `culprit` and `means` as unknowns. The culprit is in the crime room at the crime slot, holding the means.
- Each item starts the evening at home. Only the means can move, only while the culprit holds it; it is picked up where it lies and stays where it was put down.
- Each clue is a typed fact (`at`, `notAt`, `saw`, `had`, `itemIn`) switched on by its own assumption literal, so the same solver answers every question below.

Then it checks:

1. The true story satisfies every rule and every clue.
2. **Uniqueness:** find a model, block its (culprit, means), and confirm the solver now says *unsat*. Done for the clues every table sees, and for all clues.
3. **Necessity:** for each clue, drop it and re-run the uniqueness check. The clues whose removal breaks uniqueness are the key clues, and they must match the generator's own flags.
4. **Pacing:** the earliest round whose clues already give a unique answer. Round 1 is a failure.
5. **Accomplice lies:** each one, added to all clues, must still leave exactly one answer.
6. **Cross-check:** the built-in reasoner and Z3 must agree.

## Numbers

Measured with `pnpm stats` (seeds 1 to N, difficulty 2), on a busy laptop:

| | classic | cozy |
| --- | --- | --- |
| Cases verified on the first seed | 200 / 200 (100%) | 200 / 200 (100%) |
| Median time to generate | 13 ms | 24 ms |
| Median time to verify with Z3 | 151 ms | 220 ms |
| Earliest round solvable | round 3 in every case | round 3 in every case |
| Median key clues per case | 4 | 4 |
| `generateVerifiedCase` tries | median 1, max 1 (50 runs) | median 1, max 1 (50 runs) |

The test suite (mixed difficulties 1 to 3) also verifies 200 seeds per tone, at a median of about 120 ms each. Timings include Z3 running in WebAssembly and vary with machine load.

Run them yourself:

```sh
pnpm stats 200      # N seeds per tone, optional second argument is difficulty
```

## Prior art

Generating mysteries by computer is an old and lively idea. Researchers and hobbyists have built murder mystery generators, clue and alibi planners, and deduction puzzle makers for decades, using story grammars, planners, constraint solvers and answer set programming, and logic puzzles with unique solutions have been machine generated and checked for even longer. fairplay borrows freely from that tradition. What it adds is a small, practical package: a TypeScript generator tuned for spoken party play, and an SMT solver used as a referee before every game.

## Licence

MIT, copyright Dhiraj Kavuri.
