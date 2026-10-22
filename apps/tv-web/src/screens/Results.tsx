import { Avatar } from '../art/Avatar';
import { Portrait } from '../art/Portrait';
import { Hints } from '../components/Hints';
import { Flourish } from '../components/Ornament';
import { send, useTv } from '../net/store';

const TITLES = ['Sharpest eye in the house', 'A very close second', 'Solid sleuthing', 'Asked good questions', 'Enjoyed the snacks', 'Needs more tea'];

export function Results({ onTitle }: { onTitle: () => void }) {
  const room = useTv((s) => s.room)!;
  const rv = room.reveal;
  const scores = rv?.scores ?? {};
  const ranked = [...room.players].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
  const max = Math.max(1, ...ranked.map((p) => scores[p.id] ?? 0));
  const culprit = room.case?.suspects.find((s) => s.id === rv?.culprit);

  return (
    <main className="screen results-screen">
      <header className="results-head">
        <p className="eyebrow">Case closed</p>
        <h1 className="display-title huge">The detectives' ledger</h1>
        <Flourish />
      </header>

      <section className="ledger" aria-label="Scores">
        {ranked.map((p, i) => {
          const sc = scores[p.id] ?? 0;
          const isAcc = rv?.accomplice === p.id;
          return (
            <div className={`ledger-row rank-${i + 1}`} key={p.id} style={{ ['--i' as string]: i }}>
              <span className="ledger-rank" aria-label={`Rank ${i + 1}`}>{i === 0 ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" fill="currentColor" /></svg> : i + 1}</span>
              <Avatar player={p} size={84} />
              <div className="ledger-who">
                <b>{p.name}</b>
                <span>{isAcc ? 'Smooth, but caught' : TITLES[Math.min(i, TITLES.length - 1)]}</span>
              </div>
              {isAcc && <span className="tag tag-acc">Accomplice</span>}
              <div className="ledger-bar" aria-hidden="true"><i style={{ transform: `scaleX(${sc / max})` }} /></div>
              <span className="ledger-score">{sc.toLocaleString()}</span>
            </div>
          );
        })}
      </section>

      {culprit && (
        <aside className="results-culprit">
          <Portrait suspect={culprit} />
          <p><span className="eyebrow">Behind bars</span><b>{culprit.name}</b></p>
        </aside>
      )}

      <div className="results-actions">
        <button className="btn btn-primary btn-xl" data-nav data-nav-autofocus onClick={() => send({ t: 'tv:next' })}>
          <span className="btn-ok" aria-hidden="true">OK</span> Play again
        </button>
        <button className="btn btn-ghost" data-nav onClick={onTitle}>Back to the title</button>
      </div>
      <Hints items={[['arrows', 'Move'], ['ok', 'Choose']]} />
    </main>
  );
}
