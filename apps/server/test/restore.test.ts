import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server.js';
import { Bot } from '../scripts/sim-lib.js';
import type { SnapshotStore } from '../src/hub.js';

/** In-memory stand-in for the DynamoDB snapshot table, shared across two server lifetimes. */
function memoryStore(): SnapshotStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return { data, get: async (c) => data.get(c), put: async (c, _p, _n, s) => { data.set(c, JSON.parse(JSON.stringify(s))); } };
}

async function boot(store: SnapshotStore) {
  const b = await buildServer();
  b.hub.snapshots = store;
  await b.app.listen({ port: 0, host: '127.0.0.1' });
  return { ...b, ws: `ws://127.0.0.1:${(b.app.server.address() as any).port}` };
}

describe('crash recovery', () => {
  it('restores a game mid-round after a restart', async () => {
    const store = memoryStore();
    const a = await boot(store);
    const tv = new Bot(`${a.ws}/ws?role=tv`, 'tv'); await tv.open();
    tv.send({ t: 'tv:create', tone: 'classic' });
    const { code } = await tv.waitMsg('room:created');
    const names = ['Asha', 'Ben', 'Chen', 'Dami'];
    const phones: Bot[] = [];
    for (const n of names) {
      const p = new Bot(`${a.ws}/ws?role=phone&room=${code}`, n); await p.open();
      p.send({ t: 'phone:join', room: code, name: n }); await p.waitFor(() => p.you);
      phones.push(p);
    }
    phones[0].send({ t: 'phone:start' });
    await tv.waitFor(() => tv.state?.phase === 'briefing', 30_000);
    tv.send({ t: 'tv:next' }); await tv.waitFor(() => tv.state?.phase === 'investigate' && tv.state.round === 1);
    tv.send({ t: 'tv:next' }); await tv.waitFor(() => tv.state?.round === 2);
    const s = tv.state!.case!.suspects;
    phones[1].send({ t: 'phone:ask', suspectId: s[0].id, text: 'Where were you at 9:00 pm?', via: 'typed' });
    await tv.waitMsg('utterance', (m) => m.u.partial === false);
    tv.send({ t: 'tv:pin', clueId: tv.state!.board.revealed[0] });
    await tv.waitFor(() => tv.state!.board.pinned.length === 1);
    for (const p of phones) await p.waitFor(() => p.you?.role);
    const before = { state: tv.state!, roles: phones.map((p) => p.you!.role), clues: phones.map((p) => p.you!.privateClues.map((c) => c.id)), ids: phones.map((p) => p.you!.playerId) };
    await new Promise((r) => setTimeout(r, 1800)); // let the debounced snapshot land
    for (const b of [tv, ...phones]) b.close();
    await a.app.close();
    expect(store.data.has(code)).toBe(true);

    // A fresh process: nothing in memory until someone reconnects with the room code.
    const b = await boot(store);
    expect(b.hub.rooms.size).toBe(0);
    const tv2 = new Bot(`${b.ws}/ws?role=tv&room=${code}`, 'tv2'); await tv2.open();
    const st = await tv2.waitFor(() => tv2.state, 30_000, 'restored state');
    expect(st.phase).toBe('investigate');
    expect(st.round).toBe(2);
    expect(st.case!.id).toBe(before.state.case!.id);
    expect(st.board.revealed).toEqual(before.state.board.revealed);
    expect(st.board.pinned).toEqual(before.state.board.pinned);
    expect(st.players.map((p) => p.name)).toEqual(names);
    expect(st.players.map((p) => p.questionsLeft)).toEqual(before.state.players.map((p) => p.questionsLeft));
    expect(st.transcript.length).toBeGreaterThan(0);
    // Phones rejoin with their old ids and get the same secret roles and clues.
    for (let i = 0; i < 4; i++) {
      const p = new Bot(`${b.ws}/ws?role=phone&room=${code}&pid=${before.ids[i]}`, names[i]); await p.open();
      p.send({ t: 'phone:join', room: code, name: names[i], playerId: before.ids[i] });
      const you = await p.waitFor(() => p.you, 10_000);
      expect(you.role).toBe(before.roles[i]);
      expect(you.privateClues.map((c) => c.id)).toEqual(before.clues[i]);
      p.close();
    }
    // And the game carries on.
    tv2.send({ t: 'tv:next' });
    await tv2.waitFor(() => tv2.state?.round === 3, 10_000);
    tv2.close();
    await b.app.close();
  });

  it('stays in memory only when no snapshot store is configured', async () => {
    const b = await buildServer();
    expect(b.hub.snapshots).toBeNull();
    expect(await b.hub.getOrRestore('ABCD')).toBeUndefined();
    await b.app.close();
  });
});
