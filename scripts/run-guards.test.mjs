import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveGuardCommand, shellQuote, runGuards, RATCHET_FILE_GUARDS } from './run-guards.mjs';

const SCRIPTS = {
  a: 'node scripts/a.mjs',
  b: 'node scripts/b.mjs --flag',
  c: 'npm run -s a && node c.mjs',
  dd: 'node d.mjs',
  predd: 'echo before',
  e: 'node -e "console.log(process.env.npm_package_name)"',
  f: 'echo $npm_config_cache',
};

describe('resolveGuardCommand', () => {
  it('returns the script text, with extra args quoted', () => {
    expect(resolveGuardCommand('a', SCRIPTS)).toBe('node scripts/a.mjs');
    expect(resolveGuardCommand('a', SCRIPTS, ['--base', "it's"])).toBe(`node scripts/a.mjs '--base' 'it'\\''s'`);
  });

  it('leaves npm run chains as they are', () => {
    expect(resolveGuardCommand('c', SCRIPTS)).toBe('npm run -s a && node c.mjs');
  });

  it('refuses an unknown script', () => {
    expect(() => resolveGuardCommand('nope', SCRIPTS)).toThrow(/unknown script "nope"/);
  });

  it('refuses a script with a pre or post hook', () => {
    expect(() => resolveGuardCommand('dd', SCRIPTS)).toThrow(/predd|pre\/post hook/);
    expect(() => resolveGuardCommand('dd', { ...SCRIPTS, predd: undefined, postdd: 'x' })).toThrow(/hook/);
  });

  it('refuses a command that reads npm-only env', () => {
    expect(() => resolveGuardCommand('e', SCRIPTS)).toThrow(/npm_package_/);
    expect(() => resolveGuardCommand('f', SCRIPTS)).toThrow(/npm_config_/);
  });
});

describe('shellQuote', () => {
  it('wraps in single quotes and escapes embedded ones', () => {
    expect(shellQuote('a b')).toBe(`'a b'`);
    expect(shellQuote(`x'y`)).toBe(`'x'\\''y'`);
  });
});

// A spawn whose children finish when the test says so: `finish[command]` is { code, signal, out, err, error }.
function fakeSpawn(plan, delays = {}) {
  const state = { active: 0, max: 0, started: [], options: [] };
  function spawn(command, options) {
    state.started.push(command);
    state.options.push(options);
    state.active += 1;
    state.max = Math.max(state.max, state.active);
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    const outcome = plan[command] ?? {};
    setTimeout(() => {
      state.active -= 1;
      if (outcome.out) child.stdout.emit('data', Buffer.from(outcome.out));
      if (outcome.err) child.stderr.emit('data', Buffer.from(outcome.err));
      if (outcome.error) child.emit('error', new Error(outcome.error));
      else child.emit('close', outcome.code ?? 0, outcome.signal ?? null);
    }, delays[command] ?? 1);
    return child;
  }
  return { spawn, state };
}

function sink() {
  const lines = [];
  return { lines, out: (s) => lines.push(['out', s]), err: (s) => lines.push(['err', s]) };
}

const base = (extra) => ({ scripts: SCRIPTS, root: '/repo', ...extra });

describe('runGuards', () => {
  it('prints each guard whole, in the given order, whatever order they finish in', async () => {
    const { spawn } = fakeSpawn(
      { 'node scripts/a.mjs': { out: 'A1\nA2\n' }, 'node scripts/b.mjs --flag': { out: 'B\n', err: 'Berr\n' } },
      { 'node scripts/a.mjs': 20, 'node scripts/b.mjs --flag': 1 },
    );
    const log = sink();
    const failed = await runGuards(['a', 'b'], base({ spawn, ...log }));
    expect(failed).toEqual([]);
    const text = log.lines.map(([, s]) => s).join('');
    expect(text.indexOf('A1\nA2\n')).toBeGreaterThan(-1);
    expect(text.indexOf('A2')).toBeLessThan(text.indexOf('B\n'));
    expect(text).toMatch(/a .*\d\.\ds/);
    expect(text).toMatch(/b .*\d\.\ds/);
    expect(log.lines.find(([, s]) => s.includes('Berr'))[0]).toBe('err');
  });

  it('never runs more than the concurrency at once, and starts the next as one ends', async () => {
    const names = ['a', 'b', 'd2', 'd3', 'd4', 'd5', 'd6'];
    const scripts = { ...SCRIPTS, d2: 'x2', d3: 'x3', d4: 'x4', d5: 'x5', d6: 'x6' };
    const { spawn, state } = fakeSpawn({});
    await runGuards(names, { scripts, root: '/repo', spawn, concurrency: 3, ...sink() });
    expect(state.started).toHaveLength(7);
    expect(state.max).toBe(3);
  });

  it('runs every guard after one fails and returns the failed names', async () => {
    const { spawn, state } = fakeSpawn({ 'node scripts/a.mjs': { code: 1, out: 'bad\n' } });
    const log = sink();
    const failed = await runGuards(['a', 'b', 'c'], base({ spawn, concurrency: 1, ...log }));
    expect(failed).toEqual(['a']);
    expect(state.started).toHaveLength(3);
    expect(log.lines.map(([, s]) => s).join('')).toMatch(/a FAILED/);
  });

  it('counts a kill by signal and a spawn error as failures', async () => {
    const { spawn } = fakeSpawn({ 'node scripts/a.mjs': { code: null, signal: 'SIGKILL' }, 'node scripts/b.mjs --flag': { error: 'ENOENT' } });
    const log = sink();
    const failed = await runGuards(['a', 'b', 'c'], base({ spawn, ...log }));
    expect(failed).toEqual(['a', 'b']);
    const text = log.lines.map(([, s]) => s).join('');
    expect(text).toMatch(/SIGKILL/);
    expect(text).toMatch(/ENOENT/);
  });

  it('runs in a shell at the repo root with node_modules/.bin first on PATH', async () => {
    const { spawn, state } = fakeSpawn({});
    await runGuards(['a'], base({ spawn, env: { PATH: '/usr/bin' }, ...sink() }));
    expect(state.options[0].shell).toBe(true);
    expect(state.options[0].cwd).toBe('/repo');
    expect(state.options[0].env.PATH.startsWith('/repo/node_modules/.bin')).toBe(true);
    expect(state.options[0].env.PATH.endsWith('/usr/bin')).toBe(true);
  });

  it('takes { name, command } entries as they are', async () => {
    const { spawn, state } = fakeSpawn({});
    await runGuards([{ name: 'lint', command: 'oxlint x' }], base({ spawn, ...sink() }));
    expect(state.started).toEqual(['oxlint x']);
  });

  it('refuses before starting anything when a name cannot be run', async () => {
    const { spawn, state } = fakeSpawn({});
    await expect(runGuards(['a', 'nope'], base({ spawn, ...sink() }))).rejects.toThrow(/unknown script "nope"/);
    await expect(runGuards(['a', 'dd'], base({ spawn, ...sink() }))).rejects.toThrow(/hook/);
    expect(state.started).toEqual([]);
  });
});

describe('guards that share scripts/ratchet-limits.json', () => {
  it('run one after another while the rest overlap', async () => {
    const scripts = { r1: 'r1', r2: 'r2', r3: 'r3', p1: 'p1', p2: 'p2' };
    const lane = new Set(['r1', 'r2', 'r3']);
    let active = 0;
    let maxLane = 0;
    let maxAll = 0;
    const spawn = (command) => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      active += 1;
      maxAll = Math.max(maxAll, active);
      if (lane.has(command)) maxLane = Math.max(maxLane, (spawn.inLane = (spawn.inLane ?? 0) + 1));
      setTimeout(() => {
        active -= 1;
        if (lane.has(command)) spawn.inLane -= 1;
        child.emit('close', 0, null);
      }, 10);
      return child;
    };
    await runGuards(['r1', 'p1', 'r2', 'p2', 'r3'], { scripts, root: '/repo', spawn, ratchetGuards: lane, ...sink() });
    expect(maxLane).toBe(1);
    expect(maxAll).toBeGreaterThan(1);
  });

  it('are exactly the npm scripts that run a script importing ratchet-limits.mjs', () => {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    const scripts = JSON.parse(readFileSync(join(dir, '..', 'package.json'), 'utf8')).scripts;
    const users = readdirSync(dir).filter((f) => /\.(mjs|js)$/.test(f) && !/\.test\./.test(f) && f !== 'ratchet-limits.mjs' && /from '\.\/ratchet-limits\.mjs'/.test(readFileSync(join(dir, f), 'utf8')));
    expect(users.length).toBeGreaterThan(5);
    const names = Object.entries(scripts)
      .filter(([, command]) => users.some((f) => command.includes(`scripts/${f}`)))
      .map(([name]) => name);
    expect(names.sort()).toEqual([...RATCHET_FILE_GUARDS].sort());
  });
});
