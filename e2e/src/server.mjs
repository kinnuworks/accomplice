// Starts (and only ever stops) our own game server instance on a free port.
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, E2E } from './paths.mjs';

export function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '0.0.0.0');
  });
}

export async function findPort(start = 8799) {
  for (let p = start; p < start + 200; p++) {
    // also check that nothing answers on localhost (IPv6 listeners)
    if (await portFree(p)) {
      const busy = await new Promise((r) => { const c = net.connect(p, '127.0.0.1'); c.once('connect', () => { c.destroy(); r(true); }); c.once('error', () => r(false)); });
      if (!busy) return p;
    }
  }
  throw new Error('no free port');
}

export function build(log) {
  const results = {};
  for (const pkg of ['@accomplice/tv-web', '@accomplice/phone']) {
    const t0 = Date.now();
    try {
      execFileSync('pnpm', ['--filter', pkg, 'build'], { cwd: REPO, stdio: 'pipe', encoding: 'utf8', timeout: 300_000 });
      results[pkg] = { ok: true, ms: Date.now() - t0 };
    } catch (e) {
      const out = `${e.stdout ?? ''}\n${e.stderr ?? ''}`.slice(-4000);
      log(`build of ${pkg} failed (type check or bundle). Trying vite build alone so the audit can still run.`);
      let viteOk = false;
      try {
        execFileSync('pnpm', ['--filter', pkg, 'exec', 'vite', 'build'], { cwd: REPO, stdio: 'pipe', encoding: 'utf8', timeout: 300_000 });
        viteOk = true;
      } catch { /* keep the old dist */ }
      results[pkg] = { ok: false, viteOk, ms: Date.now() - t0, output: out };
    }
  }
  return results;
}

/** Spawn `tsx apps/server/src/main.ts` with our env. Returns { port, pid, url, stop, logFile }. */
export async function startServer({ real = false, outDir, env = {} }) {
  const port = await findPort(Number(process.env.E2E_PORT ?? 8799));
  const logFile = path.join(outDir, `server-${port}.log`);
  const out = fs.openSync(logFile, 'a');
  const cacheDir = path.join(E2E, '.cache');
  const childEnv = {
    ...process.env,
    PORT: String(port),
    HOST: '0.0.0.0',
    CACHE_DIR: cacheDir,
    ...(real ? {} : { MODEL_PROVIDER: 'mock' }),
    SECOND_PASS_AUDIT: 'off',
    ...env,
  };
  const tsx = path.join(REPO, 'apps/server/node_modules/.bin/tsx');
  const child = spawn(tsx, ['src/main.ts'], { cwd: path.join(REPO, 'apps/server'), env: childEnv, stdio: ['ignore', out, out], detached: false });
  const pid = child.pid;
  fs.writeFileSync(path.join(outDir, 'server.pid'), String(pid));
  const url = `http://127.0.0.1:${port}`;
  let exited = null;
  child.on('exit', (code) => { exited = code ?? -1; });
  const t0 = Date.now();
  let health = null;
  while (Date.now() - t0 < 60_000) {
    if (exited !== null) throw new Error(`server exited early with ${exited}; see ${logFile}`);
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.ok) { health = await r.json(); break; }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!health) { try { child.kill('SIGTERM'); } catch { /* */ } throw new Error(`server did not answer /api/health in 60 s; see ${logFile}`); }
  const stop = async () => {
    if (exited !== null) return;
    // Only ever signal the process we spawned.
    try { process.kill(pid, 'SIGTERM'); } catch { return; }
    const until = Date.now() + 5000;
    while (exited === null && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
    if (exited === null) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
  };
  return { port, pid, url, stop, logFile, health, startMs: Date.now() - t0 };
}
