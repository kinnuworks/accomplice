export function RoundPips({ round, total = 3 }: { round: number; total?: number }) {
  return (
    <div className="round-pips" aria-label={`Round ${round} of ${total}`}>
      <span className="round-label">Round <b>{round}</b> of {total}</span>
      <div className="pips" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`pip ${i + 1 < round ? 'done' : i + 1 === round ? 'now' : ''}`}>{i + 1 < round ? '✓' : i + 1}</span>
        ))}
      </div>
    </div>
  );
}
