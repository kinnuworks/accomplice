// Game-level steps shared by scenarios. Everything goes through the real UI; the only exception is
// `advance()`, which falls back to the protocol only when neither the TV's move-on control nor its Back menu
// offers a way out of the round (and files a P0 for it).
import { PHONE_MODELS, phoneAsk, phoneJoin, sleep, tvFocus, tvKey, escapeRe } from './harness.mjs';

/** Wrap a step: failures become findings with a screenshot instead of aborting the scenario. */
export async function step(run, name, fn, { area = 'tv', sev = 'P0', fatal = false } = {}) {
  run.mark('step', name);
  const t0 = Date.now();
  const at = run.code ? await run.roomState(run.code).catch(() => null) : null;
  try {
    return await fn();
  } catch (e) {
    const snap = await run.snap(`FAIL-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`).catch(() => ({ dir: '' }));
    // If the room changed round/phase under the step without the step asking for it, the step failed because
    // the server moved on by itself; attribute it there instead of to the screen that timed out.
    const now = run.code ? await run.roomState(run.code).catch(() => null) : null;
    // ...or it moved on by itself earlier and the scenario is now playing a round it did not expect
    const early = run.unrequestedRoundEnd?.();
    const movedUnder = !!early || (at && now && at.phase === 'investigate' && (now.phase !== at.phase || now.round !== at.round) && !run.timeline.some((t) => t.scenario === run.scenario && t.event === 'advance' && t.t >= t0));
    const why = early ? ` (the server left ${early.from} by itself after ${Math.round(early.lasted / 1000)} s; this step was written for that round)` : movedUnder ? ` (the room moved from round ${at.round} to ${now.phase === 'investigate' ? `round ${now.round}` : now.phase} by itself during this step)` : '';
    run.finding({ sev, area: movedUnder ? 'server' : area, title: `Step failed: ${name}`, repro: `Scenario "${run.scenario}", step "${name}".`, expected: `${name} completes through the UI.`, actual: e.message.split('\n')[0].slice(0, 300) + why, shot: snap.dir });
    if (fatal) throw e;
    return undefined;
  }
}

export async function hostRoom(run, tone = 'classic') {
  const tv = await run.newDevice('tv', 'tv');
  await tv.page.goto('/tv/');
  await tv.page.waitForSelector('.title-screen', { timeout: 15_000 });
  await run.snap('title', ['tv']);
  // OK on the remote: "Host a game" has autofocus.
  await tvKey(tv, 'Enter');
  const codeEl = tv.page.locator('.room-code');
  await tv.page.waitForFunction(() => /Room code [A-Z] [A-Z] [A-Z] [A-Z]/.test(document.querySelector('.room-code')?.getAttribute('aria-label') ?? ''), null, { timeout: 15_000 });
  const code = (await codeEl.getAttribute('aria-label')).replace('Room code ', '').replace(/\s/g, '');
  run.code = code;
  run.watchRounds(code);
  run.mark('room', code);
  return { tv, code };
}

const NAMES = ['Ada', 'Bram', 'Cleo', 'Dev', 'Esme', 'Felix', 'Gus'];

export async function joinPhones(run, code, n, { start = 0, snapJoin = false } = {}) {
  const phones = [];
  for (let i = start; i < start + n; i++) {
    const model = PHONE_MODELS[i % 2];
    const p = await run.newDevice(`phone${i + 1}-${model.replace(/\s/g, '')}`, 'phone', model);
    p.player = NAMES[i];
    if (snapJoin && i === start) {
      await p.page.goto(`/p/?room=${code}`);
      await p.page.getByLabel('Your name').waitFor();
      await run.snap('join-form', [p.name]);
    }
    await phoneJoin(p, code, NAMES[i], i);
    await p.page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 10_000 });
    phones.push(p);
    await sleep(250);
  }
  // learn player ids from you:state frames
  for (const p of phones) {
    for (let k = 0; k < 20 && !p.pid; k++) {
      const q = await run.probe(p);
      const you = q?.ws?.slice().reverse().find((x) => x.m.t === 'you:state');
      if (you) p.pid = you.m.you.playerId;
      else await sleep(200);
    }
  }
  return phones;
}

export async function startFromTv(run, tv, code) {
  const btn = tv.page.locator('.start-btn');
  await tvFocus(tv, btn);
  await tvKey(tv, 'Enter');
  await run.waitRoom(code, (s) => s.phase === 'briefing', 30_000, 'briefing');
}

/** Press OK through the briefing slides until "Begin round one", then press it. */
export async function skipBriefing(run, tv, code, { snapReady = true } = {}) {
  const begin = tv.page.getByRole('button', { name: /Begin round one|Let's begin/ });
  for (let i = 0; i < 12 && !(await begin.isVisible().catch(() => false)); i++) { await tvKey(tv, 'Enter', 1, 600); }
  await begin.waitFor({ timeout: 15_000 });
  if (snapReady) await run.snap('briefing-ready', ['tv']);
  await tvFocus(tv, begin);
  await tvKey(tv, 'Enter');
  await run.waitRoom(code, (s) => s.phase === 'tutorial' || s.phase === 'investigate', 15_000, 'tutorial');
}

export async function skipTutorial(run, tv, code) {
  const btn = tv.page.getByRole('button', { name: /Start the case/ });
  await btn.waitFor({ timeout: 10_000 });
  await tvFocus(tv, btn);
  await tvKey(tv, 'Enter');
  await run.waitRoom(code, (s) => s.phase === 'investigate' && s.round === 1, 20_000, 'round one');
}

let reportedNoAdvance = new Set();
const MOVE_ON = /move on to round|time to accuse/i;
const CONFIRM = /^(next round|start the vote)$/i;

/**
 * Move from one investigate round to the next (or to the accusation) the way a player would with the remote:
 * 1. the on-screen "Move on to round N" / "Time to accuse" control on the Investigate screen, if it is showing;
 * 2. otherwise Back opens the pause menu, pick the move-on option there;
 * then confirm. Only if neither path exists is a P0 filed and tv:next sent over a protocol socket.
 * The server can also move on by itself (auto-advance, round timer), so the room is re-checked before every
 * press: a stale "Next round" press would otherwise skip a whole round or close the vote.
 */
export async function advance(run, tv, phones, code, label) {
  run.advancing = true;
  try { return await advanceInner(run, tv, phones, code, label); } finally { run.advancing = false; run.advanceAt = Date.now(); }
}

async function advanceInner(run, tv, phones, code, label) {
  const before = await run.roomState(code);
  const moved = (s) => !s || s.phase !== before.phase || s.round !== before.round;
  // The scenario expects to be leaving round `want`. If the server already moved past it by itself, say so
  // (with how long that round lasted) and do not press: a press now would skip the round the scenario is in.
  const want = Number(/^r(\d)/.exec(label)?.[1] ?? 0);
  const ahead = before.phase !== 'investigate' || (want && before.round > want);
  if (ahead) {
    const q = await run.probe(tv);
    const frames = (q?.ws ?? []).filter((f) => f.m.t === 'room:state');
    const start = frames.find((f) => f.m.phase === 'investigate' && f.m.round === want)?.t;
    const end = frames.find((f) => f.t > (start ?? 0) && !(f.m.phase === 'investigate' && f.m.round === want))?.t;
    const lasted = start && end ? `${Math.round((end - start) / 1000)} s` : 'an unknown time';
    const lastIn = frames.filter((f) => f.t < (end ?? Infinity) && f.m.phase === 'investigate' && f.m.round === want).at(-1);
    const legit = !!lastIn?.m.out || (start && end && end - start > 230_000); // everyone out of questions, or the round clock
    const key = `early-${want}`;
    if (!legit && !reportedNoAdvance.has(run.scenario + key)) {
      reportedNoAdvance.add(run.scenario + key);
      run.finding({ sev: 'P0', area: 'server', title: `Round ${want} ended by itself after ${lasted}, before anyone moved on`, repro: `Scenario "${run.scenario}": play round ${want} without touching Move on; players still have questions.`, expected: 'A round lasts until the table moves on, everyone has used their questions, or the round clock (ROUND_SECONDS, 240 s) runs out.', actual: `The room was already at ${before.phase}${before.phase === 'investigate' ? ` round ${before.round}` : ''} when the harness went to leave round ${want}; round ${want} lasted ${lasted}.`, shot: (await run.snap(`round-${want}-ended-early`, ['tv'])).dir });
    }
    run.mark('advance', `${label}: already past (server moved on)`);
    return before;
  }
  const stillHere = async () => !moved(await run.roomState(code));
  const page = tv.page;
  const scope = () => page.locator('[data-nav-scope]').last();

  const confirm = async () => {
    const yes = page.locator('.dialog-confirm [data-nav]').filter({ hasText: CONFIRM });
    await yes.waitFor({ timeout: 4000 });
    if (!(await stillHere())) { await tvKey(tv, 'Escape'); return 'moved'; }
    await tvFocus(tv, yes);
    await tvKey(tv, 'Enter');
    return 'ui';
  };

  let how = null;
  // close anything left open (a clue menu, a dossier) so Back reaches the pause menu
  for (let i = 0; i < 3 && (await page.locator('[data-nav-scope]').count()); i++) await tvKey(tv, 'Escape', 1, 300);
  const cta = page.locator('main.investigate-screen [data-nav]:visible').filter({ hasText: MOVE_ON });
  if (await cta.count()) {
    await tvFocus(tv, cta.first());
    await tvKey(tv, 'Enter');
    how = await confirm().catch(() => null);
  }
  if (!how && (await stillHere())) {
    await tvKey(tv, 'Escape', 1, 400);
    const opt = scope().locator('[data-nav]').filter({ hasText: MOVE_ON });
    if (await opt.count().catch(() => 0)) {
      await tvFocus(tv, opt.first());
      await tvKey(tv, 'Enter');
      how = await confirm().catch(() => null);
    } else if (await page.locator('.dialog-pause').count()) {
      await tvKey(tv, 'Escape', 1, 300);
    }
  }
  if (!how && (await stillHere())) {
    const key = `${before.phase}`;
    if (!reportedNoAdvance.has(run.scenario + key)) {
      reportedNoAdvance.add(run.scenario + key);
      const s = await run.snap(`no-advance-control-${label}`);
      run.finding({ sev: 'P0', area: 'tv', title: `No control to leave round ${before.round} (${label})`, repro: 'Start any game, finish the practice question, ask questions in round one. On the TV, look for "Move on" on the Investigate screen, then press Back and look in the pause menu.', expected: 'A "Move on to round N" / "Time to accuse" control on the Investigate screen or in the Back menu, with a confirm.', actual: 'Neither the Investigate screen nor the Back menu offers a way to move on (or the confirm did not appear). Harness fell back to a protocol tv:next.', shot: s.dir });
    }
    if (await stillHere()) {
      const sock = await run.socket({ role: 'tv', room: code });
      sock.send({ t: 'tv:next' });
      await sleep(400);
      sock.close();
    }
  }
  run.mark('advance', `${label}: ${how ?? 'fallback'}`);
  return run.waitRoom(code, moved, 20_000, `advance from ${before.phase} ${before.round}`);
}

/** Ask through the dock and remember it for the latency report. */
export async function ask(run, p, suspect, q) {
  const at = await phoneAsk(p, suspect?.name ?? null, q);
  const rec = { scenario: run.scenario, who: p.name, pid: p.pid, suspect: suspect?.name ?? 'house', question: q, at };
  run.latency.push(rec);
  run.mark('ask', `${p.player} -> ${suspect?.name ?? 'house'}`);
  return rec;
}

/** Wait until the server queue is empty and nobody is speaking. */
export async function queueIdle(run, code, timeout = 90_000) {
  return run.waitRoom(code, (s) => !s.speaking && s.queue.length === 0, timeout, 'queue to drain');
}

/** Fill in latency numbers from the TV probe: question -> first utterance frame, first answer part, first audio play. */
export async function resolveLatency(run, tv) {
  const q = await run.probe(tv);
  if (!q) return;
  for (const r of run.latency.filter((x) => x.scenario === run.scenario && x.firstFrameMs === undefined)) {
    const frames = q.ws.filter((x) => x.m.t === 'utterance' && x.m.u.askedBy === r.pid && x.t >= r.at - 50);
    const first = frames[0];
    const real = frames.find((x) => !x.m.u.filler && (x.m.u.parts?.length || x.m.u.text));
    r.firstFrameMs = first ? first.t - r.at : null;
    r.firstFiller = first ? !!first.m.u.filler : null;
    r.firstPartMs = real ? real.t - r.at : null;
    const urls = new Set(frames.flatMap((x) => [x.m.u.audioUrl, ...(x.m.u.parts ?? []).map((p) => p.audioUrl)]).filter(Boolean));
    const play = q.plays.find((p) => p.t >= r.at - 50 && [...urls].some((u) => p.src.endsWith(u)));
    r.firstAudioPlayMs = play ? play.t - r.at : null;
    r.firstAudioPlayingMs = play?.playingAt ? play.playingAt - r.at : null;
    r.audioUrls = [...urls].length;
    r.answer = real?.m.u.text?.slice(0, 200) ?? null;
  }
}

export async function voteAll(run, phones, c, { culpritIdx = 0, itemIdx = 0, snapFirst = true } = {}) {
  let i = 0;
  for (const p of phones) {
    const page = p.page;
    await page.getByRole('heading', { name: /Name the guilty party/ }).waitFor({ timeout: 15_000 });
    const sus = c.suspects[(culpritIdx + i) % c.suspects.length];
    await page.getByRole('radio', { name: new RegExp(escapeRe(sus.name)) }).first().evaluate((el) => el.click());
    const items = page.locator('input[name="item"]');
    if (await items.count()) await items.nth(itemIdx % (await items.count())).evaluate((el) => el.click());
    const acc = page.locator('input[name="accomplice"]');
    if (await acc.count()) await acc.nth(0).evaluate((el) => el.click());
    if (snapFirst && i === 0) await run.snap('accuse-choose');
    await page.getByRole('button', { name: 'Review my accusation' }).click();
    if (snapFirst && i === 0) await run.snap('accuse-confirm', [p.name, 'tv']);
    await page.getByRole('button', { name: 'Lock it in' }).click();
    i++;
    await sleep(300);
  }
}
