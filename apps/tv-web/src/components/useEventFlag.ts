// An overlay that belongs to one kind of server event. Each overlay owns its own timer, so a later,
// different event can never cancel the hide and leave it stuck on screen.
import { useEffect, useRef, useState } from 'react';
import { useTv } from '../net/store';
import type { TvEvent } from '../net/types';

export function useEventFlag(kind: string, ms: number, onStart?: (e: TvEvent) => void): TvEvent | null {
  const event = useTv((s) => s.event);
  const [active, setActive] = useState<TvEvent | null>(null);
  const seen = useRef(0);
  const timer = useRef(0);
  const start = useRef(onStart);
  start.current = onStart;
  useEffect(() => {
    if (!event || event.kind !== kind || event.at === seen.current || Date.now() - event.at > ms) return;
    seen.current = event.at;
    setActive(event);
    start.current?.(event);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setActive(null), Math.min(ms, 20000)); // hard cap, whatever happens
  }, [event, kind, ms]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return active;
}
