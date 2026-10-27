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

describe('CI apt steps are bounded', () => {
  const dir = '.github/workflows';
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml'));
  for (const f of files) {
    const blocks = runBlocks(readFileSync(join(dir, f), 'utf8'));
    it(`${f}: no run uses --with-deps; apt runs go through ci-bounded-apt.sh`, () => {
      for (const b of blocks) {
        expect(b, 'run uses --with-deps').not.toMatch(/--with-deps/);
        if (/apt-get|install-deps/.test(b)) {
          expect(b, `unbounded apt step: ${b.trim()}`).toContain('scripts/ci-bounded-apt.sh');
        }
      }
    });
  }
});

describe('ci-bounded-apt.sh without timeout', () => {
  it('fails with a clear message instead of running unbounded', () => {
    const bash = spawnSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).stdout.trim();
    const dir = mkdtempSync(join(tmpdir(), 'nopath-'));
    const r = spawnSync(bash, [SCRIPT, '5', 'echo', 'ran'], {
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
    const r = run(['5', 'bash', '-c', `printf x >> ${f}`]);
    expect(r.status).toBe(0);
    expect(count(f)).toBe(1);
  });

  it('runs exactly twice on persistent failure and returns its status', () => {
    const f = counter();
    const r = run(['5', 'bash', '-c', `printf x >> ${f}; exit 7`]);
    expect(r.status).toBe(7);
    expect(count(f)).toBe(2);
    expect(r.stdout).toContain('::warning::');
  });

  it('succeeds on the retry after one failure', () => {
    const f = counter();
    const r = run(['5', 'bash', '-c', `printf x >> ${f}; [ "$(wc -c < ${f})" -ge 2 ]`]);
    expect(r.status).toBe(0);
    expect(count(f)).toBe(2);
  });

  it('kills a command that outlives the bound and retries', () => {
    const f = counter();
    const t0 = Date.now();
    const r = run(['1', 'bash', '-c', `printf x >> ${f}; sleep 5`]);
    expect(Date.now() - t0).toBeLessThan(10000);
    expect(r.status).not.toBe(0);
    expect(count(f)).toBe(2);
  });
});
