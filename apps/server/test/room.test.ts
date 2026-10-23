import { describe, it, expect } from 'vitest';
import { makeRoom, tick } from './helpers.js';
import { GameError } from '../src/room.js';

describe('room lifecycle', () => {
  it('joins players with seats, first phone is host, reconnects by playerId', async () => {
    const { room } = await makeRoom(3);
    expect(room.players.map((p) => p.seat)).toEqual([0, 1, 2]);
    expect(room.hostId).toBe(room.players[0].id);
    const id = room.players[1].id;
    room.players[1].connected = false;
    const again = room.join('Renamed', id);
    expect(again.id).toBe(id);
    expect(room.players).toHaveLength(3);
    expect(again.connected).toBe(true);
  });

  it('only the host may start, and late joiners are refused', async () => {
    const { room } = await makeRoom(2);
    await expect(room.start(room.players[1].id)).rejects.toBeInstanceOf(GameError);
    await room.start(room.players[0].id);
    expect(room.phase).toBe('briefing');
    const late = room.join('Late');
    expect(late.seat).toBe(-1);
    expect(room.isAudience(late.id)).toBe(true);
  });

  it('walks every phase and returns to the lobby', async () => {
    const { room, tv, phones } = await makeRoom(3);
    await room.start('tv');
    expect(room.phase).toBe('briefing');
    expect(tv.msgs.some((m) => m.t === 'announce' && m.text.includes(room.case!.title))).toBe(true);
    for (const r of [1, 2, 3]) {
      await room.next('tv');
      expect(room.phase).toBe('investigate');
      expect(room.round).toBe(r);
      expect(room.players.every((p) => p.questionsLeft === 2)).toBe(true);
    }
    expect(room.board.revealed.length).toBeGreaterThan(0);
    await room.next('tv');
    expect(room.phase).toBe('accuse');
    const culprit = room.case!.truth.culprit;
    for (const p of room.players) room.vote(p.id, { culprit, item: room.case!.crime.item });
    await tick();
    expect(room.phase).toBe('reveal');
    expect(room.reveal?.culprit).toBe(culprit);
    expect(room.reveal?.steps.length).toBeGreaterThan(0);
    for (const p of room.players) expect(room.reveal!.scores[p.id]).toBe(4);
    await room.next('tv');
    expect(room.phase).toBe('results');
    await room.next('tv');
    expect(room.phase).toBe('lobby');
    expect(room.case).toBeNull();
    // Every phone got public and private state.
    for (const ph of phones) { expect(ph.last('room:state')).toBeTruthy(); expect(ph.last('you:state')).toBeTruthy(); }
  });

  it('never sends the solution in public state', async () => {
    const { room, tv } = await makeRoom(4);
    await room.start('tv');
    await room.next('tv');
    await tick();
    const s = JSON.stringify(tv.last('room:state'));
    expect(s).not.toContain('"truth"');
    expect(s).not.toContain('"lies"');
    expect(s).not.toContain('"key"');
    expect(tv.last('room:state')!.state.reveal).toBeUndefined();
  });
});

describe('accomplice', () => {
  it('has no accomplice under 4 players', async () => {
    const { room } = await makeRoom(3);
    await room.start('tv');
    expect([...room.priv.values()].every((p) => p.role === 'detective')).toBe(true);
    expect(room.accompliceId).toBeNull();
  });

  it('assigns exactly one accomplice at 4+ players, who learns the culprit and safe lies', async () => {
    for (const n of [4, 5, 6]) {
      const { room, phones } = await makeRoom(n, 100 + n);
      await room.start('tv');
      await tick();
      const accs = room.players.filter((p) => room.priv.get(p.id)!.role === 'accomplice');
      expect(accs).toHaveLength(1);
      const accPhone = phones.find((c) => c.playerId === accs[0].id)!;
      const you = accPhone.last('you:state')!.you;
      expect(you.role).toBe('accomplice');
      expect(you.knowsCulprit).toBe(room.case!.truth.culprit);
      expect(you.safeLies!.length).toBeGreaterThan(0);
      for (const ph of phones.filter((c) => c !== accPhone)) {
        const y = ph.last('you:state')!.you;
        expect(y.role).toBe('detective');
        expect(y.knowsCulprit).toBeUndefined();
        expect(y.safeLies).toBeUndefined();
      }
    }
  });

  it('picks the accomplice at random seats over many games', async () => {
    const seen = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const { room } = await makeRoom(4, i);
      await room.start('tv');
      seen.add(room.player(room.accompliceId!)!.seat);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('deals private clues by seat each round and keeps key clues away from the accomplice', async () => {
    const { room } = await makeRoom(6, 7);
    await room.start('tv');
    for (let r = 1; r <= 3; r++) await room.next('tv');
    const keyIds = new Set(room.case!.clues.filter((c) => c.key).map((c) => c.id));
    const acc = room.priv.get(room.accompliceId!)!;
    expect(acc.clueIds.some((id) => keyIds.has(id))).toBe(false);
    const totalPrivate = room.case!.clues.filter((c) => c.visibility === 'private').length;
    const dealt = [...room.priv.values()].reduce((n, p) => n + p.clueIds.length, 0);
    expect(dealt).toBe(totalPrivate);
  });
});

describe('question queue', () => {
  it('answers one at a time, in order, and limits two questions per round', async () => {
    const { room, tv } = await makeRoom(2);
    await room.start('tv');
    await room.next('tv');
    const [a, b] = room.players;
    const s = room.case!.suspects;
    const speaking: (string | null)[] = [];
    const orig = room.flush.bind(room);
    room.flush = () => { speaking.push(room.speaking); orig(); };
    const p1 = room.ask(a.id, s[0].id, 'Where were you at 9:00 pm?', 'typed');
    const p2 = room.ask(b.id, s[1].id, 'Where were you at 8:00 pm?', 'voice');
    expect(room.queue).toHaveLength(2);
    const [u1, u2] = await Promise.all([p1, p2]);
    expect(u1.speaker).toBe(s[0].id);
    expect(u2.speaker).toBe(s[1].id);
    expect(u1.at).toBeLessThanOrEqual(u2.at);
    const order = [...new Set(tv.msgs.filter((m) => m.t === 'utterance' && !(m as any).u.filler).map((m) => (m as any).u.id))];
    expect(order).toEqual([u1.id, u2.id]);
    expect(u1.parts!.length).toBeGreaterThan(0);
    expect(u1.partial).toBe(false);
    expect(speaking).toContain(s[0].id);
    expect(speaking).toContain(s[1].id);
    await room.ask(a.id, s[2].id, 'And at 10:00 pm?', 'typed');
    expect(a.questionsLeft).toBe(0);
    expect(() => room.ask(a.id, s[0].id, 'One more?', 'typed')).toThrow(/used your questions/);
    await tick();
    expect(room.speaking).toBeNull();
    expect(room.queue).toHaveLength(0);
  });

  it('refuses questions outside the investigation and for unknown suspects', async () => {
    const { room } = await makeRoom(1);
    await room.start('tv');
    expect(() => room.ask(room.players[0].id, 'x', 'hello', 'typed')).toThrow(GameError);
    await room.next('tv');
    expect(() => room.ask(room.players[0].id, 'nobody', 'hello', 'typed')).toThrow(/not in this case/);
  });

  it('waits for the TV to finish speaking when SPEECH_WAIT is on', async () => {
    const { cfg } = await import('../src/config.js');
    const prev = cfg.speechWait;
    cfg.speechWait = 1;
    try {
      const { room, tv } = await makeRoom(2);
      await room.start('tv');
      await room.next('tv');
      const s = room.case!.suspects;
      void room.ask(room.players[0].id, s[0].id, 'Where were you at 9:00 pm?', 'typed');
      void room.ask(room.players[1].id, s[1].id, 'Where were you at 9:00 pm?', 'typed');
      await new Promise((r) => setTimeout(r, 50));
      const ids = () => [...new Set(tv.msgs.filter((m) => m.t === 'utterance' && !(m as any).u.filler).map((m) => (m as any).u.id))];
      expect(ids()).toHaveLength(1); // second suspect waits its turn
      room.spoken(ids()[0]);
      await new Promise((r) => setTimeout(r, 50));
      expect(ids()).toHaveLength(2);
    } finally { cfg.speechWait = prev; }
  });
});

describe('board and theories', () => {
  it('pins, links, and checks a theory', async () => {
    const { room, tv } = await makeRoom(3);
    await room.start('tv');
    for (let r = 1; r <= 3; r++) await room.next('tv');
    const all = [...room.board.revealed, ...[...room.priv.values()].flatMap((p) => p.clueIds)];
    for (const id of all) room.pin(id);
    room.link(all[0], all[1]);
    expect(room.board.links).toHaveLength(1);
    const res = await room.proveIt({ culprit: room.case!.truth.culprit });
    expect(res.verdict).toBe('follows');
    expect(tv.last('verdict')?.verdict).toBe('follows');
    const innocent = room.case!.suspects.find((s) => s.id !== room.case!.truth.culprit)!;
    expect((await room.proveIt({ culprit: innocent.id })).verdict).toBe('contradicted');
  });
});

describe('phone extras', () => {
  it('keeps the chosen avatar, extends the soft timer, reads clues, reports accomplice caught', async () => {
    const { room, phones } = await makeRoom(4);
    const p = room.join('Zed', room.players[0].id, 'owl-2');
    expect(p.avatar).toBe('owl-2');
    await room.start('tv');
    await room.next('tv');
    const d0 = room.deadlineAt!;
    expect(d0).toBeGreaterThan(Date.now());
    room.moreTime();
    expect(room.deadlineAt!).toBeGreaterThan(d0);
    await room.readClues(room.players[1].id);
    const a = phones[1].last('announce');
    expect(a?.text).toMatch(/private clues/);
    expect(phones[0].msgs.filter((m) => m.t === 'announce' && /Your private clues/.test((m as any).text))).toHaveLength(0);
    for (let r = 2; r <= 4; r++) await room.next('tv');
    const acc = room.accompliceId!;
    for (const pl of room.players) room.vote(pl.id, { culprit: room.case!.truth.culprit, accomplice: pl.id === acc ? room.players.find((x) => x.id !== acc)!.id : acc });
    await tick();
    expect(room.reveal?.accompliceCaught).toBe(true);
  });
});

describe('captions', () => {
  it('cleans, splits and frames narration', async () => {
    const { cleanCaption, captionChunks, twoSentenceChunks } = await import('../src/captions.js');
    expect(cleanCaption('  "hello <break time=\"1s\"/> there "  ')).toBe('Hello there');
    expect(twoSentenceChunks('One. Two. Three. Mr. Pike went home.')).toEqual(['One. Two.', 'Three. Mr. Pike went home.']);
    const frames = captionChunks('The lights flicker, and go out. Thunder rolls over Wrenfield Hall, a draughty country house.');
    expect(frames.every((f) => f.split('\n').every((l) => l.length <= 40))).toBe(true);
  });
});

describe('theory proposals and lobby narration', () => {
  it('checks a proposal once most players agree', async () => {
    const { room, tv } = await makeRoom(3);
    await room.start('tv');
    for (let r = 1; r <= 3; r++) await room.next('tv');
    const [a, b] = room.players;
    const id = room.propose(a.id, { culprit: room.case!.truth.culprit });
    expect(tv.last('proposal')?.needed).toBe(2);
    expect(tv.last('verdict')).toBeUndefined();
    room.voteProposal(b.id, id, true);
    await tick(); await tick();
    const v = tv.last('verdict')!;
    expect(v.proposalId).toBe(id);
    expect(['follows', 'possible']).toContain(v.verdict);
    expect(() => room.voteProposal(b.id, id, true)).toThrow(GameError);
  });

  it('spells the room code and never says localhost', async () => {
    const { room, tv } = await makeRoom(1);
    room.joinUrl = 'https://some-long-tunnel-name.example.dev/p?room=TEST';
    room.join('Nia');
    await new Promise((r) => setTimeout(r, 30));
    await room.narrationIdle();
    const ann = tv.msgs.filter((m) => m.t === 'announce') as any[];
    expect(ann.some((m) => /Welcome.*Nia/.test(m.text))).toBe(true);
    const join = ann.find((m) => m.speech)!;
    expect(join.text).toBe('Scan the code or enter room code TEST');
    expect(join.speech).toBe('Scan the code on the TV, or type the room code: T, E, S, T.');
    expect(JSON.stringify(ann)).not.toMatch(/ dot |tunnel|https?:/);
    for (const m of ann) for (const frame of m.captionChunks) {
      const lines = frame.split('\n');
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const l of lines) expect(l.length).toBeLessThanOrEqual(40);
    }
  });

  it('records the accomplice line for the reveal', async () => {
    const { room } = await makeRoom(4);
    await room.start('tv');
    await room.next('tv');
    const acc = room.accompliceId!;
    await room.ask(acc, room.case!.suspects[0].id, 'Where were you at nine?', 'typed');
    for (let r = 2; r <= 4; r++) await room.next('tv');
    for (const p of room.players) room.vote(p.id, { culprit: room.case!.truth.culprit });
    await tick();
    expect(room.reveal?.accompliceLine).toBe('Where were you at nine?');
  });
});

describe('game design features', () => {
  it('runs the practice question with the house character, then round one', async () => {
    const { cfg } = await import('../src/config.js');
    cfg.tutorial = true;
    try {
      const { room, tv } = await makeRoom(2);
      await room.start('tv');
      await room.next('tv');
      expect(room.phase).toBe('tutorial');
      expect(tv.last('room:state')?.state.house?.name).toBeTruthy();
      const u = await room.ask(room.players[0].id, room.case!.suspects[0].id, 'Is it always this stormy?', 'typed');
      expect(u.speaker).toBe('house');
      expect(() => room.ask(room.players[0].id, 'house', 'Again?', 'typed')).toThrow(/practice/);
      await room.next('tv');
      expect(room.phase).toBe('investigate');
      expect(room.players.every((p) => p.questionsLeft === 2)).toBe(true);
    } finally { cfg.tutorial = false; }
  });

  it('turns the lights out in round three and gives one free emergency question', async () => {
    const { room, tv } = await makeRoom(2);
    await room.start('tv');
    for (let r = 1; r <= 3; r++) await room.next('tv');
    expect(tv.msgs.some((m) => m.t === 'event' && m.kind === 'blackout')).toBe(true);
    const target = room.case!.suspects[2].id;
    for (const p of room.players) room.emergencyVote(p.id, target);
    expect(room.emergency?.stage).toBe('ask');
    expect(room.emergency?.suspectId).toBe(target);
    const p = room.players[0];
    const before = p.questionsLeft;
    await room.ask(p.id, target, 'Where were you when the lights went out?', 'typed');
    expect(p.questionsLeft).toBe(before);
    expect(room.emergency?.stage).toBe('done');
  });

  it('lets the accomplice smudge one safe clue, once, with a public trace', async () => {
    const { room, tv, phones } = await makeRoom(4, 11);
    await room.start('tv');
    await room.next('tv'); await room.next('tv');
    const acc = room.accompliceId!;
    const opts = room.sabotageOptions();
    expect(opts.length).toBeGreaterThan(0);
    const keyIds = room.case!.clues.filter((c) => c.key).map((c) => c.id);
    expect(opts.some((id) => keyIds.includes(id))).toBe(false);
    const other = room.players.find((x) => x.id !== acc)!;
    await expect(room.sabotage(other.id, opts[0])).rejects.toThrow(/accomplice/);
    await room.sabotage(acc, opts[0]);
    await tick();
    expect(tv.msgs.some((m) => m.t === 'event' && m.kind === 'smudge')).toBe(true);
    expect(tv.last('room:state')!.state.board.smudged).toEqual([opts[0]]);
    expect(tv.last('room:state')!.state.board.cards!.find((c) => c.id === opts[0])!.text).toMatch(/Smudged/);
    await expect(room.sabotage(acc, opts[1] ?? opts[0])).rejects.toThrow(/already/);
    await room.next('tv');
    expect(room.board.revealed.includes(opts[0])).toBe(true);
    expect(tv.last('room:state')!.state.board.smudged).toEqual([]);
    await room.next('tv');
    for (const pl of room.players) room.vote(pl.id, { culprit: room.case!.truth.culprit });
    await tick();
    expect(room.reveal?.sabotage?.[0].clueId).toBe(opts[0]);
    void phones;
  });

  it('collects hunch votes from players who are out of questions and from the audience', async () => {
    const { room, tv } = await makeRoom(2);
    await room.start('tv');
    await room.next('tv');
    const [a, b] = room.players;
    b.questionsLeft = 0;
    const u = await room.ask(a.id, room.case!.suspects[0].id, 'Where were you at nine?', 'typed');
    const fan = room.join('Fan', undefined);
    expect(() => room.hunch(a.id, u.id, true)).toThrow(/questions first/);
    room.hunch(b.id, u.id, true);
    room.hunch(fan.id, u.id, false);
    expect(tv.last('hunch')).toMatchObject({ utteranceId: u.id, lying: 1, truth: 1 });
    expect(() => room.ask(fan.id, room.case!.suspects[0].id, 'Hi?', 'typed')).toThrow(/audience/);
    for (let r = 2; r <= 4; r++) await room.next('tv');
    for (const p of room.players) room.vote(p.id, { culprit: room.case!.truth.culprit });
    await tick();
    expect(room.reveal?.hunches?.total).toBe(2);
  });
});

describe('immersive features', () => {
  it('chimes each round, beats the accomplice heart, and confesses at the reveal', async () => {
    const { room, tv, phones } = await makeRoom(4, 21);
    await room.start('tv');
    await room.next('tv');
    expect(tv.msgs.some((m) => m.t === 'event' && m.kind === 'chime' && m.hour === 8)).toBe(true);
    expect(tv.msgs.some((m) => m.t === 'event' && m.kind === 'coldOpen')).toBe(true);
    const accPhone = phones.find((p) => p.playerId === room.accompliceId)!;
    const other = room.players.find((p) => p.id !== room.accompliceId)!;
    room.propose(other.id, { culprit: room.case!.truth.culprit });
    expect(accPhone.msgs.some((m) => m.t === 'haptic')).toBe(true);
    expect(tv.msgs.some((m) => m.t === 'haptic')).toBe(false);
    for (let r = 2; r <= 4; r++) await room.next('tv');
    for (const p of room.players) room.vote(p.id, { culprit: room.case!.truth.culprit });
    await new Promise((r) => setTimeout(r, 50));
    const conf = tv.msgs.filter((m) => m.t === 'utterance' && m.u.id.startsWith('confession:')) as any[];
    expect(conf.map((m) => m.u.id)).toEqual(['confession:0', 'confession:1', 'confession:2']);
    expect(conf[0].u.speaker).toBe(room.case!.truth.culprit);
    const n = room.reveal!.newspaper!;
    expect(n.paperName).toBeTruthy();
    expect(n.sub).not.toContain('{DETECTIVE}');
    expect(n.imageUrl).toContain('/front-page.png');
  });

  it('lets each player object once; a caught lie slips out a new board clue', async () => {
    const { room, tv } = await makeRoom(2, 3);
    await room.start('tv');
    await room.next('tv');
    const c = room.case!;
    const lie = c.lies.find((l) => l.s === c.truth.culprit)!;
    const [a] = room.players;
    const u = await room.ask(a.id, lie.s, `Where were you at ${c.slots[lie.slot].label}?`, 'typed');
    const before = room.board.revealed.length;
    const res = await room.objection(a.id, u.id);
    expect(tv.msgs.some((m) => m.t === 'event' && m.kind === 'objection' && m.byName === a.name)).toBe(true);
    expect(res.wasLying).toBe(true);
    expect(room.board.revealed.length).toBe(before + 1);
    expect(room.boardClues().some((x) => x.text.startsWith('Slip:'))).toBe(true);
    expect(room.youState(a.id).objectionUsed).toBe(true);
    await expect(room.objection(a.id, u.id)).rejects.toThrow(/already/);
  });
});

describe('pacing and playback', () => {
  it('moves to the next round by itself once everyone is out of questions', async () => {
    const { cfg } = await import('../src/config.js');
    cfg.autoAdvanceMs = 30;
    try {
      const { room, tv } = await makeRoom(2);
      await room.start('tv');
      await room.next('tv');
      const s = room.case!.suspects;
      for (const p of room.players) for (let i = 0; i < 2; i++) await room.ask(p.id, s[i].id, 'Where were you at nine?', 'typed');
      await new Promise((r) => setTimeout(r, 120));
      expect(room.round).toBe(2);
      expect(tv.msgs.some((m) => m.t === 'announce' && /The clock strikes/.test(m.text))).toBe(true);
    } finally { cfg.autoAdvanceMs = 0; }
  });

  it('advances when the soft round timer runs out, and more time pushes it back', async () => {
    const { cfg } = await import('../src/config.js');
    const prev = cfg.roundSeconds; cfg.roundSeconds = 0.05;
    const prevMore = cfg.moreTimeSeconds; cfg.moreTimeSeconds = 0.2;
    try {
      const { room } = await makeRoom(1);
      await room.start('tv');
      await room.next('tv');
      room.moreTime();
      await new Promise((r) => setTimeout(r, 120));
      expect(room.round).toBe(1); // extended
      await new Promise((r) => setTimeout(r, 250));
      expect(room.round).toBeGreaterThanOrEqual(2);
    } finally { cfg.roundSeconds = prev; cfg.moreTimeSeconds = prevMore; }
  });

  it('measures objection and hunch windows from when the TV actually plays the answer', async () => {
    const { room, tv } = await makeRoom(2);
    await room.start('tv');
    await room.next('tv');
    const [a, b] = room.players; b.questionsLeft = 0;
    const u = await room.ask(a.id, room.case!.suspects[0].id, 'Where were you at nine?', 'typed');
    room.playing(u.parts![0].id);
    room.spoken(u.parts![u.parts!.length - 1].id);
    const st = room.publicState();
    expect(st.hunch?.closesAt).toBeGreaterThan(Date.now() + 15_000);
    room.hunch(b.id, u.id, true);
    expect(tv.last('hunch')?.lying).toBe(1);
    await room.objection(a.id, u.id);
  });
});

describe('heartbeat', () => {
  const fakeSocket = () => {
    const handlers: Record<string, ((...a: any[]) => void)[]> = {};
    const sock = {
      terminated: false, answering: true,
      readyState: 1, send() {}, close() {},
      ping() { if (sock.answering) setTimeout(() => (handlers.pong ?? []).forEach((f) => f()), 1); },
      terminate() { sock.terminated = true; (handlers.close ?? []).forEach((f) => f()); },
      on(ev: string, fn: (...a: any[]) => void) { (handlers[ev] ??= []).push(fn); },
    };
    return sock;
  };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('shows a silent phone as away quickly, keeps its seat and socket, and brings a late answer straight back', async () => {
    const { Hub } = await import('../src/hub.js');
    const hub = await new Hub().init();
    hub.heartbeat = { everyMs: 20, awayMs: 70, dropMs: 400 };
    const room = hub.createRoom();
    const p = room.join('Quiet');
    const sock = fakeSocket();
    hub.connect(sock, { role: 'phone', room: room.code, pid: p.id });
    await wait(150);
    expect(room.player(p.id)!.connected).toBe(true); // answering pings: present
    sock.answering = false;
    await wait(140);
    expect(room.player(p.id)!.connected).toBe(false); // away within a few beats
    expect(sock.terminated).toBe(false); // but not kicked
    sock.answering = true; // slow but alive: the next pong brings it back
    await wait(60);
    expect(room.player(p.id)!.connected).toBe(true);
    expect(room.players).toHaveLength(1);
    sock.answering = false;
    await wait(500);
    expect(sock.terminated).toBe(true); // gone for good: the socket is closed
    expect(room.player(p.id)!.connected).toBe(false);
    hub.close();
  });
});

describe('players who leave do not block votes', () => {
  async function toAccuse(n: number) {
    const { room, tv, phones } = await makeRoom(n);
    await room.start(phones[0].playerId!);
    await room.next('tv'); await room.next('tv'); await room.next('tv'); await room.next('tv');
    expect(room.phase).toBe('accuse');
    return { room, tv, phones };
  }

  it('reveals once everyone still here has voted, when the last holdout leaves', async () => {
    const { room, phones } = await toAccuse(3);
    const c = room.case!;
    room.vote(phones[0].playerId!, { culprit: c.suspects[0].id });
    room.vote(phones[1].playerId!, { culprit: c.suspects[1].id });
    expect(room.phase).toBe('accuse');
    room.detach(phones[2]); // closes the app for good
    await tick();
    expect(room.phase).toBe('reveal');
  });

  it('a holdout that goes quiet (away) also stops blocking the vote', async () => {
    const { room, phones } = await toAccuse(3);
    const c = room.case!;
    room.vote(phones[0].playerId!, { culprit: c.suspects[0].id });
    room.vote(phones[1].playerId!, { culprit: c.suspects[0].id });
    room.setPresence(phones[2].playerId!, false);
    await tick();
    expect(room.phase).toBe('reveal');
  });

  it('does not reveal when everyone leaves before anyone votes', async () => {
    const { room, phones } = await toAccuse(2);
    for (const ph of phones) room.detach(ph);
    await tick();
    expect(room.phase).toBe('accuse');
  });
});
