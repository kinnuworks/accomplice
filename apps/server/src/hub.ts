// Room registry and WebSocket message routing for /ws?role=tv|phone&room=CODE&pid=<playerId>.
import type { ClientToServer, ServerToClient } from '@accomplice/protocol';
import { Room, GameError, type Client } from './room.js';
import { loadEngine, type Engine } from './engine.js';
import { log } from './log.js';
import { storeEnabled, getSnapshot, putSnapshot } from './aws/store.js';

/** Where room snapshots live for crash recovery. DynamoDB when ACCOMPLICE_TABLE is set; off (in memory only) otherwise. */
export interface SnapshotStore {
  get(code: string): Promise<unknown | undefined>;
  put(code: string, phase: string, players: number, snapshot: unknown): Promise<void>;
}
const dynamoSnapshots: SnapshotStore = {
  get: async (code) => (await getSnapshot(code))?.state,
  put: (code, phase, players, snap) => putSnapshot(code, phase, players, snap),
};

const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L or O
const BLOCK = new Set(['DAMN', 'DUMB', 'FUCK', 'SHIT', 'CUNT', 'DICK', 'COCK', 'PISS', 'TWAT', 'SEXY', 'NAZI', 'KKKK', 'ANUS', 'PUSS', 'SUCK']);

export interface SocketLike { send(data: string): void; close(): void; readyState: number; on(ev: string, fn: (...a: any[]) => void): void; ping?(): void; terminate?(): void }

/** Ping cadence. A phone silent for HEARTBEAT_AWAY_MS shows as away (seat kept, votes stop waiting on it);
 *  silent for HEARTBEAT_DROP_MS its socket is closed and it rejoins by id when it comes back. */
export const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS ?? 2_500);
export const HEARTBEAT_AWAY_MS = Number(process.env.HEARTBEAT_AWAY_MS ?? HEARTBEAT_MS * 2.4);
export const HEARTBEAT_DROP_MS = Number(process.env.HEARTBEAT_DROP_MS ?? HEARTBEAT_MS * 12);

export class Hub {
  rooms = new Map<string, Room>();
  engine!: Engine;
  joinUrlFor: (code: string) => string = (code) => `/p?room=${code}`;
  private sweeper: NodeJS.Timeout | null = null;
  snapshots: SnapshotStore | null = storeEnabled() ? dynamoSnapshots : null;
  private restoring = new Map<string, Promise<Room | undefined>>();
  private saveTimers = new Map<string, NodeJS.Timeout>();
  /** Heartbeat timings for new sockets (tests shorten them). */
  heartbeat = { everyMs: HEARTBEAT_MS, awayMs: HEARTBEAT_AWAY_MS, dropMs: HEARTBEAT_DROP_MS };

  async init() {
    this.engine = await loadEngine();
    this.sweeper = setInterval(() => this.sweep(), 10 * 60_000);
    this.sweeper.unref?.();
    return this;
  }

  close() { if (this.sweeper) clearInterval(this.sweeper); for (const t of this.saveTimers.values()) clearTimeout(t); }

  newCode(): string {
    for (let i = 0; i < 1000; i++) {
      let code = '';
      for (let j = 0; j < 4; j++) code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
      if (!this.rooms.has(code) && !BLOCK.has(code)) return code;
    }
    throw new Error('no room codes left');
  }

  createRoom(tone: 'classic' | 'cozy' = 'classic', opts: { seed?: number; code?: string } = {}): Room {
    const code = opts.code && !this.rooms.has(opts.code) ? opts.code : this.newCode();
    const room = new Room(code, this.engine, tone, { seed: opts.seed, prewarm: true });
    room.joinUrl = this.joinUrlFor(code);
    this.rooms.set(code, room);
    this.wire(room);
    log.info(`room ${code} created`);
    return room;
  }

  /** Save a snapshot shortly after each burst of changes (when a snapshot store is configured). */
  private wire(room: Room) {
    if (!this.snapshots) return;
    room.onChange = () => {
      if (this.saveTimers.has(room.code)) return;
      const t = setTimeout(() => {
        this.saveTimers.delete(room.code);
        if (this.rooms.get(room.code) !== room) return;
        void this.snapshots?.put(room.code, room.phase, room.players.length, room.snapshot()).catch(() => {});
      }, 1500);
      t.unref?.();
      this.saveTimers.set(room.code, t);
    };
  }

  /** A room in memory, or one rebuilt from its last snapshot after a restart. */
  async getOrRestore(code?: string | null): Promise<Room | undefined> {
    const live = this.get(code);
    if (live || !code || !this.snapshots) return live;
    const key = code.toUpperCase().trim();
    if (!/^[A-Z]{4}$/.test(key)) return undefined;
    let p = this.restoring.get(key);
    if (!p) {
      p = (async () => {
        try {
          const snap = await this.snapshots!.get(key);
          if (!snap) return undefined;
          const room = await Room.restore(key, this.engine, snap);
          if (!room) return undefined;
          if (this.rooms.has(key)) return this.rooms.get(key);
          room.joinUrl = this.joinUrlFor(key);
          this.rooms.set(key, room);
          this.wire(room);
          return room;
        } catch (e) {
          log.warn(`restore ${key} failed: ${(e as Error)?.message}`);
          return undefined;
        } finally { this.restoring.delete(key); }
      })();
      this.restoring.set(key, p);
    }
    return p;
  }

  get(code?: string | null): Room | undefined { return code ? this.rooms.get(code.toUpperCase().trim()) : undefined; }

  private sweep() {
    const now = Date.now();
    for (const [code, r] of this.rooms) {
      if (r.clients.size === 0 && now - r.lastActive > 2 * 60 * 60_000) { this.rooms.delete(code); log.info(`room ${code} closed (idle)`); }
    }
  }

  /** Wire one WebSocket connection. */
  connect(ws: SocketLike, query: { role?: string; room?: string; pid?: string }) {
    const role = query.role === 'tv' ? 'tv' : 'phone';
    const send = (msg: ServerToClient) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
    const client: Client = { role, playerId: undefined, send };
    let room: Room | undefined;

    const bind = (r: Room) => { if (room && room !== r) room.detach(client); room = r; r.attach(client); };

    // Reconnects may name a room this process has never seen (after a deploy or crash): restore it first.
    const ready = (async () => {
      if (!query.room) return;
      const r = await this.getOrRestore(query.room);
      if (role === 'tv') { if (r) bind(r); else send({ t: 'error', message: 'That room has closed. Start a new one.' }); }
      if (role === 'phone' && query.pid && r?.player(query.pid)) {
        // Silent reconnect: the phone still sends phone:join, but it sees state immediately.
        client.playerId = query.pid; bind(r); const p = r.player(query.pid)!; p.connected = true; r.changed();
      }
    })().catch(() => {});

    ws.on('message', async (data: unknown) => {
      alive(); // any message proves the phone is there
      await ready;
      let msg: ClientToServer;
      try { msg = JSON.parse(String(data)); } catch { return send({ t: 'error', message: 'Bad message.' }); }
      try {
        await this.handle(msg, client, () => room, bind, send);
      } catch (e) {
        if (e instanceof GameError) send({ t: 'error', message: e.message });
        else { log.error('handler error', e); send({ t: 'error', message: 'Something went wrong on our side. Try that again.' }); }
      }
    });
    // Heartbeat: ping every HEARTBEAT_MS. A phone that has said nothing (no pong, no message) for HEARTBEAT_AWAY_MS
    // shows as away, so votes stop waiting on it, but keeps its socket: a slow phone that answers late is simply
    // back. Only after HEARTBEAT_DROP_MS is the socket closed; the phone reconnects and rejoins by id.
    const hb = this.heartbeat;
    let lastSeen = Date.now();
    function alive() {
      lastSeen = Date.now();
      if (client.away) {
        client.away = false;
        if (room && client.playerId) room.setPresence(client.playerId, true);
      }
    }
    ws.on('pong', alive);
    const beat = setInterval(() => {
      const quiet = Date.now() - lastSeen;
      if (quiet >= hb.dropMs) { clearInterval(beat); try { ws.terminate ? ws.terminate() : ws.close(); } catch { /* gone */ } return; }
      if (quiet >= hb.awayMs && !client.away && role === 'phone') {
        client.away = true;
        const pid = client.playerId;
        // Away only if no other live socket speaks for the same player (a second tab, a fresh reconnect).
        if (room && pid && ![...room.clients].some((x) => x !== client && x.playerId === pid && !x.away)) room.setPresence(pid, false);
      }
      try { ws.ping?.(); } catch { /* closed */ }
    }, hb.everyMs);
    beat.unref?.();
    ws.on('close', () => { clearInterval(beat); room?.detach(client); });
    ws.on('error', () => { /* close follows */ });
  }

  private async handle(msg: ClientToServer, client: Client, getRoom: () => Room | undefined, bind: (r: Room) => void, send: (m: ServerToClient) => void) {
    if (msg.t === 'ping') return send({ t: 'pong' });
    if (msg.t === 'tv:create') {
      client.role = 'tv';
      const r = this.createRoom(msg.tone ?? 'classic');
      bind(r);
      send({ t: 'room:created', code: r.code, joinUrl: r.joinUrl });
      r.welcome();
      return;
    }
    if (msg.t === 'phone:join') {
      const r = await this.getOrRestore(msg.room);
      if (!r) throw new GameError('No room with that code. Check the code on the TV.');
      const p = r.join(msg.name, msg.playerId, msg.avatar);
      client.playerId = p.id;
      bind(r);
      r.flushYou(p.id);
      return;
    }
    const room = getRoom();
    if (!room) throw new GameError('Join a room first.');
    const isTv = client.role === 'tv';
    const pid = client.playerId;
    // The host phone may use the remote's controls too.
    const actor = isTv ? 'tv' : pid ?? '';
    const tvOrHost = () => { if (!isTv && !room.isHost(pid)) throw new GameError('Only the host can do that.'); };
    switch (msg.t) {
      case 'tv:setTone': tvOrHost(); return room.setTone(isTv ? 'tv' : pid ?? '', msg.tone);
      case 'tv:start': tvOrHost(); return room.start(actor);
      case 'tv:next': tvOrHost(); return room.next(actor);
      case 'tv:pin': tvOrHost(); return room.pin(msg.clueId);
      case 'tv:unpin': tvOrHost(); return room.unpin(msg.clueId);
      case 'tv:link': tvOrHost(); return room.link(msg.a, msg.b);
      case 'tv:proveIt': tvOrHost(); await room.proveIt(msg.theory); return;
      case 'tv:spoken': return room.spoken(msg.id);
      case 'tv:playing': return room.playing(msg.id);
      case 'phone:setTone': return room.setTone(isTv ? 'tv' : pid ?? '', msg.tone);
      case 'phone:start': return room.start(actor);
      case 'phone:setLang': if (!pid) throw new GameError('Join first.'); return room.setLang(pid, msg.lang);
      case 'phone:ask': {
        if (!pid) throw new GameError('Join first.');
        room.ask(pid, msg.suspectId, msg.text, msg.via === 'typed' ? 'typed' : 'voice').catch(() => {});
        return;
      }
      case 'phone:notes': if (!pid) throw new GameError('Join first.'); return room.setNotes(pid, msg.text);
      case 'phone:vote': if (!pid) throw new GameError('Join first.'); return room.vote(pid, msg);
      case 'phone:propose': if (!pid) throw new GameError('Join first.'); room.propose(pid, { culprit: msg.culprit, item: msg.item }); return;
      case 'phone:voteProposal': if (!pid) throw new GameError('Join first.'); return room.voteProposal(pid, msg.proposalId, !!msg.agree);
      case 'phone:emergencyVote': if (!pid) throw new GameError('Join first.'); return room.emergencyVote(pid, msg.suspectId);
      case 'phone:sabotage': if (!pid) throw new GameError('Join first.'); await room.sabotage(pid, msg.clueId); return;
      case 'phone:hunch': if (!pid) throw new GameError('Join first.'); return room.hunch(pid, msg.utteranceId, !!msg.lying);
      case 'phone:objection': if (!pid) throw new GameError('Join first.'); await room.objection(pid, msg.utteranceId); return;
      case 'phone:moreTime': if (!pid) throw new GameError('Join first.'); return room.moreTime();
      case 'phone:readClues': if (!pid) throw new GameError('Join first.'); return room.readClues(pid);
      default: throw new GameError('Unknown message.');
    }
  }
}
