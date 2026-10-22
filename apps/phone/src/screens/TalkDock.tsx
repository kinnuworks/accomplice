import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { Icon } from '../components';
import { useGame } from '../game';
import { announce } from '../announce';
import { cue, unlockAudio } from '../feedback';
import { usePress } from '../usePress';
import { VoiceCapture, VoiceError, voiceSupport, type VoiceFailure } from '../voice';

type DockState = 'idle' | 'starting' | 'listening' | 'stopping' | 'compose' | 'sent';

const PROBLEM_TEXT: Record<VoiceFailure, string> = {
  denied: 'The mic is blocked for this page. Type your question below, or allow the mic in your browser settings and try again.',
  insecure: 'Voice needs a secure link to work on this phone. Type your question instead. It works just as well.',
  unsupported: 'This browser cannot listen. Type your question instead. It works just as well.',
  nodevice: 'No microphone found. Type your question instead.',
  failed: 'The mic did not start. Try again, or type your question.',
};

export function TalkDock({
  suspect,
  questionsLeft,
  demoStart,
}: {
  suspect: { id: string; name: string } | null;
  questionsLeft: number;
  demoStart?: 'listening' | 'review' | 'typed';
}) {
  const { send, demo, room, you, lastReply } = useGame();
  const [state, setStateRaw] = useState<DockState>('idle');
  const stateRef = useRef<DockState>('idle');
  const setState = (s: DockState) => {
    stateRef.current = s;
    setStateRaw(s);
  };
  const [text, setText] = useState('');
  const [via, setVia] = useState<'voice' | 'typed'>('voice');
  const [level, setLevel] = useState(0);
  const [problem, setProblem] = useState<VoiceFailure | null>(() => {
    if (demo) return null;
    const s = voiceSupport();
    return s.ok ? null : s.reason ?? 'unsupported';
  });
  const [hint, setHint] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<{ id: string; name: string; at: number } | null>(null);
  const voice = useRef<VoiceCapture | null>(null);
  const stopAfterStart = useRef(false);
  const startedAt = useRef(0);
  const composeRef = useRef<HTMLTextAreaElement>(null);

  if (!voice.current) {
    voice.current = new VoiceCapture({ onText: (t) => setText(t), onLevel: setLevel }, { demo });
  }
  useEffect(() => () => voice.current?.dispose(), []);

  // Screenshot and demo hooks: open the dock in a given state.
  useEffect(() => {
    if (!demoStart) return;
    if (demoStart === 'listening') {
      setText('Where were you at nine o clock, and who');
      setLevel(0.6);
      setState('listening');
    } else {
      setText(demoStart === 'review' ? 'Where were you at nine o clock, and who can vouch for you?' : '');
      setVia(demoStart === 'review' ? 'voice' : 'typed');
      setState('compose');
    }
  }, [demoStart]);

  const disabledReason = !suspect
    ? 'Pick a suspect above first.'
    : questionsLeft <= 0
      ? 'No questions left this round. Compare notes while the others ask.'
      : null;

  const begin = () => {
    if (disabledReason || !suspect) return;
    unlockAudio();
    cue.talkStart();
    setHint(null);
    setText('');
    setVia('voice');
    setState('starting');
    stopAfterStart.current = false;
    startedAt.current = performance.now();
    voice.current!
      .start()
      .then(() => {
        if (stopAfterStart.current) {
          const slow = performance.now() - startedAt.current > 1200;
          void finish(slow ? 'Mic is ready. Now press and hold while you speak, or tap once to start.' : undefined);
        } else setState('listening');
      })
      .catch((err: unknown) => {
        const kind = err instanceof VoiceError ? err.kind : 'failed';
        cue.error();
        setProblem(kind);
        setVia('typed');
        setState('compose');
        announce(PROBLEM_TEXT[kind], 'assertive');
      });
  };

  const finish = async (afterHint?: string) => {
    if (stateRef.current === 'starting') {
      stopAfterStart.current = true;
      return;
    }
    if (stateRef.current !== 'listening' && !afterHint) return;
    setState('stopping');
    cue.talkStop();
    const heard = (await voice.current!.stop()).trim();
    setLevel(0);
    if (afterHint) {
      setHint(afterHint);
      announce(afterHint);
      setState('idle');
      return;
    }
    if (!heard) {
      const msg = 'I did not catch that. Hold the button and speak a little closer, or type instead.';
      setHint(msg);
      announce(msg);
      setState('idle');
      return;
    }
    setText(heard);
    setState('compose');
    announce(`I heard: ${heard}. Ask it, or edit it first.`);
  };

  const press = usePress({
    active: state === 'listening' || state === 'starting',
    disabled: !!disabledReason || state === 'stopping',
    onStart: begin,
    onStop: () => void finish(),
  });

  // Put focus into the question box when we land in compose mode.
  useEffect(() => {
    if (state === 'compose') composeRef.current?.focus({ preventScroll: true });
  }, [state]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (!q || !suspect) return;
    send({ t: 'phone:ask', suspectId: suspect.id, text: q, via });
    cue.locked();
    setSentTo({ ...suspect, at: Date.now() });
    setState('sent');
    setText('');
    announce(`Asked ${suspect.name}. The answer plays on the TV.`);
  };

  // Once my question has been answered and the room is quiet, get ready for the next one.
  const myId = you?.playerId;
  const queuePos = room ? room.queue.findIndex((q) => q.playerId === myId) : -1;
  const answered = !!sentTo && !!lastReply && lastReply.askedBy === myId && lastReply.at >= sentTo.at - 1000;
  useEffect(() => {
    if (state === 'sent' && answered && room?.speaking !== sentTo?.id) setState('idle');
  }, [state, answered, room?.speaking, sentTo?.id]);

  const firstName = suspect?.name.split(' ').slice(-1)[0] ?? '';
  const listening = state === 'listening' || state === 'starting';

  if (state === 'sent' && sentTo) {
    const speakingNow = room?.speaking === sentTo.id;
    return (
      <div className="dock" aria-label="Your question" role="region">
        <p className="dock__status">
          <span className="dot dot--gold" aria-hidden="true" />
          {speakingNow
            ? `${sentTo.name} is answering on the TV.`
            : queuePos > 0
              ? `You are number ${queuePos + 1} in line. ${sentTo.name} will get to you.`
              : `Asked ${sentTo.name}. Watch the TV for the answer.`}
        </p>
        <button type="button" className="btn btn--ghost btn--block" onClick={() => setState('idle')}>
          {questionsLeft > 0 ? 'Ask another question' : 'Back'}
        </button>
      </div>
    );
  }

  if (state === 'compose') {
    return (
      <form className="dock dock--compose" onSubmit={submit} aria-label="Your question">
        {problem && via === 'typed' && (
          <p className="dock__problem" id="mic-problem">
            {PROBLEM_TEXT[problem]}
          </p>
        )}
        <label htmlFor="question" className="dock__label">
          {via === 'voice' ? `Your question for ${suspect?.name ?? 'the suspect'}. Fix anything I misheard.` : `Type your question for ${suspect?.name ?? 'the suspect'}`}
        </label>
        <textarea
          id="question"
          ref={composeRef}
          className="input input--area"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={240}
          enterKeyHint="send"
          placeholder={via === 'typed' ? 'Where were you at half past nine?' : undefined}
        />
        <div className="row">
          <button type="submit" className="btn btn--primary grow" disabled={!text.trim() || !!disabledReason}>
            Ask {firstName}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setText('');
              setState('idle');
            }}
          >
            {via === 'voice' ? 'Start over' : 'Cancel'}
          </button>
        </div>
        {disabledReason && <p className="hint">{disabledReason}</p>}
      </form>
    );
  }

  return (
    <div className="dock" role="region" aria-label="Ask out loud">
      <div className={`transcript${listening ? ' is-live' : ''}`} aria-hidden={listening ? 'true' : undefined}>
        {listening ? (
          <p>
            <span className="transcript__label">Listening</span>
            {text || <span className="transcript__ghost">Go ahead, ask {firstName || 'away'}...</span>}
            <span className="caret" aria-hidden="true" />
          </p>
        ) : hint ? (
          <p className="transcript__hint">{hint}</p>
        ) : (
          <p className="transcript__hint">{disabledReason ?? `Ready when you are. ${firstName ? `${suspect?.name} is listening.` : ''}`}</p>
        )}
      </div>
      <div className="dock__controls">
        {problem && !listening ? (
          <button
            type="button"
            className="btn btn--primary btn--big grow"
            disabled={!!disabledReason}
            onClick={() => {
              setVia('typed');
              setText('');
              setState('compose');
            }}
          >
            <Icon name="keyboard" />
            Type your question
          </button>
        ) : (
          <>
        <button
          type="button"
          className={`talk${listening ? ' is-on' : ''}`}
          style={{ ['--level' as string]: level.toFixed(2) }}
          aria-describedby="talk-help"
          disabled={!!disabledReason || state === 'stopping'}
          {...press}
        >
          <span className="talk__rings" aria-hidden="true" />
          <span className="talk__icon">
            <Icon name={listening ? 'stop' : 'mic'} />
          </span>
          <span className="talk__label">{listening ? 'Let go or tap to finish' : suspect ? `Hold to ask ${firstName}` : 'Hold to ask'}</span>
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--icon-text"
          onClick={() => {
            setVia('typed');
            setText('');
            setState('compose');
          }}
          disabled={!!disabledReason || listening}
        >
          <Icon name="keyboard" />
          Type instead
        </button>
          </>
        )}
      </div>
      <p id="talk-help" className="sr-only">
        Press and hold while you speak, then let go. Or tap once to start and tap again to stop. You can check the words before they are sent.
      </p>
      {problem && <p className="hint">{PROBLEM_TEXT[problem]}</p>}
    </div>
  );
}
