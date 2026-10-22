// Demo mode: a scripted fake server. Speaks the same protocol as apps/server so screens behave identically.
import type { ClientToServer, Phase, ServerToClient, SfxName, Theory, TheoryVerdict, Utterance } from '@accomplice/protocol';
import { SCENE, STEP, STILL } from '../env';
import { DEMO as D } from './demoData';
import { receive, type Link } from './store';
import type { TvRoomState, TvUtterance, WordMark } from './types';

const CODE = 'MOTH';
const JOIN_URL = `http://192.168.1.24:8787/p?room=${CODE}`;

function marksFor(text: string): WordMark[] {
  let t = 120;
  return text.split(/\s+/).filter(Boolean).map((w) => {
    const m = { time: t, value: w };
    t += 140 + w.length * 52 + (/[.,!?]$/.test(w) ? 260 : 0);
    return m;
  });
}

function baseState(phase: Phase): TvRoomState {
  return {
    code: CODE, phase, round: 0, tone: D.case.tone, players: [], hostId: D.players[0].id, case: null,
    board: { revealed: [], pinned: [], links: [], cards: D.case.clues },
    transcript: [], speaking: null, queue: [], votes: { count: 0, needed: D.players.length },
    house: { id: 'house', name: 'Hobbs', role: 'the butler', portrait: 'portraits/butler.webp' },
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
  const announce = (text: string) => emit({ t: 'announce', text, marks: marksFor(text) });
  const sfx = (name: SfxName) => emit({ t: 'sfx', name });
  const reveal = () => {
    const acc = s.players.find((p) => p.id === D.accomplice);
    const smudgeClue = D.case.clues?.find((x) => x.id === D.cluesByRound[2][0]);
    return {
      culprit: D.culprit, accomplice: D.accomplice, item: D.item, steps: D.steps, scores: D.scores, accompliceCaught: true, accompliceLine: D.accompliceLine,
      sabotage: acc && smudgeClue ? [{ by: acc.id, byName: acc.name, clueId: smudgeClue.id, clueTitle: smudgeClue.title, round: 2, at: Date.now() }] : [],
      hunches: { byPlayer: Object.fromEntries(s.players.map((p, i) => [p.id, { right: [4, 2, 3, 1, 2, 1][i] ?? 1, total: 4 }])), right: 13, total: 20 },
    };
  };

  const say = (i: number) => {
    const l = D.lines[i];
    if (!l) return;
    const sus = D.case.suspects.find((x) => x.id === l.suspect)!;
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
    s.board.revealed = [...new Set([...s.board.revealed, ...D.cluesByRound[r]])];
    s.players.forEach((p) => (p.questionsLeft = 2));
    push();
    sfx('cardFlip');
  };

  const verdictFor = (culprit: string): { v: TheoryVerdict; why: string } => {
    const eliminated = new Set(D.steps.filter((st) => s.board.pinned.includes(st.clueId)).flatMap((st) => st.eliminates ?? []));
    if (eliminated.has(culprit)) return { v: 'contradicted', why: 'A pinned clue puts them somewhere else at the time.' };
    const others = D.case.suspects.filter((x) => x.id !== culprit && !eliminated.has(x.id));
    const keyStep = D.steps[D.steps.length - 1];
    if (culprit === D.culprit && s.board.pinned.includes(keyStep?.clueId) && others.length === 0) return { v: 'follows', why: 'Everyone else is accounted for, and the evidence ties them to it.' };
    return { v: 'possible', why: `Nothing rules it out, but ${others.length} other suspect${others.length === 1 ? '' : 's'} could still have done it.` };
  };
  const prove = (theory: Theory, delay = 2200) => {
    sfx('thinking');
    const { v, why } = verdictFor(theory.culprit);
    later(delay, () => {
      s.board.lastVerdict = { theory, verdict: v, at: Date.now() };
      push();
      emit({ t: 'verdict', theory, verdict: v, explanation: why });
    });
  };

  /** A phone proposes a theory; the others vote on their phones. */
  const propose = (byIdx: number, theory: Theory, thenVerdict = true) => {
    const by = s.players[byIdx] ?? s.players[0];
    const needed = Math.floor(s.players.length / 2) + 1;
    const others = s.players.filter((p) => p.id !== by.id);
    emit({ t: 'proposal', id: 'pr1', by: by.id, byName: by.name, culprit: theory.culprit, item: theory.item, votes: { agree: [by.id], notYet: [] }, needed, closesAt: Date.now() + 30000 });
    const voters = others.slice(0, needed - 1);
    voters.forEach((_, i) => later(1100 * (i + 1), () => {
      const agree = [by.id, ...voters.slice(0, i + 1).map((v) => v.id)];
      const notYet = i === 0 ? [others[others.length - 1].id] : [];
      emit({ t: 'proposal:votes', id: 'pr1', agree, notYet, needed });
    }));
    if (thenVerdict) later(1100 * voters.length + 800, () => prove(theory, 1800));
  };

  const toPhase = (phase: Phase) => {
    clear();
    s.phase = phase;
    s.speaking = null;
    s.queue = [];
    if (phase !== 'lobby') s.case = D.case;
    switch (phase) {
      case 'tutorial': {
        s.players.forEach((p) => (p.questionsLeft = 1));
        push();
        announce('Practice round. Everyone gets one free question for Hobbs, the butler.');
        if (!STILL) {
          s.players.forEach((p, i) => later(5000 + i * 3500, () => {
            const q = ['Hobbs, did you see anything odd tonight?', 'What is for pudding?', 'Who do you suspect?', 'Are you hiding something?', 'Can I have a biscuit?', 'Is this house haunted?'][i % 6];
            const a = ['Only the usual, madam. Lies, port and a draught under the door.', 'Treacle tart, and a great deal of tension.', 'Everyone, sir. It saves time.', 'Only my opinions, sir.', 'After the murder, perhaps.', 'Only by the in-laws.'][i % 6];
            s.players[i].questionsLeft = 0;
            push();
            emit({ t: 'utterance', u: { id: `t${i}`, speaker: 'house', speakerName: 'Hobbs', text: a, at: Date.now(), askedBy: p.id, question: q, marks: marksFor(a) } as Utterance });
          }));
          later(5000 + s.players.length * 3500 + 5000, () => toPhase('investigate'));
        }
        break;
      }
      case 'briefing':
        push();
        sfx('start');
        if (!STILL) {
          (D.case.briefing ?? []).forEach((text, i) => emit({ t: 'announce', id: `briefing:${i}`, text, marks: marksFor(text) }));
          later(12000 + (D.case.briefing ?? []).join(' ').length * 75, () => toPhase('tutorial'));
        }
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
      case 'results':
        s.reveal = reveal();
        push();
        sfx(phase === 'reveal' ? 'gavel' : 'win');
        break;
      default:
        push();
    }
  };

  const scheduleLines = () => {
    const next = () => {
      const l = D.lines[lineIdx];
      if (!l) { later(9000, () => toPhase('accuse')); return; }
      if (l.round !== s.round) {
        revealRound(l.round);
        announce(l.round === 2 ? 'Round two. Fresh clues on the board.' : 'Final round. Make every question count.');
        later(5000, next);
        return;
      }
      const est = 1800 + (D.lines[lineIdx]?.a.length ?? 60) * 60;
      say(lineIdx++);
      later(est, () => { s.queue = []; s.speaking = null; push(); emit({ t: 'hunch', utteranceId: `u${uid - 1}`, lying: 1 + (lineIdx % 3), truth: 2 }); });
      later(est + 4000, () => {
        s.speaking = null; s.queue = []; push();
        if (lineIdx === 3) { later(1500, () => propose(2, { culprit: D.culprit, item: D.item })); later(14000, next); }
        else later(2500, next);
      });
    };
    later(4000, next);
  };

  const joinPlayers = (from: number, gap: number) => {
    D.players.slice(from).forEach((p, i) => later(gap * (i + 1), () => {
      s.players = [...s.players, { ...p }];
      push();
      sfx('join');
    }));
  };

  // ---------- initial scene ----------
  const setupScene = () => {
    const players = () => D.players.map((p) => ({ ...p }));
    const board = () => {
      s.players = players();
      s.case = D.case;
      s.phase = 'investigate';
      s.round = 2;
      const r12 = [...D.cluesByRound[1], ...D.cluesByRound[2]];
      s.board.revealed = r12;
      s.board.pinned = [r12[1], r12[3], r12[0]].filter(Boolean);
      s.board.links = r12[3] ? [[r12[1], r12[3]]] : [];
      s.players.forEach((p, i) => (p.questionsLeft = [1, 0, 1, 2, 2, 1][i] ?? 2));
      push();
    };
    switch (SCENE) {
      case 'lobby':
        emit({ t: 'room:created', code: CODE, joinUrl: JOIN_URL });
        s.players = players().slice(0, 4);
        push();
        later(900, () => { s.players = players(); push(); sfx('join'); });
        break;
      case 'lobby-empty':
        emit({ t: 'room:created', code: CODE, joinUrl: JOIN_URL });
        s.players = players().slice(0, 1);
        push();
        break;
      case 'briefing':
        s.players = players();
        toPhase('briefing');
        break;
      case 'tutorial':
        s.players = players();
        toPhase('tutorial');
        s.players.forEach((p, i) => (p.questionsLeft = i < 2 ? 0 : 1));
        push();
        if (STEP === 'speaking') later(300, () => emit({ t: 'utterance', u: { id: 't0', speaker: 'house', speakerName: 'Hobbs', text: 'Only the usual, madam. Lies, port and a draught under the door.', at: Date.now(), askedBy: s.players[1].id, question: 'Hobbs, did you see anything odd tonight?', marks: marksFor('Only the usual, madam. Lies, port and a draught under the door.') } as Utterance }));
        break;
      case 'blackout': case 'emergency': case 'emergency-ask': case 'smudge': case 'hunch':
        board();
        s.audience = [{ id: 'a1', name: 'Gran', connected: true }, { id: 'a2', name: 'Sam', connected: true }, { id: 'a3', name: 'Leo', connected: true }];
        if (SCENE === 'smudge' || SCENE === 'hunch') { s.board.smudged = [D.cluesByRound[2][0]]; }
        if (SCENE === 'blackout' || SCENE.startsWith('emergency')) {
          s.round = 3;
          s.board.revealed = [...s.board.revealed, D.cluesByRound[3][0]].slice(0, 6);
          s.emergency = SCENE === 'emergency-ask'
            ? { stage: 'ask', closesAt: Date.now() + 30000, votes: { [D.culprit]: 3 }, voters: s.players.map((p) => p.id), suspectId: D.case.suspects[1].id }
            : { stage: 'vote', closesAt: Date.now() + 45000, votes: { [D.case.suspects[0].id]: 1, [D.case.suspects[1].id]: 2, [D.case.suspects[3].id]: 1 }, voters: s.players.slice(0, 4).map((p) => p.id) };
        }
        push();
        if (SCENE === 'blackout') later(150, () => emit({ t: 'event', kind: 'blackout', text: 'The lights went out. When they came back, a new clue was on the board.' }));
        if (SCENE === 'smudge') later(200, () => emit({ t: 'event', kind: 'smudge', text: 'Someone smudged a clue!', clueId: D.cluesByRound[2][0] }));
        if (SCENE === 'hunch') later(150, () => { lineIdx = 2; say(2); later(400, () => emit({ t: 'hunch', utteranceId: 'u1', lying: 3, truth: 1 })); });
        break;
      case 'all-asked': case 'long': case 'investigate': case 'speaking': case 'asking': case 'objection': case 'chime': case 'link': case 'verdict': case 'verdict-proven': case 'verdict-out': case 'prove': case 'proposal':
        board();
        if (SCENE === 'all-asked') { s.players.forEach((p) => (p.questionsLeft = 0)); push(); }
        if (SCENE === 'long') { s.board.cards = (D.case.clues ?? []).map((x) => ({ ...x, title: `${x.title} and the matter of the missing gloves`, short: x.text })) as never; push(); }
        if (SCENE === 'speaking') later(300, () => { lineIdx = 2; say(2); });
        if (SCENE === 'asking') { s.queue = [{ playerId: s.players[2].id, suspectId: D.lines[2].suspect }]; push(); }
        if (SCENE === 'objection') later(300, () => { lineIdx = 2; say(2); later(900, () => emit({ t: 'event', kind: 'objection' as never, text: 'That is not what the pinned clue says.', suspectId: D.lines[2].suspect })); });
        if (SCENE === 'chime') { s.round = 3; push(); later(200, () => emit({ t: 'event', kind: 'chime' as never, text: "Ten o'clock" })); }
        if (SCENE.startsWith('verdict')) {
          const v: TheoryVerdict = SCENE === 'verdict-proven' ? 'follows' : SCENE === 'verdict-out' ? 'contradicted' : 'possible';
          const cul = D.case.suspects.find((x) => x.id === D.culprit);
          const other = D.case.suspects.find((x) => x.id !== D.culprit)!;
          const room = D.case.rooms.find((r) => r.id === D.case.crime.room)?.name ?? 'the room';
          const why = v === 'follows' ? `Everyone else is accounted for, and the clues put ${cul?.shortName ?? cul?.name} in the ${room}.`
            : v === 'contradicted' ? `A pinned clue puts ${other.shortName ?? other.name} somewhere else at the time.`
            : `Nothing pinned rules it out, but ${other.shortName ?? other.name} is still unaccounted for.`;
          later(200, () => emit({ t: 'verdict', theory: { culprit: v === 'contradicted' ? other.id : D.culprit, item: D.item }, verdict: v, explanation: why }));
        }
        if (SCENE === 'proposal') later(200, () => {
          propose(2, { culprit: D.culprit, item: D.item }, false);
          clear();
          emit({ t: 'proposal:votes', id: 'pr1', agree: [s.players[2].id, s.players[0].id], notYet: [s.players[1].id], needed: Math.floor(s.players.length / 2) + 1 });
        });
        break;
      case 'accuse':
        s.players = players();
        s.case = D.case;
        s.phase = 'accuse';
        s.round = 3;
        s.votes = { count: 3, needed: s.players.length };
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

  return {
    send(msg: ClientToServer) {
      switch (msg.t) {
        case 'tv:create':
          clear();
          s = baseState('lobby');
          s.tone = msg.tone ?? 'classic';
          emit({ t: 'room:created', code: CODE, joinUrl: JOIN_URL });
          push();
          joinPlayers(0, 1700);
          break;
        case 'tv:setTone':
          s.tone = msg.tone;
          push();
          break;
        case 'tv:start':
          if (s.phase === 'lobby' && s.players.length >= 3) toPhase('briefing');
          break;
        case 'tv:next': {
          const order: Phase[] = ['lobby', 'briefing', 'tutorial', 'investigate', 'accuse', 'reveal', 'results'];
          if (s.phase === 'investigate' && s.round < 3) {
            clear();
            revealRound((s.round + 1) as 2 | 3);
            announce(s.round === 3 ? 'Final round. Make every question count.' : 'Round two. Fresh clues on the board.');
            lineIdx = Math.max(0, D.lines.findIndex((l) => l.round === s.round));
            if (!STILL) scheduleLines();
          } else if (s.phase === 'results') {
            s.players = s.players.map((p) => ({ ...p, questionsLeft: 2 }));
            s.board = { revealed: [], pinned: [], links: [], cards: D.case.clues };
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
          const same = ([a, b]: [string, string]) => (a === msg.a && b === msg.b) || (a === msg.b && b === msg.a);
          s.board.links = s.board.links.some(same) ? s.board.links.filter((l) => !same(l)) : [...s.board.links, [msg.a, msg.b]];
          push(); sfx('string');
          break;
        }
        case 'tv:proveIt':
          prove(msg.theory);
          break;
        default:
          break;
      }
    },
    close() { closed = true; clear(); },
  };
}
