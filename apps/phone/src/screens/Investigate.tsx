import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { ClueCard, Icon, Portrait, ScreenHeading } from '../components';
import { useGame } from '../game';
import { RolePeek } from './Role';
import { TalkDock } from './TalkDock';

type Tab = 'ask' | 'clues' | 'notes';

export function Investigate({ demoAt }: { demoAt?: string }) {
  const { room, me, you, newClueIds } = useGame();
  const initialTab: Tab = demoAt === 'clues' ? 'clues' : demoAt === 'notes' ? 'notes' : 'ask';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [roleOpen, setRoleOpen] = useState(false);
  if (!room?.case || !you) return null;
  const left = me?.questionsLeft ?? 0;
  const clueCount = you.privateClues.length;
  const unseen = newClueIds.length;

  return (
    <div className="screen screen--investigate">
      <p className="eyebrow">Round {room.round} of 3</p>
      <ScreenHeading>Question the suspects</ScreenHeading>
      <div className="inv-meta">
        <p className={`qleft${left === 0 ? ' qleft--none' : ''}`}>
          <span className="qleft__pips" aria-hidden="true">
            {[0, 1].map((i) => (
              <span key={i} className={`pip${i < left ? ' pip--on' : ''}`} />
            ))}
          </span>
          {left === 0 ? 'No questions left' : `${left} ${left === 1 ? 'question' : 'questions'} left`}
          <span className="sr-only"> this round</span>
        </p>
        <button type="button" className="btn btn--chip" onClick={() => setRoleOpen(true)}>
          <Icon name="eye" />
          My role
        </button>
      </div>
      <SoftTimer deadline={room.deadlineAt} />

      <Tabs
        tab={tab}
        setTab={setTab}
        items={[
          { id: 'ask', label: 'Ask' },
          { id: 'clues', label: 'My clues', count: clueCount, badge: unseen > 0 ? `${unseen} new` : undefined },
          { id: 'notes', label: 'Notes' },
        ]}
      />

      <div role="tabpanel" id="panel-ask" aria-labelledby="tab-ask" hidden={tab !== 'ask'} className="tabpanel">
        <AskPanel demoAt={demoAt} />
      </div>
      <div role="tabpanel" id="panel-clues" aria-labelledby="tab-clues" hidden={tab !== 'clues'} className="tabpanel">
        {tab === 'clues' && <CluesPanel />}
      </div>
      <div role="tabpanel" id="panel-notes" aria-labelledby="tab-notes" hidden={tab !== 'notes'} className="tabpanel">
        <NotesPanel />
      </div>

      <RoleDialog open={roleOpen} onClose={() => setRoleOpen(false)} />
    </div>
  );
}

function Tabs({
  tab,
  setTab,
  items,
}: {
  tab: Tab;
  setTab(t: Tab): void;
  items: { id: Tab; label: string; count?: number; badge?: string }[];
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: React.KeyboardEvent, i: number) => {
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = items.length - 1;
    if (n < 0) return;
    e.preventDefault();
    setTab(items[n].id);
    refs.current[items[n].id]?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label="Investigation">
      {items.map((it, i) => (
        <button
          key={it.id}
          ref={(el) => {
            refs.current[it.id] = el;
          }}
          id={`tab-${it.id}`}
          role="tab"
          type="button"
          aria-selected={tab === it.id}
          aria-controls={`panel-${it.id}`}
          tabIndex={tab === it.id ? 0 : -1}
          className="tab"
          onClick={() => setTab(it.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {it.label}
          {it.count !== undefined && <span className="tab__count">{it.count}</span>}
          {it.badge && <span className="badge badge--new">{it.badge}</span>}
        </button>
      ))}
    </div>
  );
}

function AskPanel({ demoAt }: { demoAt?: string }) {
  const { room, me, you, lastReply, narration } = useGame();
  const suspects = room?.case?.suspects ?? [];
  const [picked, setPicked] = useState<string | null>(demoAt === 'investigate' ? null : demoAt ? 'finch' : null);
  const suspect = suspects.find((s) => s.id === picked) ?? null;
  const reply = lastReply ?? [...(room?.transcript ?? [])].reverse().find((u) => suspects.some((s) => s.id === u.speaker));
  const replySuspect = reply ? suspects.find((s) => s.id === reply.speaker) : null;
  const demoStart = demoAt === 'listening' ? 'listening' : demoAt === 'review' ? 'review' : demoAt === 'typed' ? 'typed' : undefined;

  return (
    <>
      {narration && (
        <p className="narration">
          <span className="narration__who">Narrator</span> {narration}
        </p>
      )}
      <fieldset className="suspects">
        <legend>Who do you want to question?</legend>
        <div className="suspect-grid">
          {suspects.map((s) => (
            <label key={s.id} className="suspect">
              <input type="radio" name="suspect" value={s.id} checked={picked === s.id} onChange={() => setPicked(s.id)} />
              <span className="suspect__card">
                <Portrait id={s.id} name={s.name} src={s.portrait} size={44} speaking={room?.speaking === s.id} />
                <span className="suspect__text">
                  <span className="suspect__name">{s.name}</span>
                  <span className="suspect__role">{s.role}</span>
                  {room?.speaking === s.id && <span className="suspect__speaking">Speaking now</span>}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {reply && replySuspect && (
        <section className="reply" aria-labelledby="reply-h">
          <h2 id="reply-h" className="reply__h">
            Latest answer
          </h2>
          <div className="reply__body">
            <Portrait id={replySuspect.id} name={replySuspect.name} src={replySuspect.portrait} size={40} />
            <div>
              <p className="reply__who">
                {replySuspect.name}
                {reply.askedBy && reply.question && (
                  <span className="reply__q">
                    {' '}
                    answering {reply.askedBy === you?.playerId ? 'you' : room?.players.find((p) => p.id === reply.askedBy)?.name ?? 'a guest'}: &ldquo;{reply.question}&rdquo;
                  </span>
                )}
              </p>
              <blockquote className="reply__text">{reply.text}</blockquote>
            </div>
          </div>
        </section>
      )}

      <TalkDock suspect={suspect} questionsLeft={me?.questionsLeft ?? 0} demoStart={demoStart} />
    </>
  );
}

function CluesPanel() {
  const { you, readClues, stopReading, reading, newClueIds, markCluesSeen } = useGame();
  const [shownNew] = useState(newClueIds);
  useEffect(() => {
    // Seeing the list counts as reading them.
    const t = window.setTimeout(markCluesSeen, 1500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const clues = you?.privateClues ?? [];
  return (
    <section aria-labelledby="clues-h">
      <div className="section-head">
        <h2 id="clues-h">My private clues</h2>
        <button type="button" className="btn btn--chip" onClick={reading ? stopReading : readClues} aria-pressed={reading}>
          <Icon name="speaker" />
          {reading ? 'Stop reading' : 'Read my clues'}
        </button>
      </div>
      <p className="hint">Only you can see these. Share them out loud, or keep them close. Your call.</p>
      {clues.length === 0 ? (
        <p className="empty">No clues yet. One arrives at the start of every round.</p>
      ) : (
        <ul className="clue-list">
          {[...clues].reverse().map((c, i) => (
            <ClueCard key={c.id} clue={c} index={i} isNew={shownNew.includes(c.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function NotesPanel() {
  const { you, send } = useGame();
  const [text, setText] = useState(you?.notes ?? '');
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timer = useRef<number | undefined>(undefined);
  const loaded = useRef(false);
  useEffect(() => {
    // Take the server copy once, for when you come back on a new page load.
    if (!loaded.current && you) {
      loaded.current = true;
      if (you.notes && !text) setText(you.notes);
    }
  }, [you, text]);
  const onChange = (v: string) => {
    setText(v);
    setSaved('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      send({ t: 'phone:notes', text: v });
      setSaved('saved');
    }, 700);
  };
  return (
    <section aria-labelledby="notes-h">
      <h2 id="notes-h">My notes</h2>
      <label htmlFor="notes" className="hint">
        Only you can see these. They save as you type.
      </label>
      <textarea id="notes" className="input input--area notes" rows={10} value={text} onChange={(e) => onChange(e.target.value)} />
      <p className="hint" aria-live="polite">
        {saved === 'saving' ? 'Saving...' : saved === 'saved' ? 'Saved.' : ''}
      </p>
    </section>
  );
}

function RoleDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet sheet--role" aria-labelledby="role-dialog-h" onClose={onClose} onCancel={onClose}>
      <h2 id="role-dialog-h">My secret role</h2>
      {open && <RolePeek compact />}
      <button type="button" className="btn btn--ghost btn--block" onClick={onClose}>
        Close
      </button>
    </dialog>
  );
}

function SoftTimer({ deadline }: { deadline?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  const mins = Math.max(0, Math.round((deadline - now) / 60000));
  return (
    <p className="hint">
      {mins > 0 ? `About ${mins} ${mins === 1 ? 'minute' : 'minutes'} left this round.` : 'Time is nearly up.'} No rush: the host can always give more time, and nothing is sent for you.
    </p>
  );
}
