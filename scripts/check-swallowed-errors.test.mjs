import { describe, expect, it } from 'vitest';
import { findSwallowed } from './check-swallowed-errors.mjs';

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
});
