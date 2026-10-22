import { Portrait, ScreenHeading, avatarLabel, portraitAlt } from '../components';
import { useGame } from '../game';

export function Reveal() {
  const { room, you } = useGame();
  if (!room || !you) return null;
  const c = room.case;
  const r = room.reveal;
  const final = room.phase === 'results';

  if (!r || !c) {
    return (
      <div className="screen">
        <p className="eyebrow">The reveal</p>
        <ScreenHeading>Eyes on the TV</ScreenHeading>
        <p className="lede">The truth is being read aloud. Your phone will catch up in a moment.</p>
      </div>
    );
  }

  const culprit = c.suspects.find((s) => s.id === r.culprit);
  const item = c.items.find((i) => i.id === r.item);
  const accomplice = r.accomplice ? room.players.find((p) => p.id === r.accomplice) : null;
  const iAmAcc = you.role === 'accomplice';
  const myVote = you.vote;
  const gotCulprit = myVote?.culprit === r.culprit;
  const gotItem = !!myVote?.item && myVote.item === r.item;
  // The server may tell us directly; otherwise judge from my own vote.
  const caughtFlag = (r as { accompliceCaught?: boolean }).accompliceCaught;
  const gotAccomplice = r.accomplice ? myVote?.accomplice === r.accomplice : !myVote?.accomplice;

  const ranking = Object.entries(r.scores)
    .map(([id, score]) => ({ p: room.players.find((x) => x.id === id), id, score }))
    .sort((a, b) => b.score - a.score);
  const myScore = r.scores[you.playerId] ?? 0;
  const myRank = ranking.findIndex((x) => x.id === you.playerId) + 1;

  let verdict: string;
  if (iAmAcc) {
    verdict =
      caughtFlag === true
        ? 'They caught you. Nicely played all the same.'
        : caughtFlag === false
          ? 'You got away with it. Not one of them suspected you.'
          : 'Your score tells the tale of how well you lied.';
  } else if (gotCulprit) {
    verdict = gotItem ? 'You named the culprit and the weapon. Sharp as a tack.' : 'You named the culprit. Splendid work.';
  } else {
    verdict = 'They fooled you this time. It happens to the best of us.';
  }

  return (
    <div className="screen screen--reveal">
      <p className="eyebrow">{final ? 'Case closed' : 'The reveal'}</p>
      <ScreenHeading>{final ? 'How you did' : 'The truth comes out'}</ScreenHeading>

      <section className="panel panel--paper unmask" aria-labelledby="who-h">
        <h2 id="who-h" className="sr-only">
          Who did it
        </h2>
        {culprit && <Portrait id={culprit.id} name={culprit.name} src={culprit.portrait} size={128} alt={portraitAlt(culprit)} />}
        <p className="unmask__line">
          It was <strong>{culprit?.name ?? 'the culprit'}</strong>
          {culprit ? `, ${culprit.role},` : ''} with the <strong>{item?.name ?? 'weapon'}</strong>.
        </p>
        <p className="unmask__acc">
          {accomplice ? (
            <>
              The accomplice was <strong>{accomplice.id === you.playerId ? 'you' : accomplice.name}</strong>.{' '}
              {caughtFlag === true ? 'The table caught them.' : caughtFlag === false ? 'They slipped away.' : ''}
            </>
          ) : (
            'No accomplice tonight. Everyone was honest, more or less.'
          )}
        </p>
      </section>

      <section className="panel score" aria-labelledby="score-h">
        <h2 id="score-h">Your score</h2>
        <p className="score__big">
          {myScore}
          <span className="score__unit"> {myScore === 1 ? 'point' : 'points'}</span>
        </p>
        {ranking.length > 1 && myRank > 0 && (
          <p className="score__rank">
            {myRank === 1 ? 'Top of the table.' : `Number ${myRank} of ${ranking.length}.`}
          </p>
        )}
        <p>{verdict}</p>
        {!iAmAcc && r.accomplice && <p>{gotAccomplice ? 'You also spotted the accomplice.' : 'The accomplice got past you.'}</p>}
      </section>

      {final && ranking.length > 0 && (
        <section className="panel" aria-labelledby="table-h">
          <h2 id="table-h">The table</h2>
          <ol className="ranking">
            {ranking.map(({ p, id, score }) => (
              <li key={id} className={id === you.playerId ? 'is-me' : undefined}>
                <span className="ranking__name">
                  {p && (
                    <span role="img" aria-label={avatarLabel(p.avatar)}>
                      {p.avatar}
                    </span>
                  )}{' '}
                  {p?.name ?? 'A guest'}
                  {id === you.playerId && ' (you)'}
                  {id === r.accomplice && <span className="tag tag--plum">Accomplice</span>}
                </span>
                <span className="ranking__score">
                  {score} <span className="sr-only">points</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {r.steps.length > 0 && (
        <details className="panel proof">
          <summary>How it fits together</summary>
          <ol>
            {r.steps.map((s, i) => (
              <li key={i}>
                <p className="proof__says">{s.says}</p>
                <p className="proof__therefore">So: {s.therefore}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
      <p className="hint center">{final ? 'Fancy another? The host can start a new case from the TV.' : 'Watch the TV for the full story.'}</p>
    </div>
  );
}
