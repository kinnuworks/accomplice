// The board, in words. For anyone who can't see the TV: blind players, people at
// the far end of the sofa, or someone who just stepped out to get snacks.

import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { Fact, TheoryVerdict } from '@accomplice/protocol';
import { Portrait } from '../components';
import { SabotageAction } from './Extras';
import { useGame } from '../game';
import { clueShort, shortName, type ClueX, type SuspectX } from '../types';

const VERDICT_LABEL: Record<TheoryVerdict, string> = {
  follows: 'It follows',
  possible: 'Possible',
  contradicted: 'Contradicted',
};

const VERDICT_HELP: Record<TheoryVerdict, string> = {
  follows: 'The clues prove it.',
  possible: 'Nothing rules it out yet, but nothing proves it either.',
  contradicted: 'The clues rule it out.',
};

export function BoardPanel({ onTestTheory, readOnly }: { onTestTheory?: () => void; readOnly?: boolean }) {
  const { room, proposal, you } = useGame();
  const c = room?.case;
  if (!c || !room) return null;
  const suspects = c.suspects as SuspectX[];
  const roomName = (id: string) => c.rooms.find((r) => r.id === id)?.name ?? id;
  const slotLabel = (n: number) => c.slots.find((s) => s.id === n)?.label ?? `slot ${n}`;
  const sName = (id: string) => suspects.find((s) => s.id === id)?.name ?? id;
  const itemName = (id?: string) => c.items.find((i) => i.id === id)?.name;

  const cards = (room.board.cards ?? []) as ClueX[];
  const revealed = room.board.revealed.map((id) => cards.find((x) => x.id === id)).filter(Boolean) as ClueX[];
  const pinned = new Set(room.board.pinned);
  const smudged = new Set(room.board.smudged ?? []);
  const lv = room.board.lastVerdict;

  // What the board says about where each suspect was, slot by slot.
  const sightings: Record<string, Record<number, string[]>> = {};
  const note = (s: string, slot: number, text: string) => {
    sightings[s] ??= {};
    (sightings[s][slot] ??= []).push(text);
  };
  for (const clue of revealed.filter((x) => !smudged.has(x.id))) {
    const f: Fact = clue.fact;
    if (f.k === 'at') note(f.s, f.slot, `in the ${roomName(f.room)}`);
    else if (f.k === 'notAt') note(f.s, f.slot, `not in the ${roomName(f.room)}`);
    else if (f.k === 'saw') {
      note(f.a, f.slot, `in the ${roomName(f.room)}, with ${shortName(suspects.find((s) => s.id === f.b) ?? { name: sName(f.b) })}`);
      note(f.b, f.slot, `in the ${roomName(f.room)}, with ${shortName(suspects.find((s) => s.id === f.a) ?? { name: sName(f.a) })}`);
    } else if (f.k === 'had') note(f.s, f.slot, `had the ${itemName(f.item) ?? f.item}`);
  }
  const mineOpen = proposal && proposal.by === you?.playerId && proposal.status !== 'done';

  return (
    <div className="board">
      <section aria-labelledby="crime-h" className="panel panel--quiet">
        <h2 id="crime-h">The crime</h2>
        <p>
          {c.victim.name} {c.crime.what} in the <strong>{roomName(c.crime.room)}</strong> at <strong>{slotLabel(c.crime.slot)}</strong>.
        </p>
        <p className="hint">Possible weapons: {c.items.map((i) => i.name).join(', ')}.</p>
      </section>

      <section aria-labelledby="theory-h" className="panel">
        <h2 id="theory-h">Theory on the board</h2>
        {lv ? (
          <p>
            {sName(lv.theory.culprit)}
            {lv.theory.item ? ` with the ${itemName(lv.theory.item)}` : ''}:{' '}
            <span className={`verdict-chip verdict-chip--${lv.verdict}`}>{VERDICT_LABEL[lv.verdict]}</span>. {VERDICT_HELP[lv.verdict]}
          </p>
        ) : (
          <p>No theory tested yet.</p>
        )}
        {pinned.size > 0 && (
          <p className="hint">
            Pinned: {revealed.filter((x) => pinned.has(x.id)).map(clueShort).join('; ') || `${pinned.size} clues`}.
          </p>
        )}
        {!readOnly && onTestTheory && (
          <button type="button" className="btn btn--primary btn--block" onClick={onTestTheory} disabled={!!mineOpen}>
            {mineOpen ? 'Your theory is being voted on' : 'Test a theory'}
          </button>
        )}
      </section>

      <section aria-labelledby="bclues-h">
        <h2 id="bclues-h">Clues on the board ({revealed.length})</h2>
        {revealed.length === 0 ? (
          <p className="empty">Nothing on the board yet. The first clues arrive with round 1.</p>
        ) : (
          <ul className="bclues">
            {revealed.map((x) =>
              smudged.has(x.id) ? (
                <li key={x.id}>
                  <p className="bclue bclue--smudged">
                    <span className="bclue__short">Smudged clue</span>
                    <span className="bclue__meta">Round {x.round}. The ink has run. Nobody can read it this round.</span>
                  </p>
                </li>
              ) : (
              <li key={x.id}>
                <details className="bclue">
                  <summary>
                    <span className="bclue__short">{clueShort(x)}</span>
                    <span className="bclue__meta">
                      Round {x.round}
                      {pinned.has(x.id) ? ', pinned' : ''}
                    </span>
                  </summary>
                  <p className="bclue__title">{x.title}</p>
                  <p>{x.text}</p>
                </details>
              </li>
              ),
            )}
          </ul>
        )}
      </section>

      {!readOnly && <SabotageAction />}

      <section aria-labelledby="where-h">
        <h2 id="where-h">Where everyone was</h2>
        <p className="hint">What each suspect claims, and what the board clues say.</p>
        {suspects.map((s) => {
          const rows = c.slots
            .map((slot) => ({ slot, claim: s.claimedAlibi?.[slot.id], seen: sightings[s.id]?.[slot.id] }))
            .filter((r) => r.claim || r.seen);
          return (
            <section key={s.id} className="where" aria-labelledby={`where-${s.id}`}>
              <h3 id={`where-${s.id}`} className="where__h">
                <Portrait id={s.id} name={s.name} src={s.portrait} size={32} />
                {s.name}
              </h3>
              {rows.length === 0 ? (
                <p className="hint">Nothing known yet.</p>
              ) : (
                <ul className="where__list">
                  {rows.map(({ slot, claim, seen }) => (
                    <li key={slot.id}>
                      <span className="where__time">{slot.label}:</span>{' '}
                      {claim && <>says the {roomName(claim)}. </>}
                      {seen && <>Board clue: {seen.join('; ')}.</>}
                      {slot.id === c.crime.slot && <span className="tag tag--plum">Crime time</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </section>
    </div>
  );
}

function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return ref;
}

/** Pick a suspect and an item, and ask the table to test it. */
export function TheorySheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const { room, send } = useGame();
  const ref = useModal(open);
  const [culprit, setCulprit] = useState('');
  const [item, setItem] = useState('');
  const [err, setErr] = useState(false);
  const c = room?.case;
  if (!c) return null;
  const suspects = c.suspects as SuspectX[];
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!culprit) {
      setErr(true);
      (document.querySelector('input[name="theory-culprit"]') as HTMLInputElement | null)?.focus();
      return;
    }
    send({ t: 'phone:propose', culprit, item: item || undefined });
    setCulprit('');
    setItem('');
    setErr(false);
    onClose();
  };
  return (
    <dialog ref={ref} className="sheet" aria-labelledby="theory-sheet-h" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit} className="stack" noValidate>
        <h2 id="theory-sheet-h">Test a theory</h2>
        <p className="hint">The table votes. If enough agree, the case engine checks it against the board.</p>
        <fieldset className="field" aria-describedby={err ? 'theory-err' : undefined}>
          <legend>Who did it?</legend>
          {err && (
            <p id="theory-err" className="field__error">
              Pick a suspect first.
            </p>
          )}
          <div className="choice-list">
            {suspects.map((s) => (
              <label key={s.id} className="choice choice--row">
                <input type="radio" name="theory-culprit" value={s.id} checked={culprit === s.id} onChange={() => setCulprit(s.id)} />
                <span className="choice__body">
                  <span className="choice__title">{s.name}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend>With what? (optional)</legend>
          <div className="choice-list">
            {c.items.map((i) => (
              <label key={i.id} className="choice choice--row">
                <input type="radio" name="theory-item" value={i.id} checked={item === i.id} onChange={() => setItem(i.id)} />
                <span className="choice__body">
                  <span className="choice__title">The {i.name}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="btn btn--primary btn--block btn--big">
          Put it to the table
        </button>
        <button type="button" className="btn btn--ghost btn--block" onClick={onClose}>
          Cancel
        </button>
      </form>
    </dialog>
  );
}

/** Someone else wants to test a theory. Agree, or not yet. */
export function VoteSheet() {
  const { proposal, you, room, send } = useGame();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const needsMe =
    !!proposal && proposal.status === 'open' && proposal.by !== you?.playerId && (proposal.myVote === null || proposal.myVote === undefined);
  const open = needsMe && dismissed !== proposal!.id;
  const ref = useModal(open);
  const c = room?.case;
  if (!proposal || !c) return null;
  const s = (c.suspects as SuspectX[]).find((x) => x.id === proposal.culprit);
  const it = c.items.find((x) => x.id === proposal.item);
  const vote = (agree: boolean) => {
    send({ t: 'phone:voteProposal', proposalId: proposal.id, agree });
    setDismissed(proposal.id);
  };
  return (
    <>
      <dialog ref={ref} className="sheet" aria-labelledby="vote-h" aria-describedby="vote-d" onCancel={() => setDismissed(proposal.id)}>
        <h2 id="vote-h">{proposal.byName ?? 'Someone'} has a theory</h2>
        <div className="vote-theory" id="vote-d">
          {s && <Portrait id={s.id} name={s.name} src={s.portrait} size={64} />}
          <p>
            It was <strong>{s?.name ?? 'a suspect'}</strong>
            {it ? (
              <>
                , with the <strong>{it.name}</strong>
              </>
            ) : null}
            .
          </p>
        </div>
        <p className="hint">Test it now against the board? {proposal.agree ?? 0} of {proposal.needed ?? '?'} agree so far.</p>
        <div className="stack">
          <button type="button" className="btn btn--primary btn--block btn--big" onClick={() => vote(true)}>
            Agree, test it
          </button>
          <button type="button" className="btn btn--ghost btn--block" onClick={() => vote(false)}>
            Not yet
          </button>
        </div>
      </dialog>
      {needsMe && dismissed === proposal.id && (
        <button type="button" className="btn btn--chip theory-waiting" onClick={() => setDismissed(null)}>
          {proposal.byName ?? 'Someone'}&rsquo;s theory needs your vote
        </button>
      )}
    </>
  );
}

/** Shows where a proposal stands, and the verdict when it lands. */
export function TheoryStatus() {
  const { proposal, verdict, dismissVerdict, you, room } = useGame();
  const c = room?.case;
  const name = (id: string) => (c?.suspects as SuspectX[] | undefined)?.find((s) => s.id === id);
  if (verdict) {
    const s = name(verdict.culprit);
    return (
      <section className={`verdict verdict--${verdict.verdict}`} aria-labelledby="verdict-h">
        <h2 id="verdict-h" className="verdict__h">
          Verdict: {VERDICT_LABEL[verdict.verdict]}
        </h2>
        <p className="verdict__theory">
          {s ? shortName(s) : 'That theory'}
          {verdict.item ? ` with the ${c?.items.find((i) => i.id === verdict.item)?.name}` : ''}
        </p>
        <p>{verdict.explanation}</p>
        <button type="button" className="btn btn--ghost btn--small" onClick={dismissVerdict}>
          Got it
        </button>
      </section>
    );
  }
  if (proposal && proposal.by === you?.playerId && (proposal.status === 'open' || proposal.status === 'testing')) {
    const s = name(proposal.culprit);
    return (
      <p className="theory-pending" role="status">
        <span className="dot dot--gold" aria-hidden="true" />
        {proposal.status === 'testing'
          ? `Testing your theory about ${s ? shortName(s) : 'that suspect'}...`
          : `Your theory about ${s ? shortName(s) : 'that suspect'}: ${proposal.agree ?? 1} of ${proposal.needed ?? '?'} agree.`}
      </p>
    );
  }
  return null;
}
