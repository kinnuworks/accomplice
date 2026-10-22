import { useEffect, useMemo, useRef, useState } from 'react';
import type { Player, TheoryVerdict } from '@accomplice/protocol';
import { Avatar } from '../art/Avatar';
import { FloorPlan, type PlanToken } from '../art/FloorPlan';
import { Portrait, suspectColor } from '../art/Portrait';
import { audio } from '../audio/audio';
import { ClueCard } from '../components/ClueCard';
import { Dialog } from '../components/Dialog';
import { Hints } from '../components/Hints';
import { RoundPips } from '../components/RoundPips';
import { VerdictStamp } from '../components/VerdictStamp';
import { WordCaption } from '../components/WordCaption';
import { SCENE } from '../env';
import { focus, useBack } from '../focus/focus';
import { clueById, send, toast, useTv, type TvState } from '../net/store';
import type { BoardClue, TvCase } from '../net/types';

// Board geometry (board-local px)
const CARD_W = 372, CARD_H = 290;
const SLOTS = [[34, 64], [424, 50], [814, 66], [44, 360], [434, 350], [824, 362], [1060, 210]];
const slotPos = (i: number) => SLOTS[i % SLOTS.length];
const pinOf = (i: number) => { const [x, y] = slotPos(i); return { x: x + CARD_W / 2, y: y + 16 }; };

const shortName = (n: string) => n.replace(/^(Dr|Mrs|Mr|Ms|Miss|Lady|Lord|Sir|Colonel|Captain|Uncle|Auntie)\.?\s+/, '');

function stringPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const sag = 30 + dist * 0.14;
  return `M${a.x} ${a.y} Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + sag} ${b.x} ${b.y}`;
}

export function Investigate() {
  const room = useTv((s) => s.room)!;
  const now = useTv((s) => s.now);
  const verdict = useTv((s) => s.verdict);
  const c = room.case as TvCase;
  const players = room.players;

  const revealed = useMemo(() => room.board.revealed.map((id) => clueById(room, id)).filter(Boolean) as BoardClue[], [room]);
  const pinned = room.board.pinned;
  const links = room.board.links;

  const [linkFrom, setLinkFrom] = useState<string | null>(SCENE === 'link' ? 'c4' : null);
  const [focusedClue, setFocusedClue] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dossier, setDossier] = useState<string | null>(null);
  const [proving, setProving] = useState(SCENE === 'prove');
  const [checking, setChecking] = useState(false);
  const [dismissedAt, setDismissedAt] = useState(0);
  const [slot, setSlot] = useState(c.crime.slot);

  // cards that arrived this round get a flip-in
  const firstSeen = useRef(new Set(room.board.revealed));
  const fresh = (id: string) => !firstSeen.current.has(id);
  useEffect(() => { const t = setTimeout(() => room.board.revealed.forEach((id) => firstSeen.current.add(id)), 1500); return () => clearTimeout(t); }, [room.board.revealed]);

  useEffect(() => { if (SCENE === 'link') setTimeout(() => focus.focusById('clue-c1'), 120); }, []);
  useEffect(() => { if (verdict) setChecking(false); }, [verdict]);

  const speakingLine = now && !now.line.narrator && c.suspects.some((s) => s.id === now.line.speaker) ? now : null;
  const speakingId = speakingLine?.line.speaker ?? room.speaking;
  const showVerdict = !!verdict && verdict.at > dismissedAt;

  useBack(() => { setLinkFrom(null); toast('String put away', '×'); }, !!linkFrom, 50);
  useBack(() => setDismissedAt(Date.now()), showVerdict, 60);

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
    if (!isPinned) { send({ t: 'tv:pin', clueId: id }); audio.play('pin'); toast(`Pinned: ${clueById(room, id)?.title ?? 'clue'}`, '•'); }
    else setMenuFor(id);
  };

  const prove = (culprit: string, item?: string) => {
    setProving(false);
    setChecking(true);
    setDismissedAt(Date.now());
    send({ t: 'tv:proveIt', theory: { culprit, item } });
    setTimeout(() => setChecking(false), 9000);
  };

  // strings
  const idx = (id: string) => revealed.findIndex((r) => r.id === id);
  const linkCount = (id: string) => links.filter(([a, b]) => a === id || b === id).length;
  const previewTo = linkFrom && focusedClue && focusedClue !== linkFrom ? focusedClue : null;

  const asking = room.queue[0];
  const askingPlayer = players.find((p) => p.id === (speakingLine?.line.askedBy ?? asking?.playerId));
  const askingSuspect = c.suspects.find((s) => s.id === (speakingLine?.line.speaker ?? asking?.suspectId));

  const tokens: PlanToken[] = c.suspects.flatMap((s) => {
    const room = (s as { claimedAlibi?: Record<number, string> }).claimedAlibi?.[slot];
    return room ? [{ roomId: room, key: s.id, label: shortName(s.name)[0], color: suspectColor(s) }] : [];
  });

  return (
    <main className={`screen investigate-screen ${speakingLine ? 'is-speaking' : ''} ${linkFrom ? 'is-linking' : ''}`}>
      <header className="inv-head">
        <div className="inv-case">
          <p className="eyebrow">{c.place.split(',')[0]}</p>
          <h1 className="inv-title">{c.title}</h1>
        </div>
        <RoundPips round={room.round} />
        <div className="inv-asking" aria-live="polite">
          {askingPlayer && askingSuspect ? (
            <><Avatar player={askingPlayer} size={64} /><p><b>{askingPlayer.name}</b> is asking <b>{askingSuspect.name.split(' ').slice(-1)[0]}</b></p></>
          ) : (
            <p className="inv-waiting"><span className="mic-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>Pick a suspect on your phone and ask away</p>
          )}
          <div className="inv-players" aria-label="Questions left">
            {players.map((p) => (
              <div className="inv-player" key={p.id} title={p.name}>
                <Avatar player={p} size={46} />
                <span className="q-dots" aria-label={`${p.name}: ${p.questionsLeft} questions left`}>{[0, 1].map((i) => <i key={i} className={i < p.questionsLeft ? 'on' : ''} />)}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <section className="board" aria-label="Evidence board" data-nav-group onFocus={(e) => setFocusedClue((e.target as HTMLElement).dataset.clue ?? null)}>
        <span className="board-label hand">Evidence</span>
        {Array.from({ length: Math.max(6, revealed.length) }, (_, i) => i >= revealed.length && i < 6 ? (
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
            linkSource={linkFrom === clue.id}
            fresh={fresh(clue.id)}
            linkedCount={linkCount(clue.id)}
            onClick={() => onCard(clue.id)}
            style={{ left: slotPos(i)[0], top: slotPos(i)[1], width: CARD_W, ['--d' as string]: `${(i % 2) * 0.25}s` }}
          />
        ))}
        <svg className="strings" viewBox="0 0 1232 668" aria-hidden="true">
          {links.map(([a, b]) => {
            const ia = idx(a), ib = idx(b);
            if (ia < 0 || ib < 0) return null;
            const d = stringPath(pinOf(ia), pinOf(ib));
            return (
              <g key={`${a}-${b}`} className="string">
                <path d={d} className="string-shadow" />
                <path d={d} className="string-line" pathLength={1} />
                <circle cx={pinOf(ia).x} cy={pinOf(ia).y} r="9" className="string-knot" />
                <circle cx={pinOf(ib).x} cy={pinOf(ib).y} r="9" className="string-knot" />
              </g>
            );
          })}
          {linkFrom && previewTo && idx(previewTo) >= 0 && (
            <path d={stringPath(pinOf(idx(linkFrom)), pinOf(idx(previewTo)))} className="string-preview" />
          )}
        </svg>
        {linkFrom && (
          <div className="link-banner" role="status">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18 C8 6 16 6 21 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
            <span>Tying string from <b>{clueById(room, linkFrom)?.title}</b>. Pick another clue and press OK.</span>
          </div>
        )}
      </section>

      <aside className="plan-panel" aria-label="Where everyone says they were">
        <h2 className="panel-title">Where they say they were</h2>
        <div className="plan-wrap">
          <FloorPlan rooms={c.rooms} crimeRoom={c.crime.room} tokens={tokens} width={560} height={380} />
        </div>
        <div className="slot-scrubber" role="radiogroup" aria-label="Time" data-nav-group>
          <div className="slot-rail" aria-hidden="true" />
          {c.slots.map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={slot === s.id}
              className={`slot-chip ${slot === s.id ? 'is-on' : ''} ${s.id === c.crime.slot ? 'is-crime' : ''}`}
              data-nav
              onClick={() => setSlot(s.id)}
              onFocus={() => setSlot(s.id)}
            >
              <span className="slot-dot" aria-hidden="true">{s.id === c.crime.slot ? '!' : ''}</span>
              <span className="slot-label">{s.label.replace(' pm', '')}</span>
            </button>
          ))}
        </div>
        <p className="plan-legend">
          {c.suspects.map((s) => (
            <span key={s.id}><i style={{ background: suspectColor(s) }}>{shortName(s.name)[0]}</i>{shortName(s.name)}</span>
          ))}
        </p>
      </aside>

      <section className="suspect-strip" aria-label="Suspects" data-nav-group>
        {c.suspects.map((s) => (
          <button
            key={s.id}
            className={`strip-card ${speakingId === s.id ? 'is-speaking' : ''}`}
            data-nav
            aria-label={`${s.name}, ${s.role}. Open their file.`}
            onClick={() => setDossier(s.id)}
          >
            <Portrait suspect={s} />
            <span className="strip-name">{s.name}</span>
            <span className="strip-role">{s.role}</span>
            {speakingId === s.id && <span className="strip-speaking"><i /><i /><i /> Speaking</span>}
          </button>
        ))}
        <button className="btn btn-prove" data-nav onClick={() => setProving(true)} aria-label={`Prove it. Test a theory using ${pinned.length} pinned clues.`}>
          <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="4" /><path d="M29 29l12 12" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /></svg>
          <span><b>Prove it</b><small>{pinned.length} clue{pinned.length === 1 ? '' : 's'} pinned</small></span>
        </button>
      </section>

      {speakingLine && askingSuspectView(speakingLine, c, players)}

      {menuFor && (
        <Dialog title={clueById(room, menuFor)?.title} onClose={() => setMenuFor(null)} className="dialog-menu">
          <p className="dialog-body">{clueById(room, menuFor)?.text}</p>
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
        <Dialog onClose={() => setDismissedAt(Date.now())} className="dialog-verdict" label={`Verdict: ${verdict.verdict}`}>
          <p className="eyebrow">Your theory</p>
          <h2 className="verdict-theory">
            {c.suspects.find((s) => s.id === verdict.theory.culprit)?.name ?? 'Someone'}
            {verdict.theory.item && <>, with {c.items.find((i) => i.id === verdict.theory.item)?.name ?? 'something'}</>}
          </h2>
          <p className="verdict-pinned">Tested against {pinned.length} pinned clue{pinned.length === 1 ? '' : 's'}</p>
          <VerdictStamp verdict={verdict.verdict as TheoryVerdict} />
          <p className="verdict-why hand">{verdict.explanation}</p>
          <div className="dialog-actions"><button className="btn btn-primary" data-nav data-nav-autofocus onClick={() => setDismissedAt(Date.now())}>Back to the board</button></div>
        </Dialog>
      )}

      <Hints items={linkFrom ? [['ok', 'Tie string here'], ['back', 'Cancel']] : [['ok', 'Pin or open'], ['play', 'Hear it again'], ['back', 'Menu']]} />
    </main>
  );
}

function askingSuspectView(now: NonNullable<TvState['now']>, c: TvCase, players: Player[]) {
  const s = c.suspects.find((x) => x.id === now.line.speaker)!;
  const asker = players.find((p) => p.id === now.line.askedBy);
  return (
    <div className="spotlight" key={now.line.key} role="region" aria-label={`${s.name} is speaking`}>
      <div className="spotlight-beam" aria-hidden="true" />
      <div className="spot-portrait">
        <Portrait suspect={s} className="portrait-xl" />
        <div className="spot-nameplate"><b>{s.name}</b><span>{s.role}</span></div>
      </div>
      <div className="spot-talk">
        {now.line.question && (
          <div className="spot-question">
            {asker && <Avatar player={asker} size={60} />}
            <p><span className="spot-asker">{asker?.name ?? 'A detective'} asked</span><span className="hand">“{now.line.question}”</span></p>
          </div>
        )}
        <div className="spot-answer">
          <span className="spot-speaker"><i /><i /><i />{s.name.split(' ').slice(-1)[0]}</span>
          <WordCaption line={now.line} durationMs={now.durationMs} className="wordcap-xl" />
        </div>
      </div>
    </div>
  );
}

function Dossier({ c, id, onClose }: { c: TvCase; id: string; onClose: () => void }) {
  const s = c.suspects.find((x) => x.id === id)!;
  const allLines = useTv((st) => st.lines);
  const lines = useMemo(() => allLines.filter((l) => l.speaker === id).slice(-2), [allLines, id]);
  const alibi = (s as { claimedAlibi?: Record<number, string> }).claimedAlibi;
  return (
    <Dialog onClose={onClose} className="dialog-dossier" label={`${s.name} file`}>
      <div className="dossier">
        <Portrait suspect={s} className="dossier-portrait" />
        <div className="dossier-body">
          <p className="eyebrow">Suspect file</p>
          <h2 className="b-name">{s.name}</h2>
          <p className="b-role">{s.role}</p>
          <p className="hand dossier-motive">Motive: {s.motive}</p>
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
            <button key={s.id} className="prove-suspect" data-nav data-nav-autofocus={i === 0 ? '' : undefined} onClick={() => setCulprit(s.id)}>
              <Portrait suspect={s} />
              <b>{s.name}</b>
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
