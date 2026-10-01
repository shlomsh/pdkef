import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findSwallowed } from './check-swallowed-errors.mjs';

const script = fileURLToPath(new URL('./check-swallowed-errors.mjs', import.meta.url));
const n = (src) => findSwallowed(src).length;

describe('findSwallowed', () => {
  it('flags a bare catch', () => expect(n('try { a() } catch {}')).toBe(1));
  it('flags a catch that only uses the error locally', () => expect(n('try { a() } catch (e) { x = e }')).toBe(1));
  it('accepts reportError', () => expect(n("try { a() } catch (e) { reportError('drafts', e, 'save') }")).toBe(0));
  it('accepts a rethrow', () => expect(n('try { a() } catch (e) { throw e }')).toBe(0));
  it('does not count a throw inside a nested function', () =>
    expect(n('try { a() } catch (e) { cb(() => { throw e }) }')).toBe(1));
  it('accepts // expected: inside the body', () =>
    expect(n('try { a() } catch {\n  // expected: aborts are normal\n}')).toBe(0));
  it('accepts // expected: on the line above', () =>
    expect(n('try { a() }\n// expected: aborts are normal\ncatch {}')).toBe(0));
  it('flags .catch(() => null)', () => expect(n('p.catch(() => null)')).toBe(1));
  it('accepts .catch with a report*Error call', () =>
    expect(n("p.catch((e) => reportStoreError('drafts', e, 'x'))")).toBe(0));
  it('accepts // expected: above a .catch call', () =>
    expect(n('// expected: best effort\np.catch(() => {})')).toBe(0));
  it('reports the 1-based line', () => expect(findSwallowed('a()\ntry {} catch {}')).toEqual([2]));
  it('flags a function as the second argument of .then', () => expect(n('p.then(ok, () => {})')).toBe(1));
  it('accepts // expected: above a .then handler', () =>
    expect(n('// expected: best effort\np.then(ok, () => {})')).toBe(0));
  it('does not treat the first .then argument as a handler', () => expect(n('p.then(() => {})')).toBe(0));
  it('flags .catch(noop)', () => expect(n('p.catch(noop)')).toBe(1));
  it('flags .then(ok, handlers.noop)', () => expect(n('p.then(ok, handlers.noop)')).toBe(1));
  it('accepts a named report*Error handler', () => expect(n('p.catch(reportStoreError)')).toBe(0));
  it('accepts // expected: above a named handler', () => expect(n('// expected: nothing to do\np.catch(noop)')).toBe(0));
  it('does not count a conditional rethrow', () => expect(n('try { a() } catch (e) { if (x) throw e }')).toBe(1));
  it('does not count a throw inside a loop or block', () =>
    expect(n('try { a() } catch (e) { { throw e } }')).toBe(1));
  it('does not count a conditional rethrow in a handler function', () =>
    expect(n('p.catch((e) => { if (x) throw e })')).toBe(1));
  it('does not count a report inside a never-called nested function', () =>
    expect(n("try { a() } catch (e) { const f = () => reportError('a', e, 's') }")).toBe(1));
});

describe('--list', () => {
  it('prints findings and exits 0', () => {
    const r = spawnSync(process.execPath, [script, '--list'], { encoding: 'utf8' });
    expect(r.status).toBe(0);
  });
});
