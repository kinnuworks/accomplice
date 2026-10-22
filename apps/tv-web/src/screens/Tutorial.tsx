// Practice round: everyone asks the house character one free question, so push-to-talk, captions and the
// TV answer are learned before anything counts. The host can skip with OK.
import { Avatar } from '../art/Avatar';
import { ArtImage, NightScene } from '../art/NightScene';
import { Portrait } from '../art/Portrait';
import { CaptionPanel } from '../components/Captions';
import { Hints } from '../components/Hints';
import { KindIcon } from '../components/Ornament';
import { send, useTv } from '../net/store';
import type { TvCase } from '../net/types';

export function Tutorial() {
  const room = useTv((s) => s.room)!;
  const now = useTv((s) => s.now);
  const c = room.case as TvCase | null;
  const house = room.house ?? { id: 'house' as const, name: 'Hobbs', role: 'the butler', portrait: 'portraits/butler.webp' };
  const speaking = now && !now.line.narrator ? now : null;
  const asker = room.players.find((p) => p.id === speaking?.line.askedBy);

  return (
    <main className={`screen tutorial-screen ${speaking ? 'is-speaking' : ''}`}>
      <div className="briefing-bg" aria-hidden="true">
        <NightScene />
        {c && <ArtImage src={`art/${c.scene ?? `scenes/${c.id}.webp`}`} className="scene-art" />}
      </div>
      <header className="tut-head">
        <p className="eyebrow">Practice round</p>
        <h1 className="display-title">Ask {house.name} anything</h1>
        <p className="tut-sub">Hold the talk button on your phone and ask out loud. This one is free and does not count.</p>
      </header>

      <div className="tut-house">
        <Portrait suspect={{ id: house.id, name: house.name, role: house.role, portrait: house.portrait ?? 'portraits/butler.webp' }} className="portrait-xl" />
        <div className="spot-nameplate"><b>{house.name}</b><span>{house.role}</span></div>
      </div>

      <section className="tut-side">
        {speaking?.line.question && (
          <div className="spot-question">
            {asker && <Avatar player={asker} size={64} />}
            <p><span className="spot-asker">{asker?.name ?? 'Someone'} asked</span><span className="spot-q">“{speaking.line.question}”</span></p>
          </div>
        )}
        {speaking && <CaptionPanel key={speaking.line.key} className="tut-caption" line={speaking.line} durationMs={speaking.durationMs} speaker={house.name} />}
        {!speaking && (
          <div className="tut-tip" role="note">
            <span className="tip-card" aria-hidden="true"><KindIcon kind="physical" /></span>
            <p><b>Coming up: the evidence board.</b> Use the remote to move between clue cards and press OK to pin the ones you believe. Then press Prove it.</p>
          </div>
        )}
        <div className="tut-players" aria-label="Practice questions">
          {room.players.map((p) => {
            const used = p.questionsLeft === 0;
            return (
              <div key={p.id} className={`tut-player ${used ? 'is-used' : ''}`}>
                <Avatar player={p} size={88} />
                <span className="tut-name">{p.name}</span>
                <span className="tut-state">{used ? 'Asked ✓' : 'Not yet'}</span>
              </div>
            );
          })}
        </div>
        <button className="btn btn-primary btn-xl" data-nav data-nav-autofocus onClick={() => send({ t: 'tv:next' })}>
          <span className="btn-ok" aria-hidden="true">OK</span> Start the case
        </button>
      </section>
      <Hints items={[['ok', 'Skip practice'], ['back', 'Menu']]} />
    </main>
  );
}
