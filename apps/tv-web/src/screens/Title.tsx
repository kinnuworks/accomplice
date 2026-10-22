import { useState } from 'react';
import type { Tone } from '@accomplice/protocol';
import { ArtImage, NightScene } from '../art/NightScene';
import { Dialog } from '../components/Dialog';
import { Hints } from '../components/Hints';
import { Flourish } from '../components/Ornament';

export function Title({ onHost }: { onHost: (tone: Tone) => void }) {
  const [help, setHelp] = useState(false);
  return (
    <main className="screen title-screen">
      <NightScene />
      <ArtImage src="art/title-art.webp" className="title-art" />
      <div className="title-vignette" aria-hidden="true" />
      <div className="motes" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
      <div className="title-block">
        <p className="title-kicker">A party mystery for the living room</p>
        <h1 className="wordmark" aria-label="Accomplice">
          {'Accomplice'.split('').map((ch, i) => <span key={i} style={{ ['--i' as string]: i }}>{ch}</span>)}
        </h1>
        <Flourish className="title-flourish" />
        <p className="title-tagline">Somebody in this house is lying. One of you might be helping them.</p>
        <div className="title-actions">
          <button className="btn btn-primary btn-xl" data-nav data-nav-autofocus onClick={() => onHost('classic')}>
            <span className="btn-ok" aria-hidden="true">OK</span> Host a game
          </button>
          <button className="btn btn-ghost" data-nav onClick={() => setHelp(true)}>How to play</button>
        </div>
        <p className="title-press">Press <b>OK</b> to host a game. Grab 3 to 6 friends and their phones.</p>
      </div>
      <Hints items={[['arrows', 'Move'], ['ok', 'Choose']]} />
      {help && (
        <Dialog title="How to play" onClose={() => setHelp(false)} className="dialog-help">
          <ol className="howto">
            <li><b>Join on your phone.</b> Scan the code on the TV. Your phone is your notebook and your microphone.</li>
            <li><b>Question the suspects.</b> Hold the talk button and ask out loud. They answer on the TV, in their own voices. Some of them lie.</li>
            <li><b>Build your theory.</b> Pin clues on the board with the remote, tie them together with red string, then press Prove it.</li>
            <li><b>Watch your friends.</b> With four or more players, one of you may be the accomplice, quietly steering everyone wrong.</li>
            <li><b>Accuse.</b> Everyone votes in secret. Then the truth comes out, one clue at a time.</li>
          </ol>
          <div className="dialog-actions"><button className="btn btn-primary" data-nav data-nav-autofocus onClick={() => setHelp(false)}>Got it</button></div>
        </Dialog>
      )}
    </main>
  );
}
