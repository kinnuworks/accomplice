// Turns raw results into e2e/out/<run>/report.md: flow failures, grouped layout issues, axe, console,
// audio, timing and copy findings. docs/QA_REPORT.md is written by a person from this.
import fs from 'node:fs';
import path from 'node:path';

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const ms = (v) => (v === null || v === undefined ? 'n/a' : `${(v / 1000).toFixed(2)} s`);

function mediaKind(url) {
  if (/\/audio\/[0-9a-f]+/i.test(url)) return 'voice (server TTS)';
  if (/\/sfx\//.test(url)) return 'sfx';
  if (/\/music\//.test(url)) return 'music';
  if (/assets\/audio/.test(url)) return 'asset audio';
  return 'other media';
}

export function summarize(all) {
  // group layout issues across phases by type + selector + text
  const groups = new Map();
  for (const c of all.checks) {
    for (const i of c.issues) {
      const k = `${c.kind}|${i.type}|${i.sel}|${(i.text ?? '').slice(0, 40)}`;
      const g = groups.get(k) ?? { kind: c.kind, type: i.type, sel: i.sel, text: i.text, details: new Set(), where: [], shots: [] };
      g.details.add(i.detail);
      g.where.push(`${c.scenario}/${c.phase}/${c.device}`);
      if (g.shots.length < 3) g.shots.push(c.shot);
      groups.set(k, g);
    }
  }
  const axe = new Map();
  for (const c of all.checks) {
    for (const v of c.axe ?? []) {
      const g = axe.get(v.id) ?? { ...v, where: [], shots: [] };
      g.where.push(`${c.scenario}/${c.phase}/${c.device}`);
      if (g.shots.length < 3) g.shots.push(c.shot);
      axe.set(v.id, g);
    }
  }
  const logs = new Map();
  for (const l of all.logs) {
    const text = l.text.replace(/\b[A-Z]{4}\b/g, 'CODE').replace(/[0-9a-f]{16,}/g, 'HASH').replace(/:\d{4,5}\//g, ':PORT/');
    const k = `${l.kind}|${text}`;
    const g = logs.get(k) ?? { kind: l.kind, text, count: 0, devices: new Set(), phases: new Set() };
    g.count++; g.devices.add(l.device.replace(/\d-/, '-')); g.phases.add(`${l.scenario}/${l.phase}`);
    logs.set(k, g);
  }
  const media = new Map();
  for (const m of all.media) {
    const u = m.url.replace(/^https?:\/\/[^/]+/, '');
    const g = media.get(u) ?? { url: u, kind: mediaKind(u), statuses: new Set(), count: 0, devices: new Set() };
    g.statuses.add(m.status); g.count++; g.devices.add(m.device.startsWith('tv') ? 'tv' : 'phone');
    media.set(u, g);
  }
  return { groups: [...groups.values()], axe: [...axe.values()], logs: [...logs.values()], media: [...media.values()] };
}

export function writeReport(outDir, results, all) {
  const s = summarize(all);
  const L = [];
  L.push(`# Accomplice e2e audit: ${results.runId}`, '');
  L.push(`Servers: ${results.servers.map((x) => `${x.mode} on :${x.port} (pid ${x.pid}, engine ${x.health?.engine}, model ${x.health?.model?.provider})`).join('; ')}`);
  L.push(`Build: ${Object.entries(results.build).map(([k, v]) => (typeof v === 'object' ? `${k} ${v.ok ? 'ok' : v.viteOk ? 'TYPE ERRORS (bundled with vite only)' : 'FAILED'}` : `${k}=${v}`)).join(', ')}`, '');
  for (const [k, v] of Object.entries(results.build)) if (v && typeof v === 'object' && !v.ok) L.push('```', v.output?.split('\n').filter((l) => /error/i.test(l)).slice(0, 15).join('\n'), '```');

  L.push('## Flow failures and functional findings', '');
  if (!all.findings.length) L.push('None.');
  for (const f of all.findings) {
    L.push(`- **[${f.sev}] ${f.area}: ${f.title}** (${f.run}/${f.scenario}/${f.phase})`);
    L.push(`  - Repro: ${f.repro}`, `  - Expected: ${f.expected}`, `  - Actual: ${f.actual}`, `  - Screens: ${f.shot || 'n/a'}`);
  }
  L.push('');

  L.push('## Phone controls a tap could not reach (something on top, after scrolling them to the middle)', '');
  if (!all.covered?.length) L.push('None.');
  else { L.push('| scenario/phase | control | covered by |', '|---|---|---|'); for (const c of all.covered) L.push(`| ${c.scenario}/${c.phase} | ${esc(c.control)} | \`${esc(c.by)}\` |`); }
  L.push('');

  L.push('## Scenario timing', '');
  for (const [k, v] of Object.entries(results.scenarios)) {
    L.push(`### ${k} (${Math.round(v.ms / 1000)} s, room ${v.code})`, '');
    L.push('| phase | duration |', '|---|---|');
    for (const p of v.phases) L.push(`| ${p.phase} | ${ms(p.ms)} |`);
    const t = (v.serverTimings ?? []).filter((x) => x.kind !== 'answer');
    if (t.length) L.push('', `Server timings: ${t.map((x) => `${x.kind} ${x.ms} ms`).join(', ')}`);
    L.push('');
  }

  L.push('## Question to answer latency (measured in the TV page)', '');
  L.push('| run/scenario | who | suspect | first frame | filler first? | first answer part | first audio play() | audio playing | answer |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of all.latency) L.push(`| ${r.run}/${r.scenario} | ${esc(r.who)} | ${esc(r.suspect)} | ${ms(r.firstFrameMs)} | ${r.firstFiller ?? 'n/a'} | ${ms(r.firstPartMs)} | ${ms(r.firstAudioPlayMs)} | ${ms(r.firstAudioPlayingMs)} | ${esc((r.answer ?? '').slice(0, 90))} |`);
  L.push('');

  L.push('## Audio requests', '');
  const byKind = {};
  for (const m of s.media) {
    const k = (byKind[m.kind] ??= { requested: 0, ok: 0, missing: [], other: [] });
    k.requested++;
    if ([...m.statuses].some((x) => x === 200 || x === 206 || x === 304)) k.ok++;
    if (m.statuses.has(404)) k.missing.push(m.url);
    else if (![...m.statuses].some((x) => x === 200 || x === 206 || x === 304)) k.other.push(`${m.url} (${[...m.statuses].join(',')})`);
  }
  L.push('| kind | unique URLs | ok | 404 | other |', '|---|---|---|---|---|');
  for (const [k, v] of Object.entries(byKind)) L.push(`| ${k} | ${v.requested} | ${v.ok} | ${v.missing.length} | ${v.other.length} |`);
  for (const [k, v] of Object.entries(byKind)) if (v.missing.length || v.other.length) L.push('', `${k} not served: ${[...v.missing, ...v.other].slice(0, 40).map((u) => `\`${u}\``).join(', ')}`);
  L.push('');

  L.push('## Console errors, warnings, uncaught exceptions, failed requests', '');
  L.push('| kind | count | devices | text | where |', '|---|---|---|---|---|');
  for (const g of s.logs.sort((a, b) => b.count - a.count)) L.push(`| ${g.kind} | ${g.count} | ${[...g.devices].join(', ')} | ${esc(g.text.slice(0, 200))} | ${esc([...g.phases].slice(0, 4).join(', '))} |`);
  L.push('');

  const order = ['off-screen', 'h-scroll', 'clipped', 'truncated', 'overlap', 'safe-area', 'focus', 'broken-image', 'small-text', 'contrast', 'small-target'];
  L.push('## Layout and readability checks (grouped across phases)', '');
  for (const type of order) {
    const gs = s.groups.filter((g) => g.type === type);
    if (!gs.length) continue;
    L.push(`### ${type} (${gs.length})`, '');
    L.push('| screen | element | text | detail | seen in | screenshot |', '|---|---|---|---|---|---|');
    for (const g of gs.slice(0, 60)) L.push(`| ${g.kind} | \`${esc(g.sel)}\` | ${esc((g.text ?? '').slice(0, 50))} | ${esc([...g.details].slice(0, 2).join('; '))} | ${g.where.length}x: ${esc(g.where.slice(0, 3).join(', '))} | ${g.shots[0]} |`);
    if (gs.length > 60) L.push(`| ... | ${gs.length - 60} more | | | | |`);
    L.push('');
  }

  L.push('## axe-core (phones)', '');
  L.push('| rule | impact | help | screens | sample | screenshot |', '|---|---|---|---|---|---|');
  for (const a of s.axe.sort((x, y) => y.where.length - x.where.length)) L.push(`| ${a.id} | ${a.impact} | ${esc(a.help)} | ${a.where.length} | ${esc(a.sample)} | ${a.shots[0]} |`);
  L.push('');

  L.push('## Copy audit', '');
  L.push('| kind | device | phase | text | why |', '|---|---|---|---|---|');
  const seen = new Set();
  for (const c of [...all.copy, ...all.names]) {
    const k = `${c.kind}|${c.text}|${c.why}`;
    if (seen.has(k)) continue;
    seen.add(k);
    L.push(`| ${c.kind} | ${c.device ?? ''} | ${esc(c.phase ?? '')} | ${esc(c.text)} | ${esc(c.why)} |`);
  }
  L.push('');
  const file = path.join(outDir, 'report.md');
  fs.writeFileSync(file, L.join('\n'));
  return file;
}
