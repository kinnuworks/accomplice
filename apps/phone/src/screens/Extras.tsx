// Practice round, blackout vote, hunches, the audience seat, and the accomplice's smudge.

import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { Portrait, ScreenHeading } from '../components';
import { useGame } from '../game';
import { announce } from '../announce';
import { cue } from '../feedback';
import { clueShort, shortName, type ClueX, type SuspectX } from '../types';
import { TalkDock } from './TalkDock';
import { BoardPanel } from './Board';

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

function LatestFrom({ speaker }: { speaker?: string }) {
  const { lastReply, room } = useGame();
  const r = lastReply ?? room?.transcript[room.transcript.length - 1];
  if (!r || (speaker && r.speaker !== speaker) || r.speaker === 'narrator') return null;
  return (
    <section className="reply" aria-labelledby="latest-h">
      <h2 id="latest-h" className="reply__h">
        Latest answer
      </h2>
      <p className="reply__who">{r.speakerName}</p>
      <blockquote className="reply__text">{r.text}</blockquote>
    </section>
  );
}

// ---------- Practice question ----------

export function Tutorial({ demoAt }: { demoAt?: string }) {
  const { room, you } = useGame();
  const house = room?.house ?? { id: 'house' as const, name: 'The butler', role: 'the butler', portrait: 'portraits/butler.webp' };
  const used = !!you?.tutorialQuestionUsed;
  const demoStart = demoAt === 'review' ? 'review' : undefined;
  return (
    <div className="screen screen--investigate">
      <p className="eyebrow">Practice round</p>
      <ScreenHeading>Practice question</ScreenHeading>
      <div className="practice">
        <Portrait id={house.id} name={house.name} src={house.portrait} size={72} alt={`Portrait of ${house.name}, ${house.role}`} />
        <p>
          Ask <strong>{house.name}</strong>, {house.role}, anything at all. This one doesn&rsquo;t count, so try the button and see how it feels.
        </p>
      </div>
      <LatestFrom speaker={house.id} />
      <TalkDock
        suspect={{ id: house.id, name: house.name, short: shortName(house) }}
        questionsLeft={used ? 0 : 1}
        demoStart={demoStart}
        doneText="Practice done. The real questions start soon."
      />
    </div>
  );
}

// ---------- Hunch: lying or truthful? ----------

export function HunchCard() {
  const { room, me, you, send, hunchResult } = useGame();
  const [voted, setVoted] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(Date.now());
  const h = room?.hunch;
  useEffect(() => {
    if (!h) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [h]);
  const eligible = (me?.questionsLeft ?? 0) === 0 || !!you?.audience;
  if (!h || !eligible) return null;
  const u = room?.transcript.find((x) => x.id === h.utteranceId);
  const mine = voted[h.utteranceId];
  const open = now < h.closesAt;
  const res = hunchResult?.utteranceId === h.utteranceId ? hunchResult : { lying: h.lying, truth: h.truth };
  if (!open && mine === undefined) return null;
  const vote = (lying: boolean) => {
    send({ t: 'phone:hunch', utteranceId: h.utteranceId, lying });
    setVoted((v) => ({ ...v, [h.utteranceId]: lying }));
  };
  return (
    <section className="hunch" aria-labelledby="hunch-h">
      <h2 id="hunch-h" className="hunch__h">
        Lying or truthful?
      </h2>
      {u && (
        <p className="hunch__quote">
          {u.speakerName}: &ldquo;{u.text}&rdquo;
        </p>
      )}
      {mine === undefined ? (
        <>
          <div className="row">
            <button type="button" className="btn btn--danger grow" onClick={() => vote(true)}>
              Lying
            </button>
            <button type="button" className="btn btn--primary grow" onClick={() => vote(false)}>
              Truthful
            </button>
          </div>
          <p className="hint">Just a hunch, for bonus points. Open for a few more seconds; skip it if you like.</p>
        </>
      ) : (
        <p role="status">
          You said {mine ? 'lying' : 'truthful'}. The table so far: {res.lying} lying, {res.truth} truthful.
        </p>
      )}
    </section>
  );
}

// ---------- Blackout: emergency vote and the free question ----------

export function EmergencyPanel() {
  const { room, you, send } = useGame();
  const [choice, setChoice] = useState('');
  const em = room?.emergency;
  const c = room?.case;
  if (!em || !c || em.stage === 'done') return null;
  const suspects = c.suspects as SuspectX[];
  const myId = you?.playerId ?? '';
  const iVoted = em.voters.includes(myId);
  if (em.stage === 'ask') {
    const s = suspects.find((x) => x.id === em.suspectId);
    const mine = em.askedBy === myId;
    return (
      <section className="emergency" aria-labelledby="em-h">
        <h2 id="em-h">{mine ? `Free question to ${s ? shortName(s) : 'the suspect'}` : 'A free question'}</h2>
        <p>
          {mine
            ? 'You were quickest. It does not use up your questions. Hold the button below and ask.'
            : `${room?.players.find((p) => p.id === em.askedBy)?.name ?? 'Someone'} gets one free question to ${s?.name ?? 'the suspect'}.`}
        </p>
      </section>
    );
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (choice) send({ t: 'phone:emergencyVote', suspectId: choice });
  };
  return (
    <section className="emergency" aria-labelledby="em-h">
      <h2 id="em-h">Blackout!</h2>
      {iVoted ? (
        <p role="status">Vote in. {em.voters.length} {em.voters.length === 1 ? 'player has' : 'players have'} voted. Fastest finger gets a free question.</p>
      ) : (
        <form onSubmit={submit} className="stack">
          <fieldset className="field">
            <legend>Who must answer one extra question?</legend>
            <div className="choice-list">
              {suspects.map((s) => (
                <label key={s.id} className="choice choice--row">
                  <input type="radio" name="emergency" value={s.id} checked={choice === s.id} onChange={() => setChoice(s.id)} />
                  <span className="choice__body">
                    <span className="choice__title">
                      {s.name}
                      {em.votes[s.id] ? <span className="choice__blurb"> ({em.votes[s.id]} so far)</span> : null}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="btn btn--danger btn--block btn--big" disabled={!choice}>
            Cast my vote
          </button>
        </form>
      )}
    </section>
  );
}

// ---------- The accomplice's smudge ----------

export function SabotageAction() {
  const { room, you, send } = useGame();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState('');
  const [confirm, setConfirm] = useState(false);
  const ref = useModal(open);
  // Detectives never see this, not even hidden.
  if (you?.role !== 'accomplice' || !you.sabotage?.available || !you.sabotage.options.length) return null;
  const cards = (room?.board.cards ?? []) as ClueX[];
  const options = you.sabotage.options.map((id) => cards.find((c) => c.id === id) ?? ({ id, title: id } as ClueX));
  const close = () => {
    setOpen(false);
    setConfirm(false);
    setPick('');
  };
  return (
    <>
      <button type="button" className="btn btn--ghost btn--small sabotage-btn" onClick={() => setOpen(true)}>
        Smudge a clue
      </button>
      <dialog ref={ref} className="sheet" aria-labelledby="sab-h" onClose={close} onCancel={close}>
        {!confirm ? (
          <>
            <h2 id="sab-h">Smudge a clue</h2>
            <p className="hint">Once per game. The ink runs and nobody can read it for the rest of the round.</p>
            <fieldset className="field">
              <legend>Which clue?</legend>
              <div className="choice-list">
                {options.map((c) => (
                  <label key={c.id} className="choice choice--row">
                    <input type="radio" name="sabotage" value={c.id} checked={pick === c.id} onChange={() => setPick(c.id)} />
                    <span className="choice__body">
                      <span className="choice__title">{clueShort(c)}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="stack">
              <button type="button" className="btn btn--danger btn--block" disabled={!pick} onClick={() => setConfirm(true)}>
                Smudge it
              </button>
              <button type="button" className="btn btn--ghost btn--block" onClick={close}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="sab-h">Are you sure?</h2>
            <p>Everyone will see a smudge appear on the board. They won&rsquo;t know it was you, unless you look guilty.</p>
            <div className="stack">
              <button
                type="button"
                className="btn btn--danger btn--block btn--big"
                onClick={() => {
                  send({ t: 'phone:sabotage', clueId: pick });
                  close();
                }}
              >
                Yes, smudge it
              </button>
              <button type="button" className="btn btn--ghost btn--block" onClick={() => setConfirm(false)}>
                Go back
              </button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}

// ---------- Audience seat ----------

export function Audience() {
  const { room } = useGame();
  const [tab, setTab] = useState<'watch' | 'board'>('watch');
  if (!room) return null;
  return (
    <div className="screen">
      <p className="eyebrow">Audience seat</p>
      <ScreenHeading>You&rsquo;re in the audience</ScreenHeading>
      <p className="lede">
        {room.phase === 'lobby'
          ? 'The table is full, so you\u2019re in the audience. You can vote on hunches and read the board. The game starts when the host is ready.'
          : 'The table is full, but the fun isn\u2019t. Follow along, read the board, and call out the liars.'}
      </p>
      <div className="seg seg--tabs" role="group" aria-label="View">
        <button type="button" className="btn btn--ghost grow" aria-pressed={tab === 'watch'} onClick={() => setTab('watch')}>
          Watch
        </button>
        <button type="button" className="btn btn--ghost grow" aria-pressed={tab === 'board'} onClick={() => setTab('board')}>
          Board
        </button>
      </div>
      {tab === 'watch' ? (
        <>
          <HunchCard />
          <LatestFrom />
          {room.phase !== 'investigate' && <p className="hint">The players are {room.phase === 'accuse' ? 'voting' : 'getting ready'}. Eyes on the TV.</p>}
        </>
      ) : (
        <BoardPanel readOnly />
      )}
    </div>
  );
}

// ---------- Objection! ----------

let objectionHinted = false;

/** Once per game: challenge an answer while it is being given, or up to 6 seconds after. */
export function ObjectionButton() {
  const { room, you, send } = useGame();
  const [now, setNow] = useState(Date.now());
  const [used, setUsed] = useState(false);
  const seen = useRef(new Map<string, number>());
  const active = room?.phase === 'investigate' && !you?.objectionUsed && !used && !you?.audience;
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [active]);
  const ids = new Set((room?.case?.suspects ?? []).map((s) => s.id));
  const last = [...(room?.transcript ?? [])].reverse().find((u) => ids.has(u.speaker) && !u.filler);
  if (last && !seen.current.has(last.id)) seen.current.set(last.id, Date.now());
  const live = !!last && active && (room?.speaking === last.speaker || now - (seen.current.get(last.id) ?? 0) < 6000);
  useEffect(() => {
    if (live && !objectionHinted) {
      objectionHinted = true;
      announce('Objection button is up. Use it once per game if you think they are lying.');
    }
  }, [live]);
  if (!live || !last) return null;
  const who = (room?.case?.suspects as SuspectX[]).find((s) => s.id === last.speaker);
  return (
    <div className="objection">
      <button
        type="button"
        className="objection__btn"
        aria-describedby="objection-hint"
        onClick={() => {
          cue.thud();
          send({ t: 'phone:objection', utteranceId: last.id });
          setUsed(true);
          announce(`Objection raised against ${who ? shortName(who) : 'that answer'}.`, 'assertive');
        }}
      >
        Objection!
      </button>
      <p id="objection-hint" className="hint center">
        Challenge {who ? shortName(who) : 'this answer'}. Once per game.
      </p>
    </div>
  );
}

// ---------- The hour ----------

export function ChimeBanner() {
  const { chime } = useGame();
  if (!chime) return null;
  return (
    <p className="chime">
      <span className="chime__bell" aria-hidden="true">
        🕰️
      </span>
      {chime}
    </p>
  );
}
