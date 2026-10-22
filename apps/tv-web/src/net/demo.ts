// Demo mode: a scripted fake server. Speaks the same protocol as apps/server so screens behave identically.
import type { ClientToServer, Phase, ServerToClient, SfxName, TheoryVerdict, Utterance } from '@accomplice/protocol';
import { SCENE, STILL } from '../env';
import { DEMO_BRIEFING_LINES, DEMO_CASE, DEMO_CLUES_BY_ROUND, DEMO_LINES, DEMO_PLAYERS, DEMO_SCORES, DEMO_STEPS } from './demoCase';
import { receive, type Link } from './store';
import type { TvRoomState, TvUtterance, WordMark } from './types';

const CODE = 'MOTH';

function marksFor(text: string): WordMark[] {
  let t = 120;
  return text.split(/\s+/).filter(Boolean).map((w) => {
    const m = { time: t, value: w, type: 'word' };
    t += 140 + w.length * 52 + (/[.,!?]$/.test(w) ? 260 : 0);
    return m;
  });
}

function baseState(phase: Phase): TvRoomState {
  return {
    code: CODE, phase, round: 0, tone: 'classic', players: [], hostId: 'p1', case: null,
    board: { revealed: [], pinned: [], links: [], cards: DEMO_CASE.clues },
    transcript: [], speaking: null, queue: [], votes: { count: 0, needed: 5 },
  };
}

export function startDemo(useScene = true): Link {
  let s: TvRoomState = baseState('lobby');
  let timers: number[] = [];
  let lineIdx = 0;
  let uid = 1;
  let closed = false;

  const emit = (m: ServerToClient) => { if (!closed) receive(m); };
  const push = () => emit({ t: 'room:state', state: structuredClone(s) as never });
  const later = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const announce = (text: string) => emit({ t: 'announce', text });
  const sfx = (name: SfxName) => emit({ t: 'sfx', name });

  const say = (i: number) => {
    const l = DEMO_LINES[i];
    if (!l) return;
    const sus = DEMO_CASE.suspects.find((x) => x.id === l.suspect)!;
    s.queue = [{ playerId: l.asker, suspectId: l.suspect }];
    s.speaking = l.suspect;
    const u: TvUtterance = { id: `u${uid++}`, speaker: l.suspect, speakerName: sus.name, text: l.a, at: Date.now(), askedBy: l.asker, question: l.q, marks: marksFor(l.a) };
    s.transcript = [...s.transcript, u as Utterance].slice(-50);
    const p = s.players.find((x) => x.id === l.asker);
    if (p) p.questionsLeft = Math.max(0, p.questionsLeft - 1);
    push();
    emit({ t: 'utterance', u: u as Utterance });
  };

  const revealRound = (r: 1 | 2 | 3) => {
    s.round = r;
    s.board.revealed = [...new Set([...s.board.revealed, ...DEMO_CLUES_BY_ROUND[r]])];
    s.players.forEach((p) => (p.questionsLeft = 2));
    push();
    sfx('cardFlip');
  };

  const toPhase = (phase: Phase) => {
    clear();
    s.phase = phase;
    s.speaking = null;
    s.queue = [];
    if (phase !== 'lobby') s.case = DEMO_CASE;
    switch (phase) {
      case 'briefing':
        push();
        sfx('start');
        DEMO_BRIEFING_LINES.forEach((t, i) => later(1800 + i * 5200, () => announce(t)));
        if (!STILL) later(1800 + DEMO_BRIEFING_LINES.length * 5200 + 22000, () => toPhase('investigate'));
        break;
      case 'investigate':
        revealRound(1);
        announce('Round one. Two clues are on the board. Ask away.');
        lineIdx = 0;
        if (!STILL) scheduleLines();
        break;
      case 'accuse':
        s.votes = { count: 0, needed: s.players.length };
        push();
        sfx('bell');
        announce('Time to point fingers. Cast your vote on your phone.');
        if (!STILL) for (let i = 1; i <= s.players.length; i++) later(1800 * i + 1200, () => { s.votes = { ...s.votes, count: i }; push(); sfx('tick'); if (i === s.players.length) later(2600, () => toPhase('reveal')); });
        break;
      case 'reveal':
        s.reveal = { culprit: 'doctor', accomplice: 'p4', item: 'draught', steps: DEMO_STEPS, scores: DEMO_SCORES };
        push();
        sfx('gavel');
        break;
      case 'results':
        s.reveal = { culprit: 'doctor', accomplice: 'p4', item: 'draught', steps: DEMO_STEPS, scores: DEMO_SCORES };
        push();
        sfx('win');
        break;
      default:
        push();
    }
  };

  const scheduleLines = () => {
    const next = () => {
      const l = DEMO_LINES[lineIdx];
      if (!l) { later(9000, () => toPhase('accuse')); return; }
      if (l.round !== s.round) {
        revealRound(l.round);
        announce(l.round === 2 ? 'Round two. Fresh clues on the board.' : 'Final round. Make every question count.');
        later(5000, next);
        return;
      }
      say(lineIdx++);
      later(11000, () => { s.speaking = null; s.queue = []; push(); later(2500, next); });
    };
    later(4000, next);
  };

  const joinPlayers = (from: number, gap: number) => {
    DEMO_PLAYERS.slice(from).forEach((p, i) => later(gap * (i + 1), () => {
      s.players = [...s.players, { ...p }];
      push();
      sfx('join');
    }));
  };

  // ---------- initial scene ----------
  const setupScene = () => {
    const players = () => DEMO_PLAYERS.map((p) => ({ ...p }));
    switch (SCENE) {
      case 'lobby':
        emit({ t: 'room:created', code: CODE, joinUrl: `${location.origin}/p?room=${CODE}` });
        s.players = players().slice(0, 4);
        push();
        later(900, () => { s.players = players(); push(); sfx('join'); });
        break;
      case 'briefing':
        s.players = players();
        toPhase('briefing');
        break;
      case 'investigate': case 'speaking': case 'link': case 'verdict': case 'prove': {
        s.players = players();
        s.case = DEMO_CASE;
        s.phase = 'investigate';
        s.round = 2;
        s.board.revealed = ['c1', 'c2', 'c3', 'c4'];
        s.board.pinned = ['c2', 'c4', 'c1'];
        s.board.links = [['c2', 'c4']];
        s.players[0].questionsLeft = 1; s.players[1].questionsLeft = 0; s.players[2].questionsLeft = 1;
        push();
        if (SCENE === 'speaking') later(300, () => { lineIdx = 2; say(2); });
        if (SCENE === 'verdict') later(200, () => emit({ t: 'verdict', theory: { culprit: 'doctor', item: 'draught' }, verdict: 'possible', explanation: 'The vial points at the doctor, but the colonel is still unaccounted for at nine. Pin something that puts him elsewhere.' }));
        break;
      }
      case 'accuse':
        s.players = players();
        s.case = DEMO_CASE;
        s.phase = 'accuse';
        s.round = 3;
        s.votes = { count: 3, needed: 5 };
        push();
        break;
      case 'reveal': case 'results':
        s.players = players();
        toPhase(SCENE);
        break;
      default:
        break; // title: wait for tv:create
    }
  };
  if (useScene) setTimeout(setupScene, 50);

  const verdictFor = (culprit: string): { v: TheoryVerdict; why: string } => {
    const eliminated = new Set(DEMO_STEPS.filter((st) => s.board.pinned.includes(st.clueId)).flatMap((st) => st.eliminates ?? []));
    if (eliminated.has(culprit)) return { v: 'contradicted', why: 'One of your pinned clues puts them somewhere else at nine. Look again.' };
    const others = DEMO_CASE.suspects.filter((x) => x.id !== culprit && !eliminated.has(x.id));
    if (culprit === 'doctor' && s.board.pinned.includes('c4') && others.length === 0) return { v: 'follows', why: 'Every other suspect is accounted for, and the vial ties the doctor to the draught. That is a proof.' };
    return { v: 'possible', why: `Nothing pinned rules it out, but ${others.map((o) => o.name.split(' ').pop()).join(', ')} could still have done it.` };
  };

  return {
    send(msg: ClientToServer) {
      switch (msg.t) {
        case 'tv:create':
          clear();
          s = baseState('lobby');
          s.tone = msg.tone ?? 'classic';
          emit({ t: 'room:created', code: CODE, joinUrl: `${location.origin}/p?room=${CODE}` });
          push();
          joinPlayers(0, 1700);
          break;
        case 'tv:start':
          if (s.phase === 'lobby') toPhase('briefing');
          break;
        case 'tv:next': {
          const order: Phase[] = ['lobby', 'briefing', 'investigate', 'accuse', 'reveal', 'results'];
          if (s.phase === 'investigate' && s.round < 3) {
            clear();
            revealRound((s.round + 1) as 2 | 3);
            announce(s.round === 3 ? 'Final round. Make every question count.' : 'Round two. Fresh clues on the board.');
            lineIdx = DEMO_LINES.findIndex((l) => l.round === s.round);
            if (!STILL) scheduleLines();
          } else if (s.phase === 'results') {
            s.players = s.players.map((p) => ({ ...p, questionsLeft: 2 }));
            s.board = { revealed: [], pinned: [], links: [], cards: DEMO_CASE.clues };
            s.reveal = undefined;
            s.round = 0;
            toPhase('lobby');
          } else toPhase(order[Math.min(order.length - 1, order.indexOf(s.phase) + 1)]);
          break;
        }
        case 'tv:pin':
          if (!s.board.pinned.includes(msg.clueId)) s.board.pinned = [...s.board.pinned, msg.clueId];
          push(); sfx('pin');
          break;
        case 'tv:unpin':
          s.board.pinned = s.board.pinned.filter((c) => c !== msg.clueId);
          s.board.links = s.board.links.filter(([a, b]) => a !== msg.clueId && b !== msg.clueId);
          push(); sfx('pin');
          break;
        case 'tv:link': {
          const exists = s.board.links.some(([a, b]) => (a === msg.a && b === msg.b) || (a === msg.b && b === msg.a));
          s.board.links = exists ? s.board.links.filter(([a, b]) => !((a === msg.a && b === msg.b) || (a === msg.b && b === msg.a))) : [...s.board.links, [msg.a, msg.b]];
          push(); sfx('string');
          break;
        }
        case 'tv:proveIt': {
          sfx('thinking');
          const { v, why } = verdictFor(msg.theory.culprit);
          later(2200, () => {
            s.board.lastVerdict = { theory: msg.theory, verdict: v, at: Date.now() };
            push();
            emit({ t: 'verdict', theory: msg.theory, verdict: v, explanation: why });
            sfx(v === 'follows' ? 'win' : v === 'contradicted' ? 'lose' : 'bell');
          });
          break;
        }
        default:
          break;
      }
    },
    close() { closed = true; clear(); },
  };
}
