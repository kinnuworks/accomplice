// Global caption bar: every narrator line (and any line not staged by the current screen) is shown here.
import { useTv } from '../net/store';
import { WordCaption } from './WordCaption';

export function Captions({ suppressSuspects }: { suppressSuspects: boolean }) {
  const now = useTv((s) => s.now);
  if (!now || (suppressSuspects && !now.line.narrator)) return null;
  return (
    <div className="captionbar" key={now.line.key} role="status">
      <div className="captionbar-speaker">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" /><path d="M16 8a5 5 0 0 1 0 8M18.5 5.5a8.5 8.5 0 0 1 0 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        {now.line.speakerName}
      </div>
      <WordCaption line={now.line} durationMs={now.durationMs} />
    </div>
  );
}
