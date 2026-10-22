import { useRef } from 'react';
import type React from 'react';

/**
 * One control, two ways to use it:
 *  - press and hold: starts on press, stops on release (held longer than holdMs)
 *  - tap: a quick tap starts it and leaves it running; the next tap stops it
 * Keyboard, switch access, VoiceOver and TalkBack activations arrive as plain
 * clicks, which simply toggle. No custom gestures needed.
 */
export function usePress(opts: {
  active: boolean;
  disabled?: boolean;
  onStart(): void;
  onStop(): void;
  holdMs?: number;
}) {
  const o = useRef(opts);
  o.current = opts;
  const downAt = useRef(0);
  const startedHere = useRef(false);
  const fromPointer = useRef(false);
  const hold = opts.holdMs ?? 350;

  const release = () => {
    if (startedHere.current && performance.now() - downAt.current >= hold) o.current.onStop();
    startedHere.current = false;
    // The click that follows a pointer release is ignored; forget that after a beat
    // in case the browser never sends it.
    window.setTimeout(() => (fromPointer.current = false), 400);
  };

  const handlers = {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      if (o.current.disabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      fromPointer.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* older Safari */
      }
      if (o.current.active) {
        startedHere.current = false;
        o.current.onStop();
      } else {
        startedHere.current = true;
        downAt.current = performance.now();
        o.current.onStart();
      }
    },
    onPointerUp: release,
    onPointerCancel: release,
    onClick(e: React.MouseEvent<HTMLElement>) {
      if (fromPointer.current) {
        fromPointer.current = false;
        return;
      }
      e.preventDefault();
      if (o.current.disabled) return;
      if (o.current.active) o.current.onStop();
      else o.current.onStart();
    },
    onContextMenu(e: React.MouseEvent) {
      e.preventDefault(); // long-press menus on Android would break the hold
    },
  };
  return handlers;
}
