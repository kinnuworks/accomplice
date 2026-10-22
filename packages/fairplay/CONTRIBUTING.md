# Contributing to fairplay

Thanks for helping. Mysteries are better with more detectives.

## Getting started

```sh
npm install
npm test            # unit tests plus a 200 seed Z3 verification run per tone
npm run stats -- 50 # benchmark: pass rate and timings
npx tsx examples/cli.ts 42 cozy --solve
```

Set `FAIRPLAY_SEEDS=20` for a quicker test run while you work.

## Good first contributions

- **A new setting.** Add a `SettingDef` to `src/content.ts`: five to seven rooms on a 16 x 9 grid, doors only between rooms that share a wall (a test checks this), one or two crimes per tone, and four or five items with home rooms.
- **More phrasing.** Clue templates live in `src/text.ts`. Every template must say exactly what its fact says, no more.
- **A new fact type.** Add it to the `Fact` type, then to the reasoner in `src/logic.ts` and the Z3 encoding in `src/verify.ts`. The two must agree; `verifyCase` fails if they do not.

## House rules for text

- Warm, witty, and plain. Classic is bloodless; cozy is kid safe (nobody dies, nothing scary).
- No em dashes.
- A clue's text must never claim more than its fact. If a template implies who else was in a room, the generator must only use it when that is true.

## Pull requests

Keep them focused, include a test, and run `npm run stats -- 50` before you push. If verification drops below 100 percent on those seeds, say why in the description.

By contributing you agree that your work is released under the MIT licence and that you will follow the [code of conduct](CODE_OF_CONDUCT.md).
