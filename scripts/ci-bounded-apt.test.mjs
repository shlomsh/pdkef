import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* QUAL-33: every apt-touching CI step goes through scripts/ci-bounded-apt.sh,
   a wall-clock bound plus one retry. The workflow test runs everywhere; the
   behaviour tests need GNU `timeout`, so they run on Linux (CI's units job). */

const SCRIPT = 'scripts/ci-bounded-apt.sh';
const run = (args, env = {}) =>
  spawnSync('bash', [SCRIPT, ...args], {
    env: { ...process.env, CI_BOUNDED_APT_PREFIX: '', ...env },
    encoding: 'utf8',
  });

/** Every `run:` value in a workflow, block scalars joined, with its step name. */
function runBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(?:- )?run:\s*(.*)$/);
    if (!m) continue;
    const indent = m[1].length;
    let body = m[2].replace(/^[|>][-+]?$/, '');
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (l.trim() !== '' && l.search(/\S/) <= indent) break;
      body += '\n' + l;
    }
    blocks.push(body);
  }
  return blocks;
}

/** A run value that touches apt must START with the bounded wrapper and two integer bounds. */
const TOUCHES_APT = /apt-get|\bapt\s|dpkg|install-deps/;
const BOUNDED = /^bash scripts\/ci-bounded-apt\.sh \d+ \d+ \S/;
const aptViolation = (block) => {
  if (/--with-deps/.test(block)) return 'uses --with-deps';
  const b = block.trim();
  if (TOUCHES_APT.test(b) && !BOUNDED.test(b)) return `unbounded apt step: ${b}`;
  return null;
};

describe('the apt check itself', () => {
  it('rejects an unbounded command followed by the script name', () => {
    expect(aptViolation('apt-get install -y x && bash scripts/ci-bounded-apt.sh 1 2 true')).toMatch(/unbounded/);
  });
  it('rejects the script name only in a comment', () => {
    expect(aptViolation('# bash scripts/ci-bounded-apt.sh 120 300 x\napt-get install -y x')).toMatch(/unbounded/);
  });
  it('rejects a single bound and --with-deps', () => {
    expect(aptViolation('bash scripts/ci-bounded-apt.sh 120 apt-get update')).toMatch(/unbounded/);
    expect(aptViolation('npx playwright install --with-deps chromium')).toMatch(/with-deps/);
  });
  it('accepts a bounded command', () => {
    expect(aptViolation('bash scripts/ci-bounded-apt.sh 120 300 npx playwright install-deps chromium')).toBeNull();
  });
});

describe('CI apt steps are bounded', () => {
  const dir = '.github/workflows';
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml'));
  for (const f of files) {
    const blocks = runBlocks(readFileSync(join(dir, f), 'utf8'));
    it(`${f}: no run uses --with-deps; apt runs start with the bounded wrapper`, () => {
      for (const b of blocks) expect(aptViolation(b)).toBeNull();
    });
  }
});

describe('ci-bounded-apt.sh usage', () => {
  it('needs two bounds and a command', () => {
    const r = run(['5', 'echo']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/usage/);
  });
});

describe('ci-bounded-apt.sh without timeout', () => {
  it('fails with a clear message instead of running unbounded', () => {
    const bash = spawnSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).stdout.trim();
    const dir = mkdtempSync(join(tmpdir(), 'nopath-'));
    const r = spawnSync(bash, [SCRIPT, '5', '5', 'echo', 'ran'], {
      env: { PATH: dir, CI_BOUNDED_APT_PREFIX: '' },
      encoding: 'utf8',
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/timeout/);
    expect(r.stdout).not.toContain('ran');
  });
});

describe.runIf(process.platform === 'linux')('ci-bounded-apt.sh behaviour (GNU timeout)', () => {
  const counter = () => join(mkdtempSync(join(tmpdir(), 'apt-')), 'n');
  const count = (f) => (existsSync(f) ? readFileSync(f, 'utf8').length : 0);

  it('runs once and exits 0 on first success', () => {
    const f = counter();
    const r = run(['5', '5', 'bash', '-c', `printf x >> ${f}`]);
    expect(r.status).toBe(0);
    expect(count(f)).toBe(1);
  });

  it('runs exactly twice on persistent failure and returns its status', () => {
    const f = counter();
    const r = run(['5', '5', 'bash', '-c', `printf x >> ${f}; exit 7`]);
    expect(r.status).toBe(7);
    expect(count(f)).toBe(2);
    expect(r.stdout).toContain('::warning::');
  });

  it('succeeds on the retry after one failure', () => {
    const f = counter();
    const r = run(['5', '5', 'bash', '-c', `printf x >> ${f}; [ "$(wc -c < ${f})" -ge 2 ]`]);
    expect(r.status).toBe(0);
    expect(count(f)).toBe(2);
  });

  it('kills a command that outlives the bound and retries', () => {
    const f = counter();
    const t0 = Date.now();
    const r = run(['1', '1', 'bash', '-c', `printf x >> ${f}; sleep 5`]);
    expect(Date.now() - t0).toBeLessThan(10000);
    expect(r.status).not.toBe(0);
    expect(count(f)).toBe(2);
  });

  // apt-get runs as a grandchild (npx -> playwright -> apt-get). If the runner's
  // timeout signalled only its direct child, a killed attempt would leave apt holding
  // the dpkg lock and the retry would fail on it. Ubuntu 26.04 ships uutils coreutils,
  // so this proves the process-group kill on the image CI actually uses.
  it('kills the grandchildren of a command that outlives the bound', () => {
    const pids = counter();
    run(['1', '1', 'bash', '-c', `sleep 30 & echo $! >> ${pids}; wait`]);
    const alive = (pid) => {
      try { process.kill(Number(pid), 0); return true; } catch { return false; }
    };
    const all = readFileSync(pids, 'utf8').trim().split('\n');
    // A killed child may not be reaped yet: poll up to 3 s before asserting.
    const deadline = Date.now() + 3000;
    let left = all.filter(alive);
    while (left.length && Date.now() < deadline) {
      spawnSync('sleep', ['0.1']);
      left = all.filter(alive);
    }
    expect(left).toEqual([]);
  });

  it('bounds the retry by the second number', () => {
    const f = counter();
    // attempt 1 fails fast; attempt 2 sleeps 2 s: over the 1 s first bound, within the 4 s retry bound.
    const r = run(['1', '4', 'bash', '-c', `printf x >> ${f}; n=$(wc -c < ${f}); if [ "$n" -ge 2 ]; then sleep 2; else exit 1; fi`]);
    expect(r.status).toBe(0);
    expect(count(f)).toBe(2);
  });
});
