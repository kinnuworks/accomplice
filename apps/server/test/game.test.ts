import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer, type Built } from '../src/server.js';
import { simulateGame } from '../scripts/sim-lib.js';

let built: Built; let base = '';
beforeAll(async () => {
  built = await buildServer();
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  base = `127.0.0.1:${(built.app.server.address() as any).port}`;
});
afterAll(async () => { await built.app.close(); });

describe('full game over WebSockets (mock voices and model)', () => {
  it('plays a 4 player game with an accomplice to the end', async () => {
    const r = await simulateGame(`ws://${base}`, { players: 4 });
    expect(r.accomplice).toBe(true);
    expect(r.timings.answers).toHaveLength(24);
    expect(r.votedRight).toBe(3);
    expect(Object.keys(r.scores)).toHaveLength(4);
    const png = await fetch(`http://${base}/api/rooms/${r.code}/front-page.png`);
    expect(png.headers.get('content-type')).toBe('image/png');
    const buf = Buffer.from(await png.arrayBuffer());
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    expect(buf.readUInt32BE(16)).toBe(1080);
    expect(buf.readUInt32BE(20)).toBe(1350);
  });

  it('plays a 3 player cozy game without an accomplice', async () => {
    const r = await simulateGame(`ws://${base}`, { players: 3, tone: 'cozy' });
    expect(r.accomplice).toBe(false);
    expect(r.votedRight).toBe(3);
  });
});

describe('http endpoints', () => {
  it('reports health and makes QR codes', async () => {
    const h = await fetch(`http://${base}/api/health`).then((x) => x.json());
    expect(h.ok).toBe(true);
    expect(JSON.stringify(h)).not.toMatch(/sk-ant|secret/i);
    const qr = await fetch(`http://${base}/api/qr?text=${encodeURIComponent('http://x/p?room=ABCD')}`);
    expect(qr.headers.get('content-type')).toContain('image/svg+xml');
    expect(await qr.text()).toContain('<svg');
  });
});

describe('GameApi (for the MCP server)', () => {
  it('drives a solo case without phones', async () => {
    const { api } = built;
    const { code } = api.createRoom({ tone: 'classic', seed: 5 });
    const pub = await api.startCase(code);
    expect(pub.suspects.length).toBeGreaterThanOrEqual(4);
    const suspects = api.listSuspects(code);
    const u = await api.ask(code, suspects[0].name.split(' ').pop()!, 'Where were you at 9:00 pm?');
    expect(u.text.length).toBeGreaterThan(5);
    const b = api.board(code);
    expect(b.clues.length).toBeGreaterThan(0);
    expect(api.examineClue(code, b.clues[0].id).text).toBe(b.clues[0].text);
    await api.next(code); await api.next(code);
    const res = await api.accuse(code, { culprit: suspects[0].id });
    expect(typeof res.correct).toBe('boolean');
    expect(res.steps.length).toBeGreaterThan(0);
  });
});

describe('GameApi hint and narrate', () => {
  it('gives one elimination step at a time and never the culprit', async () => {
    const { api } = built;
    const { code } = api.createRoom({ tone: 'classic', seed: 9 });
    await api.startCase(code);
    await api.next(code); await api.next(code);
    const room = built.hub.get(code)!;
    const culprit = room.case!.suspects.find((s) => s.id === room.case!.truth.culprit)!;
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const h = api.hint(code);
      expect(h.text).not.toMatch(/Case closed|did it/);
      if (h.clueId) { expect(seen.has(h.clueId)).toBe(false); seen.add(h.clueId); expect(h.text).not.toContain(`${culprit.name} was`); }
    }
    expect(seen.size).toBeGreaterThan(0);
    const n = await api.narrate('  "Good evening, detectives."  ');
    expect(n.captionChunks).toEqual(['Good evening, detectives.']);
  });
});

describe('GameApi for voice turns (MCP)', () => {
  it('skips the practice question: the first listed suspect answers in their own name, never the house character', async () => {
    const { cfg } = await import('../src/config.js');
    const was = cfg.tutorial; cfg.tutorial = true;
    try {
      const { api } = built;
      const { code } = api.createRoom({ tone: 'classic', seed: 11 });
      await api.startCase(code);
      expect(api.state(code).phase).toBe('investigate');
      const first = api.listSuspects(code)[0];
      const u = await api.ask(code, first.id, 'Where were you at nine o clock?');
      expect(u.speaker).toBe(first.id);
      expect(u.speakerName).toBe(first.name);
      expect(u.text).not.toMatch(/suspects are the ones to ask|hold the button|only keep the house/i);
    } finally { cfg.tutorial = was; }
  });

  it('a question from a voice assistant during a TV practice round opens round one instead of going to the butler', async () => {
    const { cfg } = await import('../src/config.js');
    const was = cfg.tutorial; cfg.tutorial = true;
    try {
      const { api, hub } = built;
      const { code } = api.createRoom({ tone: 'classic', seed: 12 });
      const room = hub.get(code)!;
      room.join('Ana');
      await room.start('tv');
      await room.next('tv');
      expect(room.phase).toBe('tutorial');
      const first = api.listSuspects(code)[0];
      const u = await api.ask(code, first.id, 'Where were you at nine?');
      expect(room.phase).toBe('investigate');
      expect(u.speaker).toBe(first.id);
    } finally { cfg.tutorial = was; }
  });

  it('returns the checked answer without waiting for the room to finish speaking it', async () => {
    const { cfg } = await import('../src/config.js');
    const was = cfg.speechWait; cfg.speechWait = 50; // the room would hold its queue for many seconds per answer
    try {
      const { api } = built;
      const { code } = api.createRoom({ tone: 'classic', seed: 13 });
      await api.startCase(code);
      const [a, b] = api.listSuspects(code);
      const t0 = Date.now();
      const u1 = await api.ask(code, a.id, 'Where were you at 9:00 pm?');
      const u2 = await api.ask(code, b.id, 'Where were you at 9:00 pm?'); // queued behind the first in the room
      expect(Date.now() - t0).toBeLessThan(2000);
      expect(u1.text.length).toBeGreaterThan(5);
      expect(u2.speaker).toBe(b.id);
      expect(u1.partial).toBe(false);
    } finally { cfg.speechWait = was; }
  });
});
