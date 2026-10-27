import { describe, expect, it } from 'vitest';
import { findFetchSites, isScanned } from './check-fetch-sites.mjs';

describe('check-fetch-sites', () => {
  it('flags an unlisted fetch( call with file:line', () => {
    const hits = findFetchSites({ file: 'src/x/up.ts', text: 'a\nawait fetch("/api/up", { body: bytes });', allow: [] });
    expect(hits).toEqual([expect.objectContaining({ file: 'src/x/up.ts', line: 2 })]);
  });
  it('flags a fetch passed in as a default parameter and its alias call', () => {
    expect(findFetchSites({ file: 'src/x/a.ts', text: 'f(fetchImpl: typeof fetch = fetch)', allow: [] })).toHaveLength(1);
    expect(findFetchSites({ file: 'src/x/a.ts', text: 'await fetchImpl(url)', allow: [] })).toHaveLength(1);
  });
  it('passes an allowlisted site; ignores comments, method names and tests', () => {
    const allow = [{ file: 'src/x/up.ts', includes: 'fetch("/fonts/', reason: 'r' }];
    expect(findFetchSites({ file: 'src/x/up.ts', text: 'await fetch("/fonts/a.ttf")', allow })).toEqual([]);
    expect(findFetchSites({ file: 'src/x/up.ts', text: '// fetch(x)\nprefetch(x)\nthis.refetch(y)', allow: [] })).toEqual([]);
    expect(isScanned('src/x/a.test.ts')).toBe(false);
    expect(isScanned('src/x/e2e/a.spec.js')).toBe(false);
    expect(isScanned('src/x/up.ts')).toBe(true);
  });
});
