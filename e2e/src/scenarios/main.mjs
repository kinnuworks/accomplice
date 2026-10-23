// Full classic game, 4 players (2 iPhone 15, 2 Pixel 7): every phase and every feature once.
import { advance, ask, hostRoom, joinPhones, queueIdle, resolveLatency, skipBriefing, skipTutorial, startFromTv, step, voteAll } from '../game.mjs';
import { sleep, tvFocus, tvKey, escapeRe } from '../harness.mjs';

export async function main(run) {
  run.scenario = 'main';
  const { tv, code } = await hostRoom(run);
  await run.snap('lobby-empty', ['tv']);
  const phones = await joinPhones(run, code, 4, { snapJoin: true });
  const [A, B, C, D] = phones;
  run.mainPhones = phones;

  // ---- tone choice (host phone), then back to classic from the TV remote ----
  await step(run, 'host phone picks a tone', async () => {
    await A.page.getByRole('radio', { name: /Cozy/ }).evaluate((el) => el.click());
    await run.waitRoom(code, (s) => s.tone === 'cozy', 5000, 'tone cozy');
    await run.snap('lobby-tone-cozy');
    // TV remote: move to the Classic tone option and press OK
    await tvFocus(tv, tv.page.getByRole('radio', { name: /Classic/ }));
    await tvKey(tv, 'Enter');
    await run.waitRoom(code, (s) => s.tone === 'classic', 5000, 'tone classic from TV');
  }, { area: 'phone', sev: 'P1' });
  await run.snap('lobby-full');

  await step(run, 'start from the TV', () => startFromTv(run, tv, code), { fatal: true });
  await sleep(1200);
  await run.snap('briefing-cold-open');

  // ---- secret roles ----
  let accomplice = null;
  await step(run, 'peek at secret roles', async () => {
    for (const p of phones) {
      await p.page.getByRole('button', { name: /Hold to peek at my role/ }).click();
      await p.page.locator('#role-card').waitFor({ state: 'visible', timeout: 5000 });
      const txt = await p.page.locator('#role-card').innerText();
      p.role = /accomplice/i.test(txt) ? 'accomplice' : 'detective';
      if (p.role === 'accomplice') accomplice = p;
    }
    await run.snap('briefing-roles-open');
    for (const p of phones) await p.page.getByRole('button', { name: 'Hide' }).click().catch(() => {});
  }, { area: 'phone' });
  const st0 = await run.roomState(code);
  if (!accomplice) run.finding({ sev: 'P1', area: 'server', title: 'No accomplice dealt in a 4 player game', repro: 'Start a classic game with 4 phones; open each envelope.', expected: 'Exactly one phone says Accomplice (rule: accomplice when 4 or more players).', actual: 'All four role cards say Detective.', shot: '' });

  await step(run, 'skip the briefing with OK', () => skipBriefing(run, tv, code), { fatal: true });
  const c = (await run.roomState(code)).case;
  run.caseNames = [...c.suspects.map((s) => s.name), ...c.suspects.map((s) => s.shortName ?? ''), ...c.rooms.map((r) => r.name), ...c.items.map((i) => i.name), c.title, c.place, c.victim.name, ...phones.map((p) => p.player)];
  run.case = c;

  // ---- practice question ----
  await step(run, 'practice question', async () => {
    await run.snap('tutorial');
    await ask(run, A, null, 'What did you serve at dinner tonight?');
    await sleep(500);
    await run.snap('tutorial-asked');
    await run.waitRoom(code, (s) => s.transcript.some((u) => u.speaker === 'house'), 30_000, 'house answer');
    await sleep(1500);
    await run.snap('tutorial-answer');
    await resolveLatency(run, tv);
  }, { area: 'phone' });
  await step(run, 'start the case from the TV', () => skipTutorial(run, tv, code), { fatal: true });
  await sleep(1500);
  await run.snap('round1-start');

  // ---- can a thumb reach every suspect card, or does the talk dock sit on top of some? ----
  await step(run, 'every suspect card can be tapped', async () => {
    const bad = [];
    for (const p of phones) {
      const covered = await p.page.evaluate(() => {
        const out = [];
        for (const l of document.querySelectorAll('label.suspect')) {
          l.scrollIntoView({ block: 'nearest' });
          const r = l.getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          if (hit && !l.contains(hit)) out.push(`${l.innerText.split('\n')[0]} under ${hit.className}`);
        }
        window.scrollTo(0, 0);
        return out;
      });
      if (covered.length) bad.push(`${p.model}: ${covered.join('; ')}`);
    }
    if (bad.length) throw new Error(`suspect cards covered after scrolling them into view: ${bad.join(' | ')}`);
  }, { area: 'phone', sev: 'P1' });

  // ---- round 1: two phones ask at once, then one player runs out ----
  const S = c.suspects;
  await step(run, 'two phones ask at the same moment', async () => {
    const t0 = Date.now();
    await Promise.all([
      ask(run, A, S[0], 'Where were you at nine o\'clock?'),
      ask(run, B, S[1], 'Who did you see in the hallway?'),
    ]);
    // objection while the answer is live or just finished (phone C), before any slow capture
    await step(run, 'objection on a live answer', async () => {
      const btn = C.page.getByRole('button', { name: 'Objection!' });
      await btn.waitFor({ timeout: 25_000 });
      await btn.click();
      await sleep(600);
      await run.snap('objection');
    }, { area: 'phone', sev: 'P1' });
    await run.snap('round1-two-asks');
    const st = await run.waitRoom(code, (s) => [A.pid, B.pid].every((pid) => s.transcript.some((u) => u.askedBy === pid && u.at >= t0 - 1000 && !u.filler)), 90_000, 'both questions answered');
    const order = st.transcript.filter((u) => [A.pid, B.pid].includes(u.askedBy) && !u.filler).map((u) => u.speakerName);
    run.mark('two-asks-order', order.join(' then '));
  }, { area: 'server' });

  await step(run, 'answers finish', () => queueIdle(run, code, 120_000), { area: 'server' });
  await resolveLatency(run, tv);

  // A uses the last question: now out, sees the hunch card
  await step(run, 'player uses last question and gets a hunch vote', async () => {
    await ask(run, A, S[2], 'Why were your shoes wet?');
    await run.waitRoom(code, (s) => s.players.find((p) => p.id === A.pid)?.questionsLeft === 0, 5000, 'A out of questions');
    await run.snap('round1-no-questions-left', [A.name, 'tv']);
    await queueIdle(run, code, 90_000);
    const lie = A.page.getByRole('button', { name: 'Lying' });
    await lie.waitFor({ timeout: 10_000 });
    await lie.click(); // the vote closes after 20 s of server time, so vote before the slow capture
    await sleep(500);
    await run.snap('hunch-voted', [A.name, 'tv']);
    // the dock must refuse a fourth question
    const dis = await A.page.getByRole('button', { name: /^(Type instead|Type your question)$/ }).isDisabled().catch(() => true);
    if (!dis) throw new Error('Type instead is still enabled with no questions left');
  }, { area: 'phone', sev: 'P1' });
  await resolveLatency(run, tv);

  // ---- board: pin, link and Prove it, all on the remote ----
  await step(run, 'pin two clues with the remote', async () => {
    const cards = tv.page.locator('.board .clue-card');
    const n = await cards.count();
    if (n < 2) throw new Error(`only ${n} clue cards on the board in round one`);
    await tvFocus(tv, cards.nth(0));
    await run.snap('board-focus', ['tv']);
    await tvKey(tv, 'Enter');
    await tvFocus(tv, cards.nth(1));
    await tvKey(tv, 'Enter');
    await run.waitRoom(code, (s) => s.board.pinned.length >= 2, 5000, 'two pins');
    await run.snap('board-pinned', ['tv']);
    // OK on a pinned card opens the menu; tie red string to the other
    await tvFocus(tv, cards.nth(0));
    await tvKey(tv, 'Enter');
    await tv.page.getByRole('button', { name: /Tie red string/ }).waitFor({ timeout: 4000 });
    await run.snap('board-card-menu', ['tv']);
    await tvKey(tv, 'Enter');
    await tvFocus(tv, cards.nth(1));
    await run.snap('board-linking', ['tv']);
    await tvKey(tv, 'Enter');
    await run.waitRoom(code, (s) => s.board.links.length >= 1, 5000, 'a link');
    await run.snap('board-linked', ['tv']);
  }, { area: 'tv' });

  await step(run, 'Prove it from the remote', async () => {
    await tvFocus(tv, tv.page.locator('.btn-prove'));
    await tvKey(tv, 'Enter');
    await tv.page.locator('.dialog-prove').waitFor({ timeout: 4000 });
    await run.snap('prove-who', ['tv']);
    await tvKey(tv, 'Enter');
    await sleep(300);
    await run.snap('prove-with-what', ['tv']);
    await tvKey(tv, 'Enter');
    await tv.page.locator('.dialog-verdict').waitFor({ timeout: 15_000 });
    await sleep(1500);
    await run.snap('prove-verdict');
    await tvKey(tv, 'Enter');
  }, { area: 'tv' });

  // ---- phone proposal + votes ----
  await step(run, 'phone proposes a theory and the table votes', async () => {
    await B.page.getByRole('tab', { name: /^Board/ }).click();
    await run.snap('phone-board', [B.name]);
    await B.page.getByRole('button', { name: 'Test a theory' }).click();
    await B.page.getByRole('radio', { name: new RegExp(escapeRe(S[1].name)) }).first().evaluate((el) => el.click());
    await B.page.locator('input[name="theory-item"]').first().evaluate((el) => el.click());
    await run.snap('theory-sheet', [B.name]);
    await B.page.getByRole('button', { name: 'Put it to the table' }).click();
    await C.page.getByRole('button', { name: 'Agree, test it' }).waitFor({ timeout: 8000 });
    // the server tests an open proposal by itself after 15 s, so vote before and keep the capture small
    await D.page.getByRole('button', { name: 'Not yet' }).click();
    await sleep(500);
    await run.snap('proposal-open', ['tv', B.name, C.name]);
    await C.page.getByRole('button', { name: 'Agree, test it' }).click();
    await sleep(2500);
    await run.snap('proposal-verdict');
  }, { area: 'phone' });

  // ---- round 2: sabotage + more questions ----
  await step(run, 'advance to round two', () => advance(run, tv, phones, code, 'r1-to-r2'), { fatal: true });
  await sleep(1500);
  await run.snap('round2-start');
  await step(run, 'round two questions', async () => {
    await ask(run, C, S[3], 'What were you doing in the library?');
    await sleep(300);
    await ask(run, D, S[4 % S.length], 'Did you hear anything at half past nine?');
    await queueIdle(run, code, 120_000);
  }, { area: 'server' });
  await resolveLatency(run, tv);

  await step(run, 'accomplice smudges a clue', async () => {
    if (!accomplice) throw new Error('no accomplice in this game');
    const pg = accomplice.page;
    await pg.getByRole('tab', { name: /^Board/ }).click();
    const sb = pg.getByRole('button', { name: 'Smudge a clue' });
    await sb.waitFor({ timeout: 5000 });
    await sb.click();
    await pg.locator('input[name="sabotage"]').first().evaluate((el) => el.click());
    await run.snap('sabotage-pick', [accomplice.name]);
    await pg.getByRole('button', { name: 'Smudge it' }).click();
    await pg.getByRole('button', { name: 'Yes, smudge it' }).click();
    await run.waitRoom(code, (s) => (s.board.smudged ?? []).length > 0, 8000, 'a smudged clue');
    await sleep(800);
    await run.snap('sabotage-done');
  }, { area: 'phone' });

  // ---- round 3: blackout, emergency vote, free question ----
  await step(run, 'advance to round three', () => advance(run, tv, phones, code, 'r2-to-r3'), { fatal: true });
  await sleep(600);
  await run.snap('round3-blackout');
  await step(run, 'emergency vote', async () => {
    for (const [i, p] of phones.entries()) {
      const pg = p.page;
      await pg.getByRole('heading', { name: 'Blackout!' }).waitFor({ timeout: 10_000 });
      await pg.locator('input[name="emergency"]').nth(i < 3 ? 0 : 1).evaluate((el) => el.click());
      if (i === 0) await run.snap('emergency-vote-open');
      await pg.getByRole('button', { name: 'Cast my vote' }).click();
    }
    const st = await run.waitRoom(code, (s) => s.emergency?.stage === 'ask', 10_000, 'emergency ask stage');
    await sleep(800);
    await run.snap('emergency-ask');
    const chosen = c.suspects.find((s) => s.id === st.emergency.suspectId);
    // B still has questions: picks the chosen suspect and asks for free
    const before = st.players.find((p) => p.id === B.pid)?.questionsLeft;
    await ask(run, B, chosen, 'Who turned the lights off?');
    await run.waitRoom(code, (s) => s.emergency?.stage === 'done', 8000, 'free question taken');
    const after = (await run.roomState(code)).players.find((p) => p.id === B.pid)?.questionsLeft;
    if (after !== before) throw new Error(`the free question used up a question (${before} -> ${after})`);
    await run.snap('emergency-free-question');
    await queueIdle(run, code, 120_000);
  }, { area: 'phone' });
  await resolveLatency(run, tv);

  // ---- accuse ----
  await step(run, 'advance to the accusation', () => advance(run, tv, phones, code, 'r3-to-accuse'), { fatal: true });
  await sleep(1200);
  await run.snap('accuse-tv');
  await step(run, 'everyone votes', () => voteAll(run, phones, c, { culpritIdx: 0 }), { area: 'phone' });
  await step(run, 'reveal begins once all votes are in', () => run.waitRoom(code, (s) => s.phase === 'reveal', 20_000, 'reveal'), { fatal: true });

  // ---- reveal beats (OK skips) ----
  await step(run, 'reveal beats', async () => {
    await sleep(2500);
    await run.snap('reveal-step1');
    const paper = tv.page.locator('.paper-stage');
    for (let i = 0; i < 14 && !(await paper.isVisible().catch(() => false)); i++) {
      await tvKey(tv, 'Enter', 1, 300);
      await sleep(2200);
      const k = await tv.page.evaluate(() => [...document.querySelectorAll('main section, main [class*="stage"]')].map((e) => e.className).join(' '));
      await run.snap(`reveal-beat-${i + 1}`, ['tv']);
      void k;
    }
    await paper.waitFor({ timeout: 10_000 });
    await sleep(1500);
    await run.snap('reveal-newspaper');
    await tvFocus(tv, tv.page.getByRole('button', { name: /The ledger/ }));
    await tvKey(tv, 'Enter');
    await run.waitRoom(code, (s) => s.phase === 'results', 10_000, 'results');
  }, { area: 'tv' });

  await step(run, 'results and play again', async () => {
    await sleep(1200);
    await run.snap('results-award-1');
    const ledger = tv.page.locator('.ledger');
    for (let i = 0; i < 5 && !(await ledger.isVisible().catch(() => false)); i++) { await tvKey(tv, 'Enter'); await sleep(900); }
    await ledger.waitFor({ timeout: 10_000 });
    await sleep(1600);
    await run.snap('results-ledger');
    await tvFocus(tv, tv.page.getByRole('button', { name: /Play again/ }));
    await tvKey(tv, 'Enter');
    await run.waitRoom(code, (s) => s.phase === 'lobby', 10_000, 'lobby again');
    await sleep(1500);
    await run.snap('play-again-lobby');
    const st = await run.roomState(code);
    if (st.players.length !== 4) throw new Error(`players after play again: ${st.players.length}`);
  }, { area: 'tv' });

  await resolveLatency(run, tv);
  return { code, tv, phones };
}
