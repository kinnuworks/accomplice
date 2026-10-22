// Headless bots that play a full game over the real WebSocket protocol. Shared by `pnpm simulate` and tests.
import WebSocket from 'ws';
import type { ClientToServer, RoomState, ServerToClient, YouState, Utterance } from '@accomplice/protocol';

export class Bot {
  ws: WebSocket;
  msgs: ServerToClient[] = [];
  state: RoomState | null = null;
  you: YouState | null = null;
  private listeners = new Set<() => void>();
  constructor(url: string, public name: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as ServerToClient;
      this.msgs.push(m);
      if (m.t === 'room:state') this.state = m.state;
      if (m.t === 'you:state') this.you = m.you;
      for (const l of this.listeners) l();
    });
  }
  open() { return new Promise<void>((res, rej) => { this.ws.once('open', () => res()); this.ws.once('error', rej); }); }
  send(m: ClientToServer) { this.ws.send(JSON.stringify(m)); }
  waitFor<T>(pred: () => T | undefined | null | false, timeoutMs = 30_000, what = 'condition'): Promise<T> {
    return new Promise((resolve, reject) => {
      const check = () => { const v = pred(); if (v) { cleanup(); resolve(v as T); } };
      const timer = setTimeout(() => { cleanup(); reject(new Error(`${this.name}: timed out waiting for ${what}`)); }, timeoutMs);
      const cleanup = () => { clearTimeout(timer); this.listeners.delete(check); };
      this.listeners.add(check);
      check();
    });
  }
  waitMsg<K extends ServerToClient['t']>(t: K, pred: (m: Extract<ServerToClient, { t: K }>) => boolean = () => true, timeoutMs = 30_000, from = 0) {
    return this.waitFor(() => this.msgs.slice(from).find((m) => m.t === t && pred(m as any)) as Extract<ServerToClient, { t: K }> | undefined, timeoutMs, t);
  }
  close() { this.ws.close(); }
}

export interface SimResult {
  code: string; players: number; accomplice: boolean; culprit: string; votedRight: number; scores: Record<string, number>;
  timings: { caseGenMs: number; answers: { ms: number; suspect: string }[]; proveItMs: number[]; totalMs: number };
  transcript: Utterance[];
}

const QUESTIONS = [
  'Where were you at {slot}?',
  'Did you see anyone near the {room} at {slot}?',
  'What do you make of the {item}?',
  'Why should we believe a word you say?',
  'Who do you think did it?',
  'Were you ever in the {room} tonight?',
];

export async function simulateGame(baseWs: string, opts: { players?: number; tone?: 'classic' | 'cozy'; log?: (s: string) => void; questionTimeoutMs?: number; burst?: boolean; gapMs?: number } = {}): Promise<SimResult> {
  const say = opts.log ?? (() => {});
  const n = opts.players ?? 4;
  const t0 = Date.now();
  const tv = new Bot(`${baseWs}/ws?role=tv`, 'tv');
  await tv.open();
  tv.send({ t: 'tv:create', tone: opts.tone ?? 'classic' });
  const created = await tv.waitMsg('room:created');
  const code = created.code;
  say(`room ${code} created, join at ${created.joinUrl}`);
  // TV pretends to play audio instantly.
  tv.ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.t === 'utterance') tv.send({ t: 'tv:spoken', id: m.u.id }); });

  const names = ['Asha', 'Ben', 'Chen', 'Dami', 'Esme', 'Farid'];
  const phones: Bot[] = [];
  for (let i = 0; i < n; i++) {
    const b = new Bot(`${baseWs}/ws?role=phone&room=${code}`, names[i]);
    await b.open();
    b.send({ t: 'phone:join', room: code, name: names[i] });
    await b.waitFor(() => b.you, 5000, 'you:state');
    phones.push(b);
  }
  say(`${n} players joined; host is ${phones[0].name}`);

  const g0 = Date.now();
  phones[0].send({ t: 'phone:start' });
  await tv.waitFor(() => tv.state?.phase === 'briefing' && tv.state, 60_000, 'briefing');
  const caseGenMs = Date.now() - g0;
  const pub = tv.state!.case!;
  say(`case "${pub.title}" ready in ${caseGenMs} ms; suspects: ${pub.suspects.map((s) => s.name).join(', ')}`);
  for (const p of phones) await p.waitFor(() => p.you?.role, 10_000, 'role card');
  const acc = phones.find((p) => p.you?.role === 'accomplice');
  if (acc) say(`${acc.name} is secretly the accomplice`);

  const answers: { ms: number; suspect: string }[] = [];
  // Cold open: everyone asks the house one free practice question.
  tv.send({ t: 'tv:next' });
  const tut = await tv.waitFor(() => (tv.state?.phase === 'tutorial' || tv.state?.phase === 'investigate') && tv.state, 30_000, 'tutorial');
  if (tut.phase === 'tutorial') {
    for (const p of phones) {
      const from = tv.msgs.length; const text = 'Is it always this stormy here?';
      p.send({ t: 'phone:ask', suspectId: 'house', text, via: 'typed' });
      const m = await tv.waitMsg('utterance', (x) => x.u.askedBy === p.you!.playerId && x.u.speaker === 'house' && x.u.partial === false, 60_000, from);
      say(`  practice: ${p.name} -> ${m.u.speakerName}: "${m.u.text}"`);
    }
  }
  const proveItMs: number[] = [];
  let qi = 0;
  for (const round of [1, 2, 3]) {
    if (!(round === 1 && tv.state?.phase === 'investigate')) tv.send({ t: 'tv:next' });
    await tv.waitFor(() => tv.state?.phase === 'investigate' && tv.state.round === round, 30_000, `round ${round}`);
    say(`round ${round}: board has ${tv.state!.board.revealed.length} clues`);
    if (round === 3 && tv.state!.emergency) {
      for (const p of phones) p.send({ t: 'phone:emergencyVote', suspectId: pub.suspects[1].id });
      await tv.waitFor(() => tv.state?.emergency?.stage === 'ask', 10_000, 'emergency');
      const from = tv.msgs.length; const text = 'Where were you when the lights went out?';
      phones[0].send({ t: 'phone:ask', suspectId: tv.state!.emergency!.suspectId!, text, via: 'typed' });
      const m = await tv.waitMsg('utterance', (x) => x.u.question === text && x.u.partial === false, 60_000, from);
      say(`  emergency: ${phones[0].name} -> ${m.u.speakerName}: "${m.u.text}"`);
    }
    for (let q = 0; q < 2; q++) {
      const pending: Promise<void>[] = [];
      for (const p of phones) {
        // Living room pace: one question at a time unless burst mode fires everyone at once.
        if (!opts.burst && pending.length) { await Promise.all(pending); await new Promise((r) => setTimeout(r, opts.gapMs ?? 300)); }
        const suspect = pub.suspects[(qi++) % pub.suspects.length];
        const slot = pub.slots[(qi * 7) % pub.slots.length];
        const room = pub.rooms[(qi * 3) % pub.rooms.length];
        const text = QUESTIONS[qi % QUESTIONS.length].replace('{slot}', slot.label).replace('{room}', room.name).replace('{item}', pub.items[qi % pub.items.length].name);
        const from = tv.msgs.length;
        const sent = Date.now();
        p.send({ t: 'phone:ask', suspectId: suspect.id, text, via: 'typed' });
        pending.push(tv.waitMsg('utterance', (m) => m.u.askedBy === p.you!.playerId && m.u.question === text, opts.questionTimeoutMs ?? 90_000, from).then((m) => {
          answers.push({ ms: Date.now() - sent, suspect: suspect.id });
          say(`  ${p.name} -> ${suspect.name}: "${text}"\n     ${m.u.speakerName}: "${m.u.text}" (${Date.now() - sent} ms${m.u.audioUrl ? ', voiced' : ''})`);
        }));
      }
      await Promise.all(pending);
    }
    await tv.waitFor(() => tv.state && tv.state.queue.length === 0 && !tv.state.speaking, 60_000, 'queue drained');
  }

  // Detectives share their private clues; pin everything and ask the engine about each suspect.
  const shared = phones.filter((p) => p.you?.role !== 'accomplice').flatMap((p) => p.you!.privateClues.map((c) => c.id));
  const toPin = Array.from(new Set([...tv.state!.board.revealed, ...shared]));
  for (const id of toPin) tv.send({ t: 'tv:pin', clueId: id });
  await tv.waitFor(() => tv.state!.board.pinned.length === toPin.length, 5000, 'pins');
  say(`pinned ${toPin.length} clues (${shared.length} shared from phones)`);
  let best: string | null = null;
  for (const s of pub.suspects) {
    const from = tv.msgs.length; const p0 = Date.now();
    tv.send({ t: 'tv:proveIt', theory: { culprit: s.id } });
    const v = await tv.waitMsg('verdict', (m) => m.theory.culprit === s.id, 20_000, from);
    proveItMs.push(Date.now() - p0);
    say(`  prove it: ${s.name} -> ${v.verdict}`);
    if (v.verdict === 'follows') best = s.id;
  }
  const possible = best ?? pub.suspects[0].id;

  tv.send({ t: 'tv:next' });
  await tv.waitFor(() => tv.state?.phase === 'accuse', 30_000, 'accuse');
  for (const p of phones) {
    const isAcc = p.you?.role === 'accomplice';
    const others = phones.filter((x) => x !== p);
    p.send({ t: 'phone:vote', culprit: isAcc ? pub.suspects.find((s) => s.id !== p.you!.knowsCulprit)!.id : possible, item: pub.items[0].id, accomplice: acc ? (isAcc ? others[0].you!.playerId : acc.you!.playerId) : undefined });
  }
  await tv.waitFor(() => tv.state?.phase === 'reveal' && tv.state.reveal, 30_000, 'reveal');
  const reveal = tv.state!.reveal!;
  const culpritName = pub.suspects.find((s) => s.id === reveal.culprit)!.name;
  say(`reveal: ${culpritName} did it; ${reveal.steps.length} proof steps`);
  tv.send({ t: 'tv:next' });
  await tv.waitFor(() => tv.state?.phase === 'results', 30_000, 'results');
  const votedRight = phones.filter((p) => p.you?.role !== 'accomplice' && p.you?.vote?.culprit === reveal.culprit).length;
  const result: SimResult = {
    code, players: n, accomplice: !!acc, culprit: reveal.culprit, votedRight, scores: reveal.scores,
    timings: { caseGenMs, answers, proveItMs, totalMs: Date.now() - t0 }, transcript: tv.state!.transcript,
  };
  for (const b of [tv, ...phones]) b.close();
  return result;
}
