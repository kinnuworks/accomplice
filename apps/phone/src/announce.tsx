import { useEffect, useState } from 'react';

// Two screen-reader live regions that live for the whole session.
// They exist from first paint (live regions added later are often ignored),
// and we clear then set the text so repeated messages are still spoken.

type Politeness = 'polite' | 'assertive';
let setters: Record<Politeness, ((t: string) => void) | null> = { polite: null, assertive: null };
const timers: Record<Politeness, number | undefined> = { polite: undefined, assertive: undefined };

export function announce(text: string, politeness: Politeness = 'polite') {
  const set = setters[politeness];
  if (!set || !text) return;
  set('');
  window.clearTimeout(timers[politeness]);
  timers[politeness] = window.setTimeout(() => set(text), 120);
}

export function LiveRegions() {
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  useEffect(() => {
    setters = { polite: setPolite, assertive: setAssertive };
    return () => {
      setters = { polite: null, assertive: null };
    };
  }, []);
  return (
    <>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </>
  );
}
