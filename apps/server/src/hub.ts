// Room registry and WebSocket message routing for /ws?role=tv|phone&room=CODE&pid=<playerId>.
import type { ClientToServer, ServerToClient } from '@accomplice/protocol';
import { Room, GameError, type Client } from './room.js';
import { loadEngine, type Engine } from './engine.js';
import { log } from './log.js';

const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L or O
const BLOCK = new Set(['DAMN', 'DUMB', 'FUCK', 'SHIT', 'CUNT', 'DICK', 'COCK', 'PISS', 'TWAT', 'SEXY', 'NAZI', 'KKKK', 'ANUS', 'PUSS', 'SUCK']);

export interface SocketLike { send(data: string): void; close(): void; readyState: number; on(ev: string, fn: (...a: any[]) => void): void }

export class Hub {
  rooms = new Map<string, Room>();
  engine!: Engine;
  joinUrlFor: (code: string) => string = (code) => `/p?room=${code}`;
  private sweeper: NodeJS.Timeout | null = null;

  async init() {
    this.engine = await loadEngine();
    this.sweeper = setInterval(() => this.sweep(), 10 * 60_000);
    this.sweeper.unref?.();
    return this;
  }

  close() { if (this.sweeper) clearInterval(this.sweeper); }

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
    log.info(`room ${code} created`);
    return room;
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

    if (role === 'tv' && query.room) {
      const r = this.get(query.room);
      if (r) bind(r); else send({ t: 'error', message: 'That room has closed. Start a new one.' });
    }
    if (role === 'phone' && query.room && query.pid) {
      // Silent reconnect: the phone still sends phone:join, but it sees state immediately.
      const r = this.get(query.room);
      if (r?.player(query.pid)) { client.playerId = query.pid; bind(r); const p = r.player(query.pid)!; p.connected = true; r.changed(); }
    }

    ws.on('message', async (data: unknown) => {
      let msg: ClientToServer;
      try { msg = JSON.parse(String(data)); } catch { return send({ t: 'error', message: 'Bad message.' }); }
      try {
        await this.handle(msg, client, () => room, bind, send);
      } catch (e) {
        if (e instanceof GameError) send({ t: 'error', message: e.message });
        else { log.error('handler error', e); send({ t: 'error', message: 'Something went wrong on our side. Try that again.' }); }
      }
    });
    ws.on('close', () => { room?.detach(client); });
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
      const r = this.get(msg.room);
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
