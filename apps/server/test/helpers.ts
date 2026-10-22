import type { ServerToClient } from '@accomplice/protocol';
import { loadEngine } from '../src/engine.js';
import { Room, type Client } from '../src/room.js';

export class FakeClient implements Client {
  msgs: ServerToClient[] = [];
  constructor(public role: 'tv' | 'phone', public playerId?: string) {}
  send(m: ServerToClient) { this.msgs.push(m); }
  last<K extends ServerToClient['t']>(t: K) { return [...this.msgs].reverse().find((m) => m.t === t) as Extract<ServerToClient, { t: K }> | undefined; }
}

export async function makeRoom(players: number, seed = 42) {
  const engine = await loadEngine();
  const room = new Room('TEST', engine, 'classic', { seed });
  const tv = new FakeClient('tv');
  room.attach(tv);
  const phones: FakeClient[] = [];
  for (let i = 0; i < players; i++) {
    const p = room.join(`P${i + 1}`);
    const c = new FakeClient('phone', p.id);
    room.attach(c);
    phones.push(c);
  }
  return { room, tv, phones, engine };
}

export const tick = () => new Promise((r) => setTimeout(r, 5));
