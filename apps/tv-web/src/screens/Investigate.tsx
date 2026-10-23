import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useEventFlag } from '../components/useEventFlag';
import type { Player, TheoryVerdict } from '@accomplice/protocol';
import { Avatar } from '../art/Avatar';
import { FloorPlan, type PlanToken } from '../art/FloorPlan';
import { Portrait, suspectColor } from '../art/Portrait';
import { audio } from '../audio/audio';
import { ClueCard, KIND_LABEL } from '../components/ClueCard';
import { Confirm, Dialog } from '../components/Dialog';
import { Hints } from '../components/Hints';
import { KindIcon } from '../components/Ornament';
import { RoundPips } from '../components/RoundPips';
import { STAMP_LAND_MS, VerdictStamp } from '../components/VerdictStamp';
import { CaptionPanel } from '../components/Captions';
import { SCENE } from '../env';
import { focus, useBack } from '../focus/focus';
import { clueById, send, toast, useTv, type TvState } from '../net/store';
import { shortName, stripName, type BoardClue, type Proposal, type TvCase } from '../net/types';
import { crimeLabel } from './Briefing';

// Board geometry: strict 3x2 grid with 24 px gutters (board-local px)
const BOARD_W = 1144, BOARD_H = 590, PAD = 24, GUT = 24;
const CARD_W = (BOARD_W - PAD * 2 - GUT * 2) / 3;
const CARD_H = (BOARD_H - PAD * 2 - GUT) / 2;
const slotPos = (i: number) => [PAD + (i % 3) * (CARD_W + GUT), PAD + Math.floor(i / 3) % 2 * (CARD_H + GUT)];
const pinOf = (i: number) => { const [x, y] = slotPos(i); return { x: x + CARD_W / 2, y: y + 14 }; };

function stringPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const sag = 24 + dist * 0.12;
  return `M${a.x} ${a.y} Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + sag} ${b.x} ${b.y}`;
}

const itemName = (c: TvCase, id?: string) => (id ? c.items.find((i) => i.id === id)?.name : undefined);
const theoryText = (c: TvCase, t: { culprit: string; item?: string }) => {
  const s = c.suspects.find((x) => x.id === t.culprit);
  const it = itemName(c, t.item);
  return `${s ? shortName(s) : 'Someone'}${it ? ` with the ${it.replace(/^the\s+/i, '')}` : ''}`;
};

export function Investigate() {
  const room = useTv((s) => s.room)!;
  const now = useTv((s) => s.now);
  const verdict = useTv((s) => s.verdict);
  const proposal = useTv((s) => s.proposal);
  const event = useTv((s) => s.event);
  const hunchMsg = useTv((s) => s.hunch);
  const c = room.case as TvCase;
  const players = room.players;

  const revealed = useMemo(() => room.board.revealed.map((id) => clueById(room, id)).filter(Boolean).slice(0, 6) as BoardClue[], [room]);
  const pinned = room.board.pinned;
  const links = room.board.links;

  const [linkFrom, setLinkFrom] = useState<string | null>(SCENE === 'link' ? revealed[1]?.id ?? null : null);
  const [focusedClue, setFocusedClue] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dossier, setDossier] = useState<string | null>(null);
  const [proving, setProving] = useState(SCENE === 'prove');
  const [checking, setChecking] = useState(false);
  const [dismissedAt, setDismissedAt] = useState(0);
  const [slot, setSlot] = useState(c.crime.slot);
  const dark = !!useEventFlag('blackout', 3400);
  const smudged = room.board.smudged ?? [];
  const objection = !!useEventFlag('objection', 2600, () => audio.play('stamp'));
  const hunch = hunchMsg && Date.now() - hunchMsg.at < 20000 ? hunchMsg : room.hunch ? { ...room.hunch, at: Date.now() } : null;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!hunchMsg && !room.emergency) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [hunchMsg, room.emergency]);

  const firstSeen = useRef(new Set(room.board.revealed));
  const fresh = (id: string) => !firstSeen.current.has(id);
  useEffect(() => { const t = setTimeout(() => room.board.revealed.forEach((id) => firstSeen.current.add(id)), 1500); return () => clearTimeout(t); }, [room.board.revealed]);

  useEffect(() => { if (SCENE === 'link' && revealed[0]) setTimeout(() => focus.focusById(`clue-${revealed[0].id}`), 120); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (verdict) setChecking(false); }, [verdict]);
  // a new round closes anything left open from the last one
  const [moveOn, setMoveOn] = useState(false);
  const firstRound = useRef(room.round);
  useEffect(() => {
    if (room.round === firstRound.current) return;
    firstRound.current = room.round;
    setDismissedAt(Date.now()); setMenuFor(null); setProving(false); setChecking(false); setLinkFrom(null); setDossier(null); setMoveOn(false);
  }, [room.round]);
  const allAsked = players.length > 0 && players.every((p) => p.questionsLeft === 0 || !p.connected);
  const nextLabel = room.round >= 3 ? 'Time to accuse' : `Move on to round ${room.round + 1}`;

  const speakingLine = now && !now.line.narrator && c.suspects.some((s) => s.id === now.line.speaker) ? now : null;
  const speakingId = speakingLine?.line.speaker ?? room.speaking;
  const showVerdict = !!verdict && verdict.at > dismissedAt;

  useBack(() => { setLinkFrom(null); toast('String put away', '×', 3000); }, !!linkFrom, 50);

  const onCard = (id: string) => {
    const isPinned = pinned.includes(id);
    if (linkFrom) {
      if (id === linkFrom) { setLinkFrom(null); return; }
      if (!isPinned) send({ t: 'tv:pin', clueId: id });
      send({ t: 'tv:link', a: linkFrom, b: id });
      audio.play('string');
      setLinkFrom(null);
      return;
    }
    if (!isPinned) { send({ t: 'tv:pin', clueId: id }); audio.play('pin'); }
    else setMenuFor(id);
  };

  const prove = (culprit: string, item?: string) => {
    setProving(false);
    setChecking(true);
    setDismissedAt(Date.now());
    send({ t: 'tv:proveIt', theory: { culprit, item } });
    setTimeout(() => setChecking(false), 9000);
  };
  const closeVerdict = (pinMore = false) => {
    setDismissedAt(Date.now());
    if (pinMore) {
      const target = revealed.find((r) => !pinned.includes(r.id)) ?? revealed[0];
      if (target) setTimeout(() => focus.focusById(`clue-${target.id}`), 60);
    }
  };

  const idx = (id: string) => revealed.findIndex((r) => r.id === id);
  const linkCount = (id: string) => links.filter(([a, b]) => a === id || b === id).length;
  const previewTo = linkFrom && focusedClue && focusedClue !== linkFrom ? focusedClue : null;

  const asking = room.queue[0];
  const spotSuspect = speakingLine?.line.speaker ?? (asking?.suspectId && c.suspects.some((x) => x.id === asking.suspectId) ? asking.suspectId : null);
  const askingPlayer = players.find((p) => p.id === (speakingLine?.line.askedBy ?? asking?.playerId));
  const askingSuspect = c.suspects.find((s) => s.id === (speakingLine?.line.speaker ?? asking?.suspectId));

  const hasAlibi = c.suspects.some((s) => s.claimedAlibi);
  const tokens: PlanToken[] = c.suspects.flatMap((s) => {
    const r = s.claimedAlibi?.[slot];
    return r ? [{ roomId: r, key: s.id, label: shortName(s).replace(/^(Dr|Mrs|Mr|Colonel|Lady)\s+/, '')[0], color: suspectColor(s) }] : [];
  });
  const detail = focusedClue ? clueById(room, focusedClue) : undefined;

  return (
    <main className={`screen investigate-screen ${room.emergency && room.emergency.stage === 'vote' ? 'has-emergency' : ''} ${showVerdict || checking ? 'is-verdict' : ''} ${spotSuspect ? 'is-speaking' : ''} ${objection ? 'is-shaking' : ''} ${linkFrom ? 'is-linking' : ''}`}>
      <header className="inv-head">
        <div className="inv-case">
          {c.title.length <= 40 && <p className="eyebrow">{c.place.split(',')[0]}</p>}
          <h1 className={`inv-title ${c.title.length > 32 ? 'is-long' : ''}`}>{c.title}</h1>
        </div>
        <RoundPips round={room.round} />
        <div className="inv-asking" aria-live="polite">
          {askingPlayer && askingSuspect ? (
            <p><b>{askingPlayer.name}</b> is asking <b>{shortName(askingSuspect)}</b></p>
          ) : (
            <p className="inv-waiting"><span className="mic-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>Ask a suspect from your phone</p>
          )}
          <div className="inv-players">
            {players.map((p) => (
              <div className={`inv-player ${askingPlayer?.id === p.id ? 'is-asking' : ''}`} key={p.id} aria-label={`${p.name}: ${p.questionsLeft} questions left`}>
                <Avatar player={p} size={40} />
                <span className={`q-left ${p.questionsLeft ? '' : 'is-out'}`}>{p.questionsLeft} left</span>
              </div>
            ))}
            {!!room.audience?.length && (
              <div className="inv-audience" aria-label={`${room.audience.length} watching`}>
                <span className="q-left">+{room.audience.length} watching</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <section
        className="board"
        aria-label="Evidence board"
        data-nav-group
        // while the spotlight sinks the board, the remote cannot land on a card nobody can see
        data-nav-off={spotSuspect ? '' : undefined}
        onFocus={(e) => setFocusedClue((e.target as HTMLElement).dataset.clue ?? null)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusedClue(null); }}
      >
        <svg className="strings" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} aria-hidden="true">
          {links.map(([a, b]) => {
            const ia = idx(a), ib = idx(b);
            if (ia < 0 || ib < 0) return null;
            const d = stringPath(pinOf(ia), pinOf(ib));
            const hot = focusedClue === a || focusedClue === b;
            return (
              <g key={`${a}-${b}`} className={`string ${hot ? 'is-hot' : ''}`}>
                <path d={d} className="string-shadow" />
                <path d={d} className="string-line" pathLength={1} />
                <circle cx={pinOf(ia).x} cy={pinOf(ia).y} r="9" className="string-knot" />
                <circle cx={pinOf(ib).x} cy={pinOf(ib).y} r="9" className="string-knot" />
              </g>
            );
          })}
        </svg>
        {Array.from({ length: 6 }, (_, i) => i >= revealed.length ? (
          <div key={`ph${i}`} className="card-placeholder" style={{ left: slotPos(i)[0], top: slotPos(i)[1], width: CARD_W, height: CARD_H }}>
            <span>More clues next round</span>
          </div>
        ) : null)}
        {revealed.map((clue, i) => (
          <ClueCard
            key={clue.id}
            clue={clue}
            nav
            autofocus={i === 0}
            pinned={pinned.includes(clue.id)}
            smudged={smudged.includes(clue.id)}
            linkSource={linkFrom === clue.id}
            fresh={fresh(clue.id)}
            linkedCount={linkCount(clue.id)}
            onClick={() => onCard(clue.id)}
            style={{ left: slotPos(i)[0], top: slotPos(i)[1], width: CARD_W, height: CARD_H, ['--d' as string]: `${(i % 3) * 0.12}s` }}
          />
        ))}
        {linkFrom && previewTo && idx(previewTo) >= 0 && (
          <svg className="strings strings-preview" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} aria-hidden="true">
            <path d={stringPath(pinOf(idx(linkFrom)), pinOf(idx(previewTo)))} className="string-preview" />
          </svg>
        )}
        <span className="board-label hand" aria-hidden="true">Evidence</span>
      </section>

      <aside className={`side-panel ${detail ? 'show-detail' : ''}`} aria-label={detail ? 'Clue detail' : 'The house'} data-nav-off={spotSuspect ? '' : undefined}>
        {detail ? (
          <ClueDetailFit key={detail.id}>
            <p className="detail-kind"><KindIcon kind={detail.kind} />{KIND_LABEL[detail.kind]} · round {detail.round}</p>
            <h2 className="detail-title">{detail.title}</h2>
            <p className={`detail-text ${detail.text.length > 260 ? 'is-xlong' : detail.text.length > 190 ? 'is-long' : ''}`}>{smudged.includes(detail.id) ? 'Someone spilled ink all over this one. It dries out next round.' : detail.text}</p>
            <p className="detail-status">
              {linkFrom ? (linkFrom === detail.id ? 'Press OK to put the string away.' : 'Press OK to tie the string here.')
                : pinned.includes(detail.id) ? `Pinned${linkCount(detail.id) ? `, tied to ${linkCount(detail.id)}` : ''}. Press OK for string or unpin.` : 'Press OK to pin it to your theory.'}
            </p>
          </ClueDetailFit>
        ) : (
          <div className="plan-view">
            <h2 className="panel-title">{hasAlibi ? 'Where they say they were' : 'The house'}</h2>
            <p className="crime-chip"><span className="crime-key" aria-hidden="true">!</span>{crimeLabel(c)}</p>
            <div className="plan-wrap">
              <FloorPlan rooms={c.rooms} crimeRoom={c.crime.room} tokens={hasAlibi ? tokens : []} width={512} height={hasAlibi ? 260 : 360} labelSize={30} />
            </div>
            {hasAlibi && (
              <>
                <div className="slot-scrubber" role="radiogroup" aria-label="Time" data-nav-group>
                  <div className="slot-rail" aria-hidden="true" />
                  {c.slots.map((s) => (
                    <button key={s.id} role="radio" aria-checked={slot === s.id} aria-label={`${s.label}${s.id === c.crime.slot ? ', time of the crime' : ''}`}
                      className={`slot-chip ${slot === s.id ? 'is-on' : ''} ${s.id === c.crime.slot ? 'is-crime' : ''}`}
                      data-nav onClick={() => setSlot(s.id)} onFocus={() => setSlot(s.id)}>
                      <span className="slot-dot" aria-hidden="true">{s.id === c.crime.slot ? '!' : ''}</span>
                      <span className="slot-label">{s.label.replace(/\s*pm$/i, '')}</span>
                    </button>
                  ))}
                </div>
                <p className="plan-legend">
                  {c.suspects.map((s) => (
                    <span key={s.id}><i style={{ background: suspectColor(s) }}>{shortName(s).replace(/^(Dr|Mrs|Mr|Colonel|Lady)\s+/, '')[0]}</i>{shortName(s).replace(/^(Dr|Mrs|Mr|Colonel|Lady)\s+/, '')}</span>
                  ))}
                </p>
              </>
            )}
            {!hasAlibi && <p className="plan-note">Ask the suspects where they were. The board remembers what you pin.</p>}
          </div>
        )}
      </aside>

      <section className="suspect-strip" aria-label="Suspects" data-nav-group>
        {c.suspects.map((s) => (
          <button key={s.id} className={`strip-card ${speakingId === s.id ? 'is-speaking' : ''}`} data-nav aria-label={`${s.name}, ${s.role}.${speakingId === s.id ? ' Speaking now.' : ''} Open their file.`} onClick={() => setDossier(s.id)}>
            <Portrait suspect={s} className="portrait-strip" />
            <span className="strip-name">{stripName(s)}</span>
            <span className="strip-role">{s.role}</span>
          </button>
        ))}
        <button className="btn btn-prove" data-nav onClick={() => setProving(true)} aria-label={`Prove it. Test a theory using ${pinned.length} pinned clues.`}>
          <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="4" /><path d="M29 29l12 12" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /></svg>
          <span><b>Prove it</b><small>{pinned.length} clue{pinned.length === 1 ? '' : 's'} pinned</small></span>
        </button>
      </section>

      {spotSuspect && <Spotlight now={speakingLine} suspectId={spotSuspect} askerId={asking?.playerId} c={c} players={players} startled={objection} />}
      {objection && <div className="objection" role="status" aria-label={event?.text || 'Objection!'}><span>Objection!</span>{event?.text && <small>{event.text}</small>}</div>}
      {hunch && (
        <div className="hunch-chip" role="status" aria-label={`Lying or truthful? ${hunch.lying} say lying, ${hunch.truth} say truthful`}>
          <span className="hunch-q">Lying or truthful?</span>
          <span className={`hunch-bar ${hunch.lying + hunch.truth ? '' : 'is-empty'}`}><i className="h-lie" style={{ flexGrow: hunch.lying || 0.001 }} /><i className="h-true" style={{ flexGrow: hunch.truth || 0.001 }} /></span>
          <span className="hunch-n"><b>✕ {hunch.lying}</b> lying · <b>✓ {hunch.truth}</b> truthful</span>
        </div>
      )}
      {room.emergency && room.emergency.stage !== 'done' && <Emergency e={room.emergency} c={c} players={players} />}
      {dark && <div className="blackout-fx" role="status" aria-label={event?.text ?? 'The lights went out'}><p>{event?.text}</p></div>}
      {proposal && !showVerdict && <ProposalCard p={proposal} c={c} players={players} />}

      {allAsked && !spotSuspect && !showVerdict ? (
        <div className="round-cta" role="status">
          <p>Everyone has asked their questions.</p>
          <button className="btn btn-primary" data-nav onClick={() => setMoveOn(true)}>{nextLabel}</button>
        </div>
      ) : !showVerdict && !checking && (
        // Always there, quietly: the table can move on before every question is used.
        <button className="move-on-quiet" data-nav onClick={() => setMoveOn(true)} aria-label={`${nextLabel}. Questions not asked yet are lost.`}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h12M12 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {nextLabel}
        </button>
      )}
      {moveOn && (
        <Confirm
          title={room.round >= 3 ? 'Time to accuse?' : `Move on to round ${room.round + 1}?`}
          body={room.round >= 3 ? 'No more questions. Everyone votes in secret on their phone.' : 'New clues go on the board. Any questions not asked yet are lost.'}
          yes={room.round >= 3 ? 'Start the vote' : 'Next round'}
          no="Not yet"
          onYes={() => { setMoveOn(false); send({ t: 'tv:next', from: { phase: room.phase, round: room.round } }); }}
          onNo={() => setMoveOn(false)}
        />
      )}
      {menuFor && (
        <Dialog title={clueById(room, menuFor)?.title} onClose={() => setMenuFor(null)} className="dialog-menu">
          <div className="dialog-actions column">
            <button className="btn btn-primary" data-nav data-nav-autofocus onClick={() => { setLinkFrom(menuFor); setMenuFor(null); audio.play('string'); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18 C8 6 16 6 21 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>Tie red string to another clue
            </button>
            <button className="btn btn-ghost" data-nav onClick={() => { send({ t: 'tv:unpin', clueId: menuFor }); setMenuFor(null); }}>Unpin this clue</button>
            <button className="btn btn-ghost" data-nav onClick={() => setMenuFor(null)}>Leave it be</button>
          </div>
        </Dialog>
      )}

      {dossier && <Dossier c={c} id={dossier} onClose={() => setDossier(null)} />}
      {proving && <ProveDialog c={c} pinnedCount={pinned.length} onCancel={() => setProving(false)} onProve={prove} />}
      {checking && !showVerdict && (
        <div className="checking" role="status"><div className="checking-glass" aria-hidden="true" /><p>Checking your theory against every clue...</p></div>
      )}
      {showVerdict && verdict && (
        <VerdictDialog c={c} verdict={verdict} pinnedCount={pinned.length} players={players} onClose={closeVerdict} />
      )}

      <Hints items={linkFrom ? [['ok', 'Tie string here'], ['back', 'Cancel']] : [['ok', 'Pin or open'], ['play', 'Hear it again'], ['back', 'Menu']]} />
    </main>
  );
}

function Emergency({ e, c, players }: { e: NonNullable<import('../net/types').TvRoomState['emergency']>; c: TvCase; players: Player[] }) {
  const secs = Math.max(0, Math.ceil((e.closesAt - Date.now()) / 1000));
  const total = Object.values(e.votes).reduce((a, b) => a + b, 0);
  if (e.stage === 'ask') {
    const s = c.suspects.find((x) => x.id === e.suspectId);
    return (
      <div className="emergency-ask" role="status">
        {s && <Portrait suspect={s} className="em-ask-portrait" />}
        <p><span className="eyebrow">Free question</span><b>{s ? shortName(s) : 'The chosen one'}</b> must answer. First to hold-to-ask wins it.</p>
      </div>
    );
  }
  return (
    <section className="emergency" role="status" aria-live="polite">
      <p className="eyebrow">Emergency meeting</p>
      <h2 className="em-title">Who must answer one extra question?</h2>
      <div className="em-grid">
        {c.suspects.map((s) => {
          const n = e.votes[s.id] ?? 0;
          return (
            <figure key={s.id} className={`em-card ${n && n === Math.max(...Object.values(e.votes)) ? 'is-leading' : ''}`}>
              <Portrait suspect={s} />
              <figcaption><b>{stripName(s)}</b><span className="em-count">{n} vote{n === 1 ? '' : 's'}</span></figcaption>
              <span className="em-bar" aria-hidden="true"><i style={{ transform: `scaleX(${total ? n / total : 0})` }} /></span>
            </figure>
          );
        })}
      </div>
      <p className="em-foot">{e.voters.length} of {players.length} voted · {secs}s left · vote on your phone</p>
    </section>
  );
}

function VerdictDialog({ c, verdict, pinnedCount, players, onClose }: { c: TvCase; verdict: NonNullable<TvState['verdict']>; pinnedCount: number; players: Player[]; onClose: (pinMore?: boolean) => void }) {
  const [landed, setLanded] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLanded(true), STAMP_LAND_MS); return () => clearTimeout(t); }, [verdict.at]);
  const proposer = verdict.by ? players.find((p) => p.id === verdict.by) : undefined;
  return (
    <Dialog onClose={() => onClose()} className={`dialog-verdict ${landed ? 'is-landed' : ''}`} label={`Verdict: ${verdict.verdict}`}>
      <p className="eyebrow">{proposer ? `${proposer.name}'s theory` : 'Your theory'} · tested against {pinnedCount} pinned clue{pinnedCount === 1 ? '' : 's'}</p>
      <h2 className="verdict-theory">{theoryText(c, verdict.theory)}</h2>
      <VerdictStamp verdict={verdict.verdict as TheoryVerdict} />
      <p className="verdict-why">{verdict.explanation}</p>
      <div className="dialog-actions">
        <button className="btn btn-primary" data-nav data-nav-autofocus onClick={() => onClose()}>Back to the board</button>
        <button className="btn btn-ghost" data-nav onClick={() => onClose(true)}>Pin another clue</button>
      </div>
    </Dialog>
  );
}

function ProposalCard({ p, c, players }: { p: Proposal; c: TvCase; players: Player[] }) {
  const by = players.find((x) => x.id === p.by);
  const sus = c.suspects.find((s) => s.id === p.theory.culprit);
  const others = players.filter((x) => x.id !== p.by);
  return (
    <section className="proposal" role="status" aria-live="polite" key={p.id}>
      <div className="proposal-head">
        {by && <Avatar player={by} size={84} />}
        <div>
          <p className="eyebrow">A theory from the table</p>
          <h2 className="proposal-title"><b>{p.byName || by?.name}</b> wants to test: {theoryText(c, p.theory)}</h2>
        </div>
        {sus && <Portrait suspect={sus} className="proposal-portrait" />}
      </div>
      <div className="proposal-votes">
        {[by, ...others].filter(Boolean).map((x) => {
          const agreed = p.agree.includes(x!.id);
          const waiting = p.notYet.includes(x!.id);
          return (
            <div key={x!.id} className={`pv ${agreed ? 'is-agree' : waiting ? 'is-notyet' : ''}`}>
              <Avatar player={x!} size={72} />
              <span>{agreed ? 'Agrees' : waiting ? 'Not yet' : '...'}</span>
            </div>
          );
        })}
      </div>
      <p className="proposal-count">
        {p.status === 'testing' ? 'Enough votes. Testing it now...' : <><b>{p.agree.length}</b> of {p.needed} agree. Vote on your phone.</>}
      </p>
    </section>
  );
}

/** Interrogation spotlight: the stage dims, a cone of light falls on the suspect, the asker sits opposite. */
function Spotlight({ now, suspectId, askerId, c, players, startled }: { now: TvState['now']; suspectId: string; askerId?: string; c: TvCase; players: Player[]; startled: boolean }) {
  const s = c.suspects.find((x) => x.id === suspectId);
  if (!s) return null;
  const asker = players.find((p) => p.id === (now?.line.askedBy ?? askerId));
  const talking = !!now && now.line.speaker === s.id;
  return (
    <div className={`spotlight ${talking ? 'is-talking' : 'is-listening'} ${startled ? 'is-startled' : ''}`} role="region" aria-label={talking ? `${s.name} is speaking` : `${s.name} is being questioned`}>
      <div className="spotlight-cone" aria-hidden="true" />
      <div className="spot-portrait">
        <Portrait suspect={s} className="portrait-xl" />
        <div className="spot-nameplate"><b>{s.name}</b><span>{s.role}</span></div>
      </div>
      <div className="spot-talk">
        <div className="spot-question">
          {asker && <Avatar player={asker} size={64} />}
          <p>
            <span className="spot-asker">{asker?.name ?? 'A detective'} {now?.line.question ? 'asked' : 'is asking'}</span>
            <span className="spot-q">{now?.line.question ? `“${now.line.question}”` : <span className="listening-dots" aria-label="listening"><i /><i /><i /></span>}</span>
          </p>
        </div>
        {talking && now && <CaptionPanel key={now.line.key} className="spot-answer" line={now.line} durationMs={now.durationMs} speaker={shortName(s)} />}
      </div>
    </div>
  );
}

function Dossier({ c, id, onClose }: { c: TvCase; id: string; onClose: () => void }) {
  const s = c.suspects.find((x) => x.id === id)!;
  const allLines = useTv((st) => st.lines);
  const lines = useMemo(() => allLines.filter((l) => l.speaker === id).slice(-2), [allLines, id]);
  const alibi = s.claimedAlibi;
  return (
    <Dialog onClose={onClose} className="dialog-dossier" label={`${s.name} file`}>
      <div className="dossier">
        <Portrait suspect={s} className="dossier-portrait" />
        <div className="dossier-body">
          <p className="eyebrow">Suspect file</p>
          <h2 className="b-name">{s.name}</h2>
          <p className="b-role">{s.role}</p>
          <p className="dossier-motive"><b>Motive.</b> {s.motive}</p>
          {alibi && (
            <ul className="dossier-alibi">
              {c.slots.map((sl) => <li key={sl.id} className={sl.id === c.crime.slot ? 'is-crime' : ''}><span>{sl.label}</span><b>{c.rooms.find((r) => r.id === alibi[sl.id])?.name ?? 'Will not say'}</b></li>)}
            </ul>
          )}
          {lines.length > 0 && <div className="dossier-quotes">{lines.map((l) => <blockquote key={l.key}>“{l.text}”</blockquote>)}</div>}
        </div>
      </div>
      <div className="dialog-actions"><button className="btn btn-primary" data-nav data-nav-autofocus onClick={onClose}>Close the file</button></div>
    </Dialog>
  );
}

function ProveDialog({ c, pinnedCount, onCancel, onProve }: { c: TvCase; pinnedCount: number; onCancel: () => void; onProve: (culprit: string, item?: string) => void }) {
  const [culprit, setCulprit] = useState<string | null>(null);
  return (
    <Dialog title={culprit ? 'With what?' : 'Who did it?'} onClose={() => (culprit ? setCulprit(null) : onCancel())} className="dialog-prove">
      <p className="dialog-body">
        {pinnedCount ? `We will test your theory against the ${pinnedCount} clue${pinnedCount === 1 ? '' : 's'} you pinned.` : 'You have not pinned any clues yet, so this will be a bold guess.'}
      </p>
      {!culprit ? (
        <div className="prove-grid" key="who">
          {c.suspects.map((s, i) => (
            <button key={s.id} className="prove-suspect" data-nav data-nav-autofocus={i === 0 ? '' : undefined} onClick={() => setCulprit(s.id)} aria-label={s.name}>
              <Portrait suspect={s} />
              <b>{shortName(s)}</b>
            </button>
          ))}
        </div>
      ) : (
        <div className="prove-items" key="what">
          {c.items.map((it, i) => (
            <button key={it.id} className="btn btn-item" data-nav data-nav-autofocus={i === 0 ? '' : undefined} onClick={() => onProve(culprit, it.id)}>{it.name}</button>
          ))}
          <button className="btn btn-ghost" data-nav onClick={() => onProve(culprit)}>Not sure yet</button>
        </div>
      )}
    </Dialog>
  );
}

/** The clue detail never truncates and never drops below 28 px: long clues tighten the title and spacing until they fit. */
function ClueDetailFit({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [lvl, setLvl] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && lvl < 3 && el.scrollHeight > el.clientHeight + 1) setLvl(lvl + 1);
  });
  return <div className={`clue-detail${lvl ? ` fit-${lvl}` : ''}`} ref={ref}>{children}</div>;
}
