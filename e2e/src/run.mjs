#!/usr/bin/env node
// One command audit: pnpm --filter @accomplice/e2e audit [--only=main,resilience,three,six,cozy] [--skip-build] [--real]
import fs from 'node:fs';
import path from 'node:path';
import { E2E } from './paths.mjs';
import { build, startServer } from './server.mjs';
import { Run } from './harness.mjs';
import { auditCopy, nameConsistency } from './copy.mjs';
import { writeReport } from './report.mjs';
import { main } from './scenarios/main.mjs';
import { resilience, three, sixPlusAudience, cozy, realProvider } from './scenarios/more.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const ALL = ['main', 'resilience', 'three', 'six', 'cozy'];
let only = args.only ? String(args.only).split(',') : ALL;
if (args.real && !args.only) only = [...ALL, 'real'];
if (args.real && args.only && !only.includes('real')) only.push('real');
const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = path.join(E2E, 'out', runId);
fs.mkdirSync(outDir, { recursive: true });
const logFile = path.join(outDir, 'run.log');
const log = (s) => { const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`; console.log(line); fs.appendFileSync(logFile, line + '\n'); };

const SCEN = { main, resilience, three, six: sixPlusAudience, cozy, real: realProvider };

let buildInfo = { skipped: true };
if (!args['skip-build']) {
  log('building tv-web and phone...');
  buildInfo = build(log);
  log(`build: ${JSON.stringify(Object.fromEntries(Object.entries(buildInfo).map(([k, v]) => [k, v.ok ? 'ok' : v.viteOk ? 'type errors, bundled anyway' : 'FAILED'])))}`);
}

const servers = [];
const cleanup = async () => { for (const s of servers) await s.stop(); };
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

const results = { runId, startedAt: new Date().toISOString(), build: buildInfo, scenarios: {}, servers: [] };
const runs = [];
try {
  const mockScen = only.filter((s) => s !== 'real');
  if (mockScen.length) {
    const srv = await startServer({ real: false, outDir });
    servers.push(srv);
    results.servers.push({ mode: 'mock', port: srv.port, pid: srv.pid, health: srv.health, startMs: srv.startMs });
    log(`mock server pid ${srv.pid} on ${srv.url} (engine ${srv.health.engine}, model ${srv.health.model?.provider}, tts ${JSON.stringify(srv.health.tts)})`);
    const run = new Run({ name: 'mock', outDir, baseUrl: srv.url, log });
    await run.init();
    runs.push(run);
    for (const s of mockScen) await runScenario(run, s);
    await run.close();
    await srv.stop();
  }
  if (only.includes('real')) {
    const srv = await startServer({ real: true, outDir });
    servers.push(srv);
    results.servers.push({ mode: 'real', port: srv.port, pid: srv.pid, health: srv.health, startMs: srv.startMs });
    log(`real-provider server pid ${srv.pid} on ${srv.url} (model ${srv.health.model?.provider} ${srv.health.model?.model})`);
    const run = new Run({ name: 'real', outDir, baseUrl: srv.url, log });
    await run.init();
    runs.push(run);
    await runScenario(run, 'real');
    await run.close();
    await srv.stop();
  }
} catch (e) {
  log(`FATAL ${e.stack}`);
  results.fatal = e.message;
} finally {
  await cleanup();
}

async function runScenario(run, s) {
  const t0 = Date.now();
  log(`--- scenario ${s} ---`);
  run.scenario = s;
  let res = null;
  try {
    res = await SCEN[s](run);
  } catch (e) {
    log(`scenario ${s} aborted: ${e.message.split('\n')[0]}`);
    const snap = await run.snap('ABORTED').catch(() => ({ dir: '' }));
    run.finding({ sev: 'P0', area: 'tv', title: `Scenario "${s}" could not finish`, repro: `pnpm --filter @accomplice/e2e audit --only=${s}`, expected: 'Scenario plays to the end.', actual: e.message.split('\n')[0].slice(0, 300), shot: snap.dir });
  }
  // phase timeline from the TV probe
  const tv = run.devices.filter((d) => d.kind === 'tv' && !d.closed).at(-1);
  let phases = [];
  if (tv) {
    const q = await run.probe(tv);
    let last = '';
    for (const f of q?.ws ?? []) {
      if (f.m.t !== 'room:state') continue;
      const k = `${f.m.phase}${f.m.phase === 'investigate' ? ` ${f.m.round}` : ''}`;
      if (k !== last) { phases.push({ t: f.t, phase: k }); last = k; }
    }
    phases = phases.map((p, i) => ({ ...p, ms: (phases[i + 1]?.t ?? Date.now()) - p.t }));
  }
  let timings = null;
  if (run.code) { try { timings = await (await fetch(`${run.baseUrl}/api/rooms/${run.code}/timings`)).json(); } catch { /* */ } }
  results.scenarios[`${run.name}:${s}`] = { ms: Date.now() - t0, phases, serverTimings: timings, code: run.code };
  // close this scenario's devices
  for (const d of run.devices) if (!d.closed) { d.closed = true; d.scenario = s; await d.context.close().catch(() => {}); }
  log(`scenario ${s} done in ${Math.round((Date.now() - t0) / 1000)} s`);
}

// ---------- analysis ----------
const all = { covered: [], findings: [], checks: [], moments: [], media: [], latency: [], logs: [], timeline: [] };
for (const r of runs) {
  all.findings.push(...r.findings.map((f) => ({ ...f, run: r.name })));
  all.checks.push(...r.checks.map((c) => ({ ...c, run: r.name })));
  all.moments.push(...r.moments.map((m) => ({ ...m, run: r.name })));
  all.media.push(...r.media.map((m) => ({ ...m, run: r.name })));
  all.latency.push(...r.latency.map((m) => ({ ...m, run: r.name })));
  all.covered.push(...(r.covered ?? []).map((m) => ({ ...m, run: r.name })));
  all.timeline.push(...r.timeline.map((m) => ({ ...m, run: r.name })));
  for (const d of r.devices) all.logs.push(...d.logs.map((l) => ({ ...l, device: d.name, run: r.name })));
}
const names = runs.flatMap((r) => r.caseNames ?? []);
for (const r of runs) for (const sc of Object.values(r.extraNames ?? {})) names.push(...sc);
all.copy = auditCopy(all.moments, { names });
all.names = runs.flatMap((r) => (r.case ? nameConsistency(all.moments.filter((m) => m.run === r.name && m.scenario === 'main'), r.case, (r.mainPhones ?? []).map((p) => ({ name: p.player }))) : []));
results.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ ...results, ...all }, null, 1));
const reportPath = writeReport(outDir, results, all);
try { fs.rmSync(path.join(E2E, 'out', 'latest'), { force: true }); fs.symlinkSync(runId, path.join(E2E, 'out', 'latest')); } catch { /* */ }
log(`report: ${reportPath}`);
log(`findings: ${all.findings.length} flow, ${all.checks.reduce((n, c) => n + c.issues.length, 0)} layout, ${all.copy.length} copy, ${all.logs.length} console/network`);
process.exit(0);
