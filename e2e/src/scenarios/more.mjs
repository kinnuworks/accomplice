// Resilience and table-size scenarios, cozy tone, and a short run against the real text model.
import { advance, ask, hostRoom, joinPhones, queueIdle, resolveLatency, skipBriefing, skipTutorial, startFromTv, step, voteAll } from '../game.mjs';
import { sleep, tvFocus, tvKey } from '../harness.mjs';

async function setup(run, n, { tone, snapLobby = true, peek = true } = {}) {
  const { tv, code } = await hostRoom(run);
  const phones = await joinPhones(run, code, n);
  if (tone === 'cozy') {
    await phones[0].page.getByRole('radio', { name: /Cozy/ }).evaluate((el) => el.click());
    await run.waitRoom(code, (s) => s.tone === 'cozy', 5000, 'cozy tone');
  }
  if (snapLobby) await run.snap('lobby');
  await startFromTv(run, tv, code);
  const roles = {};
  if (peek) {
    for (const p of phones.filter((x) => !x.audience)) {
      const env = p.page.getByRole('button', { name: /Hold to peek at my role/ });
      if (!(await env.count())) continue;
      await env.click();
      const card = p.page.locator('#role-card');
      await card.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      roles[p.name] = /accomplice/i.test(await card.innerText().catch(() => '')) ? 'accomplice' : 'detective';
      p.role = roles[p.name];
    }
  }
  return { tv, code, phones, roles };
}

async function toInvestigate(run, tv, code) {
  await skipBriefing(run, tv, code, { snapReady: false });
  const st = await run.roomState(code);
  if (st.phase === 'tutorial') await skipTutorial(run, tv, code);
  return (await run.roomState(code)).case;
}

async function revealToResults(run, tv, code, { snaps = true } = {}) {
  await run.waitRoom(code, (s) => s.phase === 'reveal', 20_000, 'reveal');
  const paper = tv.page.locator('.paper-stage');
  let i = 0;
  for (; i < 16 && !(await paper.isVisible().catch(() => false)); i++) {
    await tvKey(tv, 'Enter', 1, 200);
    await sleep(1500);
    if (snaps && (await tv.page.locator('.accomplice').isVisible().catch(() => false))) await run.snap('reveal-accomplice', ['tv']);
  }
  await paper.waitFor({ timeout: 10_000 });
  if (snaps) await run.snap('reveal-newspaper');
  await tvFocus(tv, tv.page.getByRole('button', { name: /The ledger/ }));
  await tvKey(tv, 'Enter');
  await run.waitRoom(code, (s) => s.phase === 'results', 10_000, 'results');
  const ledger = tv.page.locator('.ledger');
  for (let k = 0; k < 5 && !(await ledger.isVisible().catch(() => false)); k++) { await tvKey(tv, 'Enter'); await sleep(900); }
  await sleep(1500);
  if (snaps) await run.snap('results-ledger');
}

// ---------------------------------------------------------------------------------------------

export async function resilience(run) {
  const { tv, code, phones } = await setup(run, 4, { snapLobby: false });
  const [A, B, C, D] = phones;
  const c = await toInvestigate(run, tv, code);
  run.extraNames = { ...(run.extraNames ?? {}), resilience: c.suspects.map((s) => s.name) };
  const S = c.suspects;

  await step(run, 'phone refresh mid-game rejoins as the same player', async () => {
    const before = B.pid;
    await B.page.reload();
    await B.page.getByRole('heading', { name: 'Question the suspects' }).waitFor({ timeout: 15_000 });
    const q = await run.probe(B);
    const you = q.ws.slice().reverse().find((x) => x.m.t === 'you:state');
    await run.snap('phone-refreshed', [B.name, 'tv']);
    if (!you || you.m.you.playerId !== before) throw new Error(`came back as ${you?.m.you.playerId} instead of ${before}`);
    const st = await run.roomState(code);
    if (st.players.length !== 4) throw new Error(`room now has ${st.players.length} players`);
    if (!st.players.find((p) => p.id === before)?.connected) throw new Error('player shows as away after rejoining');
  }, { area: 'phone' });

  await step(run, 'phone refresh keeps the private clues and notes', async () => {
    await A.page.getByRole('tab', { name: /^Notes/ }).click();
    await A.page.locator('#notes').fill('Butler lied about the pantry.');
    await sleep(1500);
    await A.page.reload();
    await A.page.getByRole('heading', { name: 'Question the suspects' }).waitFor({ timeout: 15_000 });
    await A.page.getByRole('tab', { name: /^Notes/ }).click();
    const v = await A.page.locator('#notes').inputValue();
    await A.page.getByRole('tab', { name: /^(My )?clues/i }).click();
    await run.snap('phone-refreshed-clues', [A.name]);
    if (!v.includes('pantry')) throw new Error(`notes after reload: "${v}"`);
  }, { area: 'phone', sev: 'P1' });

  await step(run, 'TV refresh mid-game returns to the game', async () => {
    await tv.page.reload();
    await sleep(4000);
    await run.snap('tv-refreshed', ['tv']);
    const onGame = await tv.page.locator('.investigate-screen').isVisible().catch(() => false);
    if (!onGame) {
      const title = await tv.page.locator('.title-screen').isVisible().catch(() => false);
      throw new Error(title ? 'after a refresh the TV shows the title screen; OK would host a brand new room and strand the phones' : 'after a refresh the TV is not on the investigate screen');
    }
  }, { area: 'tv', sev: 'P0' });

  // the rest needs a TV on the game; if the refresh lost it, open the room with a new TV page from the title screen is impossible,
  // so continue with the phones and the protocol fallback for TV-only controls.
  await step(run, 'a phone drops off the network and comes back', async () => {
    await D.context.setOffline(true);
    await sleep(500);
    await D.page.evaluate(() => window.dispatchEvent(new Event('offline')));
    let st;
    try { st = await run.waitRoom(code, (s) => s.players.find((p) => p.id === D.pid)?.connected === false, 15_000, 'server to notice the dropped phone'); } catch (e) { st = null; }
    await run.snap('phone-offline', [D.name, 'tv']);
    if (!st) run.finding({ sev: 'P2', area: 'server', title: 'A phone that loses its network is not shown as away for at least 15 s', repro: 'In round one, turn one phone to airplane mode. Watch the TV and other phones.', expected: 'Within a few seconds the player shows as away, so votes do not wait on them.', actual: 'Server still lists the phone as connected after 15 s (no WS heartbeat timeout).', shot: (await run.snap('phone-offline-still-connected', ['tv'])).dir });
    await D.context.setOffline(false);
    await D.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await run.waitRoom(code, (s) => s.players.find((p) => p.id === D.pid)?.connected === true, 30_000, 'phone to reconnect');
    await D.page.getByRole('heading', { name: 'Question the suspects' }).waitFor({ timeout: 15_000 });
    await run.snap('phone-back-online', [D.name, 'tv']);
  }, { area: 'phone', sev: 'P1' });

  await step(run, 'no questions left: the dock refuses politely', async () => {
    await ask(run, A, S[0], 'Where were you at nine?');
    await ask(run, A, S[1], 'And at half past?').catch(async () => {
      // second ask may be blocked while the first is in line
      await queueIdle(run, code, 90_000);
      await ask(run, A, S[1], 'And at half past?');
    });
    await sleep(800);
    const st = await run.roomState(code);
    const left = st.players.find((p) => p.id === A.pid)?.questionsLeft;
    await run.snap('no-questions-left', [A.name, 'tv']);
    const typeBtn = A.page.getByRole('button', { name: /^(Type instead|Type your question|Ask another question|Back)$/ });
    const txt = await A.page.locator('.dock').innerText().catch(() => '');
    if (left !== 0) throw new Error(`questionsLeft is ${left} after two questions`);
    if (!/No questions left/i.test(await A.page.locator('.qbadge').innerText())) throw new Error('badge does not say no questions left');
    void typeBtn; void txt;
    await queueIdle(run, code, 120_000);
  }, { area: 'phone', sev: 'P1' });
  await resolveLatency(run, tv);

  await step(run, 'a phone that leaves for good does not block the vote', async () => {
    await advance(run, tv, phones, code, 'r1');
    await advance(run, tv, phones, code, 'r2');
    await sleep(500);
    // close the blackout vote quickly
    for (const p of phones) {
      const r = p.page.locator('input[name="emergency"]').first();
      if (await r.count()) { await r.evaluate((el) => el.click()); await p.page.getByRole('button', { name: 'Cast my vote' }).click().catch(() => {}); }
    }
    await advance(run, tv, phones, code, 'r3');
    await D.context.close();
    D.closed = true;
    await sleep(1500);
    await run.snap('accuse-one-phone-gone', ['tv']);
    await voteAll(run, [A, B, C], c, { snapFirst: false });
    await run.waitRoom(code, (s) => s.phase === 'reveal', 15_000, 'reveal without the missing phone');
    await sleep(1500);
    await run.snap('reveal-after-dropout');
  }, { area: 'server', sev: 'P0' });
  return { code };
}

export async function three(run) {
  const { tv, code, phones, roles } = await setup(run, 3);
  await run.snap('three-roles');
  if (Object.values(roles).includes('accomplice')) run.finding({ sev: 'P0', area: 'server', title: 'Accomplice dealt in a 3 player game', repro: 'Start with 3 phones and open the envelopes.', expected: 'Everyone is a detective below 4 players.', actual: `roles: ${JSON.stringify(roles)}`, shot: '' });
  const c = await toInvestigate(run, tv, code);
  run.extraNames = { ...(run.extraNames ?? {}), three: c.suspects.map((s) => s.name) };
  await step(run, 'one question', async () => { await ask(run, phones[0], c.suspects[0], 'What did you see?'); await queueIdle(run, code, 90_000); });
  await run.snap('three-round1');
  await advance(run, tv, phones, code, 'r1');
  await advance(run, tv, phones, code, 'r2');
  await run.snap('three-round3');
  await advance(run, tv, phones, code, 'r3');
  await step(run, 'no accomplice question on the ballot', async () => {
    await phones[0].page.getByRole('heading', { name: /Name the guilty party/ }).waitFor({ timeout: 10_000 });
    await run.snap('three-accuse');
    const n = await phones[0].page.locator('input[name="accomplice"]').count();
    if (n) throw new Error('3 player ballot asks about an accomplice');
    const tvText = await tv.page.locator('.accuse-sub').innerText().catch(() => '');
    if (/helped them/i.test(tvText)) throw new Error(`TV accuse copy mentions an accomplice in a 3 player game: "${tvText}"`);
  }, { area: 'tv', sev: 'P2' });
  await step(run, 'vote and reveal', async () => {
    await voteAll(run, phones, c, { snapFirst: false, culpritIdx: 1 });
    await revealToResults(run, tv, code);
  }, { area: 'tv' });
  return { code };
}

export async function sixPlusAudience(run) {
  const { tv, code } = await hostRoom(run);
  const phones = await joinPhones(run, code, 7);
  const aud = phones[6];
  aud.audience = true;
  await run.snap('six-lobby');
  const st = await run.roomState(code);
  if (st.players.length !== 6 || (st.audience ?? []).length !== 1) run.finding({ sev: 'P1', area: 'server', title: 'Seventh phone is not seated in the audience', repro: 'Join 7 phones in the lobby.', expected: '6 players + 1 audience.', actual: `${st.players.length} players, ${(st.audience ?? []).length} audience`, shot: '' });
  const audHeading = await aud.page.getByRole('heading', { level: 1 }).first().innerText().catch(() => '');
  if (/guests are arriving/i.test(audHeading)) run.finding({ sev: 'P1', area: 'phone', title: 'Audience phone shows the player lobby in the lobby phase', repro: 'Join a 7th phone while 6 players are seated, in the lobby.', expected: 'The phone says it joined the audience (no seat, hunch votes only).', actual: 'It shows the normal lobby guest list; it is not on that list and nothing explains why.', shot: (await run.snap('six-audience-lobby', [aud.name])).dir });
  await startFromTv(run, tv, code);
  await sleep(1200);
  await run.snap('six-briefing');
  const c = await toInvestigate(run, tv, code).catch(async (e) => { throw e; });
  run.extraNames = { ...(run.extraNames ?? {}), six: c.suspects.map((s) => s.name) };
  await sleep(1200);
  await run.snap('six-round1');
  await step(run, 'six player proposal card', async () => {
    const P = phones[1];
    await P.page.getByRole('tab', { name: /^Board/ }).click();
    await P.page.getByRole('button', { name: 'Test a theory' }).click();
    await P.page.locator('input[name="theory-culprit"]').first().evaluate((el) => el.click());
    await P.page.getByRole('button', { name: 'Put it to the table' }).click();
    await sleep(1200);
    await run.snap('six-proposal');
    for (const p of phones.slice(2, 4)) await p.page.getByRole('button', { name: 'Agree, test it' }).click({ timeout: 5000 }).catch(() => run.mark('note', `${p.name} had no vote sheet`));
    await sleep(2500);
    await run.snap('six-proposal-verdict', ['tv', phones[1].name]);
  }, { area: 'tv', sev: 'P1' });
  await step(run, 'audience hunch', async () => {
    await ask(run, phones[0], c.suspects[0], 'Were you in the garden at ten?');
    await queueIdle(run, code, 90_000);
    const lie = aud.page.getByRole('button', { name: 'Truthful' });
    await lie.waitFor({ timeout: 8000 });
    await lie.click();
    await sleep(500);
    await run.snap('six-audience-hunch', ['tv', aud.name]);
  }, { area: 'phone', sev: 'P1' });
  await resolveLatency(run, tv);
  await advance(run, tv, phones, code, 'r1');
  await advance(run, tv, phones, code, 'r2');
  for (const p of phones.slice(0, 6)) { const r = p.page.locator('input[name="emergency"]').first(); if (await r.count()) { await r.evaluate((el) => el.click()); await p.page.getByRole('button', { name: 'Cast my vote' }).click().catch(() => {}); } }
  await advance(run, tv, phones, code, 'r3');
  await sleep(1000);
  await run.snap('six-accuse');
  await step(run, 'six votes and the reveal', async () => {
    await voteAll(run, phones.slice(0, 6), c, { snapFirst: false, culpritIdx: 2 });
    await revealToResults(run, tv, code);
  }, { area: 'tv' });
  return { code };
}

export async function cozy(run) {
  const { tv, code, phones } = await setup(run, 4, { tone: 'cozy' });
  await sleep(1000);
  await run.snap('cozy-briefing');
  const begin = tv.page.getByRole('button', { name: /Begin round one|Let's begin/ });
  for (let i = 0; i < 12 && !(await begin.isVisible().catch(() => false)); i++) { await tvKey(tv, 'Enter', 1, 600); if (i === 1 || i === 2) await run.snap(`cozy-briefing-slide-${i}`, ['tv']); }
  await run.snap('cozy-briefing-ready', ['tv']);
  await tvFocus(tv, begin); await tvKey(tv, 'Enter');
  await run.waitRoom(code, (s) => s.phase === 'tutorial' || s.phase === 'investigate', 15_000, 'tutorial');
  const c = (await run.roomState(code)).case;
  run.extraNames = { ...(run.extraNames ?? {}), cozy: [...c.suspects.map((s) => s.name), ...c.rooms.map((r) => r.name), ...c.items.map((i) => i.name), c.title, c.place, c.victim.name] };
  if (c.tone !== 'cozy') run.finding({ sev: 'P0', area: 'server', title: 'Cozy tone ignored', repro: 'Host phone picks Cozy, start.', expected: 'A cozy case', actual: `tone ${c.tone}`, shot: '' });
  await run.snap('cozy-tutorial');
  await skipTutorial(run, tv, code);
  await step(run, 'cozy question', async () => { await ask(run, phones[1], c.suspects[1], 'Who had the cake knife?'); await sleep(2500); await run.snap('cozy-answer'); await queueIdle(run, code, 90_000); });
  await resolveLatency(run, tv);
  await advance(run, tv, phones, code, 'r1');
  await advance(run, tv, phones, code, 'r2');
  for (const p of phones) { const r = p.page.locator('input[name="emergency"]').first(); if (await r.count()) { await r.evaluate((el) => el.click()); await p.page.getByRole('button', { name: 'Cast my vote' }).click().catch(() => {}); } }
  await sleep(800);
  await run.snap('cozy-round3');
  await advance(run, tv, phones, code, 'r3');
  await sleep(800);
  await step(run, 'cozy accuse and reveal', async () => {
    await voteAll(run, phones, c, { snapFirst: true });
    await revealToResults(run, tv, code);
  }, { area: 'tv' });
  return { code };
}

/** Short sanity run against the real text model: practice question plus two questions. */
export async function realProvider(run) {
  const { tv, code, phones } = await setup(run, 3, { snapLobby: false, peek: false });
  await skipBriefing(run, tv, code, { snapReady: false });
  const c = (await run.roomState(code)).case;
  run.caseNames = [...(run.caseNames ?? []), ...c.suspects.map((s) => s.name), ...c.rooms.map((r) => r.name), ...c.items.map((i) => i.name), c.title, c.place, c.victim.name];
  run.case = c;
  if ((await run.roomState(code)).phase === 'tutorial') {
    await step(run, 'real practice question', async () => {
      await ask(run, phones[0], null, 'How long have you worked in this house?');
      await run.waitRoom(code, (s) => s.transcript.some((u) => u.speaker === 'house'), 45_000, 'house answer');
      await sleep(1500);
      await run.snap('real-tutorial-answer');
    }, { area: 'server' });
    await skipTutorial(run, tv, code);
  }
  await step(run, 'real questions', async () => {
    await ask(run, phones[0], c.suspects[0], 'Where were you when the clock struck nine?');
    await ask(run, phones[1], c.suspects[1], 'Did you see anyone near the scene of the crime?');
    await run.waitRoom(code, (s) => !!s.speaking, 30_000, 'a suspect to speak');
    await sleep(2500);
    await run.snap('real-answer');
    await queueIdle(run, code, 120_000);
    await sleep(800);
    await run.snap('real-after');
  }, { area: 'server' });
  await resolveLatency(run, tv);
  return { code };
}
