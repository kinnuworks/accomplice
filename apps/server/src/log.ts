const quiet = () => process.env.LOG_LEVEL === 'silent' || !!process.env.VITEST;
export const log = {
  info: (...a: unknown[]) => { if (!quiet()) console.log('[server]', ...a); },
  warn: (...a: unknown[]) => { if (!quiet()) console.warn('[server]', ...a); },
  error: (...a: unknown[]) => { if (process.env.LOG_LEVEL !== 'silent') console.error('[server]', ...a); },
};
