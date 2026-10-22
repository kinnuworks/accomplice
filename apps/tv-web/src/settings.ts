// Viewer settings (Menu > Settings). Kept per TV in local storage; everything still works without it.
import { useSyncExternalStore } from 'react';

export interface Settings {
  reduceMotion: boolean;
  textSize: 100 | 125 | 150;
  highContrast: boolean;
  captions: 'full' | 'karaoke';
  voice: number;   // 0..100
  music: number;
  effects: number;
}

const KEY = 'accomplice.tv.settings';
const prefersReduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const q = new URLSearchParams(location.search);
let settings: Settings = {
  reduceMotion: q.get('motion') === 'reduced' || (q.get('motion') !== 'full' && prefersReduced),
  textSize: 100, highContrast: q.has('hc'), captions: 'full', voice: 100, music: 60, effects: 80,
};
try { const saved = localStorage.getItem(KEY); if (saved && !q.has('demo')) settings = { ...settings, ...JSON.parse(saved) }; } catch { /* storage blocked */ }

const subs = new Set<() => void>();
export function getSettings(): Settings { return settings; }
export function setSettings(p: Partial<Settings>): void {
  settings = { ...settings, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  applySettings();
  subs.forEach((f) => f());
}
export function useSettings(): Settings {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => settings);
}
export function applySettings(): void {
  const el = document.documentElement;
  el.classList.toggle('reduced-motion', settings.reduceMotion);
  el.classList.toggle('hc', settings.highContrast);
  el.classList.toggle('cap-karaoke', settings.captions === 'karaoke');
  el.style.setProperty('--ts', String(settings.textSize / 100));
}
