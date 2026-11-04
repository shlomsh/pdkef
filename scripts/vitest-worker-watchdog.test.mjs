import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const WATCHDOG = fileURLToPath(new URL('./vitest-worker-watchdog.mjs', import.meta.url));
const FAST = { VITEST_WATCHDOG_POLL_MS: '50', VITEST_WATCHDOG_STALL_MS: '600' };
// A stall limit with room for a loaded runner, and a body that outlasts it while yielding throughout.
const ROOMY = { VITEST_WATCHDOG_POLL_MS: '50', VITEST_WATCHDOG_STALL_MS: '3000' };
const YIELDS_FOR_3500_MS = 'let n = 0; const t = setInterval(() => { if (++n === 70) clearInterval(t); }, 50);';
const NEVER_STALLS = { VITEST_WATCHDOG_POLL_MS: '50', VITEST_WATCHDOG_STALL_MS: '600000' };

const spawned = new Set();
afterEach(() => {
  for (const pid of spawned) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* expected: it already exited */ }
  }
  spawned.clear();
});

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

async function untilGone(pid, ms) {
  const deadline = Date.now() + ms;
  while (alive(pid) && Date.now() < deadline) await new Promise((resolve) => { setTimeout(resolve, 25); });
  return !alive(pid);
}

/** Runs `body` under the watchdog and resolves how it ended. */
function run(body, env, nodeArgs = []) {
  const child = spawn(process.execPath, [...nodeArgs, '--import', WATCHDOG, '-e', body], { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'] });
  spawned.add(child.pid);
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const ended = new Promise((resolve) => {
    child.on('close', (code, signal) => resolve({ code, signal, stderr }));
  });
  return Object.assign(ended, { pid: child.pid });
}

/** Starts a parent that starts `body` under the watchdog, reports the child's pid, and then exits. */
function orphan(body, env) {
  const parent = `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['--import', ${JSON.stringify(WATCHDOG)}, '-e', ${JSON.stringify(`require('node:fs').writeSync(1, 'ready'); ${body}`)}], { stdio: ['ignore', 'pipe', 'ignore'], detached: true });
    child.stdout.once('data', () => { console.log(child.pid); process.exit(0); });
  `;
  const proc = spawn(process.execPath, ['-e', parent], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  proc.stdout.on('data', (chunk) => { out += chunk; });
  return new Promise((resolve) => {
    proc.on('close', () => {
      const pid = Number(out.trim());
      spawned.add(pid);
      resolve(pid);
    });
  });
}

describe('vitest worker watchdog', () => {
  it('ends a worker stuck in a loop that never yields once its parent is gone', async () => {
    const pid = await orphan('while (true) {}', NEVER_STALLS);
    expect(pid).toBeGreaterThan(0);
    expect(await untilGone(pid, 5000)).toBe(true);
  }, 15_000);

  it('ends a worker that is only waiting once its parent is gone', async () => {
    const pid = await orphan('setInterval(() => {}, 1000)', NEVER_STALLS);
    expect(await untilGone(pid, 5000)).toBe(true);
  }, 15_000);

  it('stops a worker that never yields with its parent alive, and says why', async () => {
    const ended = await run('while (true) {}', FAST);
    expect(ended.signal).toBe('SIGKILL');
    expect(ended.stderr).toContain('never returned to the event loop');
  }, 15_000);

  it('leaves a slow worker alone while it keeps yielding, past the stall limit', async () => {
    const ended = await run(YIELDS_FOR_3500_MS, ROOMY);
    expect(ended).toEqual({ code: 0, signal: null, stderr: '' });
  }, 15_000);

  it('does not count time the whole process spent paused, as in a laptop sleeping', async () => {
    const running = run(YIELDS_FOR_3500_MS, { VITEST_WATCHDOG_POLL_MS: '50', VITEST_WATCHDOG_STALL_MS: '1500' });
    await new Promise((resolve) => { setTimeout(resolve, 300); });
    process.kill(running.pid, 'SIGSTOP');
    await new Promise((resolve) => { setTimeout(resolve, 2000); });
    process.kill(running.pid, 'SIGCONT');
    expect(await running).toEqual({ code: 0, signal: null, stderr: '' });
  }, 15_000);

  it('leaves a stuck worker running under a debugger, which may be holding it at a breakpoint', async () => {
    const running = run('while (true) {}', FAST, ['--inspect=0']);
    await new Promise((resolve) => { setTimeout(resolve, 2000); });
    expect(alive(running.pid)).toBe(true);
  }, 15_000);

  it('does not keep a finished worker alive', async () => {
    const started = Date.now();
    const ended = await run('', NEVER_STALLS);
    expect(ended.code).toBe(0);
    expect(Date.now() - started).toBeLessThan(5000);
  }, 15_000);
});
