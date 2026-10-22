// pnpm --filter @accomplice/server simulate [--players 4] [--tone cozy] [--offline]
export {};
// Plays a full game headless with bots against an in-process server and prints timings.
const args = process.argv.slice(2);
const flag = (k: string) => args.includes(`--${k}`);
const val = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
if (flag('offline')) { process.env.MODEL_PROVIDER = 'mock'; process.env.TTS_PROVIDER = 'none'; process.env.TRANSLATE = 'off'; }
process.env.SPEECH_WAIT ??= '0';
process.env.LOG_LEVEL ??= 'warn';

const { buildServer } = await import('../src/server.js');
const { cfg } = await import('../src/config.js');
const { sessionStats } = await import('../src/audit.js');
const { pollyStats } = await import('../src/tts.js');
const { simulateGame } = await import('./sim-lib.js');

const { app, hub } = await buildServer();
await app.listen({ port: 0, host: '127.0.0.1' });
const port = (app.server.address() as any).port;
console.log(`engine=${hub.engine.source} model=${cfg.modelProvider}${cfg.modelProvider === 'anthropic' ? `(${cfg.anthropicModel})` : ''} tts=${cfg.ttsProvider} narrator=${cfg.narratorVoice}`);
const res = await simulateGame(`ws://127.0.0.1:${port}`, { players: Number(val('players', '4')), tone: val('tone', 'classic') as any, burst: flag('burst'), log: (s) => console.log(s) });

const room = hub.get(res.code)!;
await room.narrationIdle();
await new Promise((r) => setTimeout(r, 4000)); // let background second-pass audits land
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0; };
const stat = (label: string, xs: number[]) => console.log(`  ${label.padEnd(28)} n=${String(xs.length).padStart(2)}  p50=${String(pct(xs, 50)).padStart(5)} ms  p95=${String(pct(xs, 95)).padStart(5)} ms  max=${String(Math.max(0, ...xs)).padStart(5)} ms`);
const answers = room.timings.filter((t) => t.kind === 'answer');
const flat = (k: string) => answers.flatMap((t) => ([] as number[]).concat((t.detail as any)?.[k] ?? []));
console.log('\nTimings');
console.log(`  case generation             ${res.timings.caseGenMs} ms`);
const d = (k: string) => answers.map((t) => (t.detail as any)?.[k]).filter((x) => typeof x === 'number') as number[];
const fromTurn = (k: string) => answers.filter((t) => typeof (t.detail as any)?.[k] === 'number').map((t) => (t.detail as any)[k] - (t.detail as any).waitedMs);
stat('accepted -> filler sent', d('fillerMs'));
stat('accepted -> first sentence', d('firstPartMs'));
stat('accepted -> full reply', d('fullMs'));
stat('turn -> filler sent', fromTurn('fillerMs'));
stat('turn -> first sentence', fromTurn('firstPartMs'));
stat('  model first sentence', d('firstSentenceMs'));
stat('  claim check (per sentence)', flat('extractMs'));
console.log(`  answers with a filler: ${d('fillerMs').length}/${answers.length}; sentences per answer: ${(answers.reduce((n, t) => n + ((t.detail as any)?.sentences ?? 0), 0) / Math.max(1, answers.length)).toFixed(1)}`);
stat('narration (tts)', room.timings.filter((t) => t.kind === 'narration').map((t) => t.ms));
stat('prove it (bot round trip)', res.timings.proveItMs);
console.log(`  polly calls ${pollyStats.calls}, throttled ${pollyStats.throttled}, slow (>4 s) ${pollyStats.slow.length}`);
if (args.includes('--verbose')) console.log(pollyStats.slow);
console.log(`  whole game                  ${res.timings.totalMs} ms`);
const a = sessionStats();
console.log(`\nFair play audit: ${a.replies} replies, ${a.checks} sentence checks, ${a.claimsChecked} claims checked, ${a.firstPassOk} clean first time, ${a.caughtViolations} slips caught, ${a.fixedOnRetry} fixed on retry, ${a.droppedSentences} later sentences dropped, ${a.deflected} deflected; second pass re-checked ${a.secondPassChecked}, disagreements (possible leaks) ${a.leakedToPlayers}`);
console.log(`Result: culprit ${res.culprit}, ${res.votedRight} detective(s) right, accomplice ${res.accomplice ? 'present' : 'absent'}, scores ${JSON.stringify(res.scores)}`);
await app.close();
process.exit(0);
