// Spatial navigation for the D-pad.
// Any element with `data-nav` is focusable. The top-most `[data-nav-scope]` (dialogs) traps focus.
// `data-nav-autofocus` marks the preferred element when a screen or dialog appears.
// `data-nav-group` remembers the last focused child so returning to a row lands where you left it.
import { useEffect, useRef } from 'react';
import { audio } from '../audio/audio';

export type Dir = 'up' | 'down' | 'left' | 'right';
export type KeyName = Dir | 'ok' | 'back' | 'playpause';

const SEL = '[data-nav]';
type KeyHandler = (k: KeyName, e: KeyboardEvent) => boolean | void;

function keyName(e: KeyboardEvent): KeyName | null {
  switch (e.key) {
    case 'ArrowUp': case 'Up': return 'up';
    case 'ArrowDown': case 'Down': return 'down';
    case 'ArrowLeft': case 'Left': return 'left';
    case 'ArrowRight': case 'Right': return 'right';
    case 'Enter': case 'Select': case ' ': return 'ok';
    case 'Escape': case 'Backspace': case 'GoBack': case 'BrowserBack': return 'back';
    case 'MediaPlayPause': case 'MediaPlay': case 'MediaPause': return 'playpause';
  }
  switch (e.keyCode) {
    case 38: return 'up'; case 40: return 'down'; case 37: return 'left'; case 39: return 'right';
    case 13: case 23: return 'ok';
    case 4: case 8: case 27: return 'back';
    case 85: case 179: return 'playpause';
  }
  return null;
}

function visible(el: HTMLElement): boolean {
  if (el.closest('[data-nav-off],[inert]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

class FocusManager {
  current: HTMLElement | null = null;
  private handlers: { h: KeyHandler; p: number; n: number }[] = [];
  private seq = 0;
  private groupMemory = new WeakMap<Element, HTMLElement>();
  private scopeMemory = new WeakMap<Element, HTMLElement>();
  private raf = 0;
  private started = false;
  onFirstKey: (() => void) | null = null;

  start(): void {
    if (this.started) return;
    this.started = true;
    window.addEventListener('keydown', this.onKey, true);
    new MutationObserver(() => this.schedule()).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-nav', 'data-nav-scope', 'data-nav-off', 'inert'] });
    document.addEventListener('mouseover', (e) => {
      const el = (e.target as HTMLElement).closest?.(SEL) as HTMLElement | null;
      if (el && el !== this.current && this.scopeRoot().contains(el)) this.focus(el, false);
    });
    this.schedule();
  }

  private schedule(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.ensure());
  }

  scopeRoot(): HTMLElement {
    const scopes = document.querySelectorAll<HTMLElement>('[data-nav-scope]');
    return scopes.length ? scopes[scopes.length - 1] : document.body;
  }

  candidates(): HTMLElement[] {
    return Array.from(this.scopeRoot().querySelectorAll<HTMLElement>(SEL)).filter(visible);
  }

  /** Keep focus on something sensible at all times. */
  ensure(): void {
    const root = this.scopeRoot();
    const cur = this.current;
    if (cur && document.contains(cur) && root.contains(cur) && visible(cur)) return;
    const remembered = this.scopeMemory.get(root);
    if (remembered && document.contains(remembered) && root.contains(remembered) && visible(remembered)) { this.focus(remembered, false); return; }
    const auto = Array.from(root.querySelectorAll<HTMLElement>('[data-nav-autofocus]')).find(visible);
    const next = auto ?? this.candidates()[0];
    if (next) this.focus(next, false);
    else if (cur) { cur.removeAttribute('data-focused'); this.current = null; }
  }

  focus(el: HTMLElement, sound = true): void {
    if (this.current === el) return;
    // remember where we were in the outgoing scope
    if (this.current && document.contains(this.current)) {
      const s = this.current.closest('[data-nav-scope]') ?? document.body;
      this.scopeMemory.set(s, this.current);
    }
    this.current?.removeAttribute('data-focused');
    el.setAttribute('data-focused', '');
    if (!el.hasAttribute('tabindex') && !(el instanceof HTMLButtonElement)) el.tabIndex = -1;
    try { el.focus({ preventScroll: true }); } catch { /* old webviews */ }
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    this.current = el;
    const g = el.closest('[data-nav-group]');
    if (g) this.groupMemory.set(g, el);
    if (sound) audio.play('nav');
    el.dispatchEvent(new CustomEvent('navfocus', { bubbles: true }));
  }

  focusById(id: string): boolean {
    const el = this.scopeRoot().querySelector<HTMLElement>(`[data-nav-id="${CSS.escape(id)}"]`);
    if (el && visible(el)) { this.focus(el, false); return true; }
    return false;
  }

  move(dir: Dir): boolean {
    this.ensure();
    const cur = this.current;
    if (!cur) return false;
    const explicit = cur.getAttribute(`data-nav-${dir}`);
    if (explicit && this.focusById(explicit)) return true;
    const f = cur.getBoundingClientRect();
    const fcx = f.left + f.width / 2, fcy = f.top + f.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of this.candidates()) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let primary: number, overlap: number, offset: number;
      if (dir === 'right' || dir === 'left') {
        if (dir === 'right' ? !(cx > fcx + 1 && r.right > f.right - 1) : !(cx < fcx - 1 && r.left < f.left + 1)) continue;
        primary = dir === 'right' ? Math.max(0, r.left - f.right) : Math.max(0, f.left - r.right);
        overlap = Math.min(r.bottom, f.bottom) - Math.max(r.top, f.top);
        offset = Math.abs(cy - fcy);
      } else {
        if (dir === 'down' ? !(cy > fcy + 1 && r.bottom > f.bottom - 1) : !(cy < fcy - 1 && r.top < f.top + 1)) continue;
        primary = dir === 'down' ? Math.max(0, r.top - f.bottom) : Math.max(0, f.top - r.bottom);
        overlap = Math.min(r.right, f.right) - Math.max(r.left, f.left);
        offset = Math.abs(cx - fcx);
      }
      // strongly prefer things in the same row/column
      const score = primary + (overlap > 0 ? offset * 0.3 : offset * 2 + 400);
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (!best) return false;
    // entering a group: return to the remembered child
    const g = best.closest('[data-nav-group]');
    if (g && !g.contains(cur)) {
      const mem = this.groupMemory.get(g);
      if (mem && document.contains(mem) && visible(mem)) best = mem;
    }
    this.focus(best);
    return true;
  }

  /** Handlers registered later win. Return true to consume the key. */
  pushHandler(h: KeyHandler, priority = 0): () => void {
    const entry = { h, p: priority, n: this.seq++ };
    this.handlers = [...this.handlers, entry].sort((a, b) => a.p - b.p || a.n - b.n);
    return () => { this.handlers = this.handlers.filter((x) => x !== entry); };
  }

  private onKey = (e: KeyboardEvent): void => {
    const k = keyName(e);
    if (!k) return;
    this.onFirstKey?.();
    // Let typing work in the rare text field (not used on TV, but harmless)
    if (k === 'back' && e.key === 'Backspace' && (e.target as HTMLElement).tagName === 'INPUT') return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat && (k === 'ok' || k === 'back')) return;
    for (let i = this.handlers.length - 1; i >= 0; i--) {
      if (this.handlers[i].h(k, e)) return;
    }
    if (k === 'ok') { this.ensure(); this.current?.click(); return; }
    if (k === 'up' || k === 'down' || k === 'left' || k === 'right') this.move(k);
  };
}

export const focus = new FocusManager();

/** Register a key handler for the lifetime of a component. */
export function useKeys(handler: KeyHandler, enabled = true, priority = 0): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    return focus.pushHandler((k, e) => ref.current(k, e), priority);
  }, [enabled, priority]);
}

/** Back button handler for a component. Higher priority wins (dialogs use 100, app default -10). */
export function useBack(handler: () => void, enabled = true, priority = 0): void {
  useKeys((k) => { if (k === 'back') { handler(); return true; } return false; }, enabled, priority);
}
