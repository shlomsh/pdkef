import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findFloating } from './check-floating-promises.mjs';

const script = fileURLToPath(new URL('./check-floating-promises.mjs', import.meta.url));
const n = (src) => findFloating(src).length;

describe('findFloating', () => {
  it('flags a bare .then(f)', () => expect(n('doThing().then(f);')).toBe(1));
  it('flags a chain of .then with no rejection handler', () => expect(n('doThing().then(f).then(g);')).toBe(1));
  it('flags a bare call to a function declared async in the file', () =>
    expect(n('async function load() {}\nfunction run() {\n  load();\n}')).toBe(1));
  it('flags a bare call to an async arrow bound in the file', () =>
    expect(n('const load = async () => {};\nfunction run() {\n  load();\n}')).toBe(1));
  it('accepts void with a reason comment', () => expect(n('void doThing(); // reason: best effort')).toBe(0));
  it('accepts a block reason comment on the same line', () => expect(n('f(() => { void doThing(); /* reason: best effort */ });')).toBe(0));
  it('accepts void with a reason comment on the line above', () =>
    expect(n('// reason: best effort\nvoid doThing();')).toBe(0));
  it('flags void without a reason', () => expect(n('void doThing();')).toBe(1));
  it('accepts void on a chain that carries a handler', () => expect(n('void doThing().catch(h);')).toBe(0));
  it('accepts .then(f, onError)', () => expect(n('doThing().then(f, onError);')).toBe(0));
  it('accepts .catch(handler)', () => expect(n('doThing().then(f).catch(handler);')).toBe(0));
  it('accepts .finally after a catch', () => expect(n('doThing().catch(h).finally(g);')).toBe(0));
  it('flags .finally with no catch', () => expect(n('doThing().finally(g);')).toBe(1));
  it('accepts an awaited call', () => expect(n('async function f() { await doThing().then(g); }')).toBe(0));
  it('accepts a returned promise', () => expect(n('function f() { return doThing().then(g); }')).toBe(0));
  it('accepts a promise assigned to a variable', () => expect(n('const p = doThing().then(g);')).toBe(0));
  it('accepts a plain sync call', () => expect(n('function sync() {}\nsync();')).toBe(0));
  it('reports the 1-based line', () => expect(findFloating('a();\ndoThing().then(f);')).toEqual([2]));
});

describe('CLI', () => {
  it('passes on the real tree', () => {
    const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(r.stdout + r.stderr).toMatch(/floating-promises: PASS/);
    expect(r.status).toBe(0);
  });
});
