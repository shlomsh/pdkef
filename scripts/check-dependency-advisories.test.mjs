import { describe, expect, it } from 'vitest';
import { findUnmatchedExceptions } from './check-dependency-advisories.mjs';

const ex = (pkg, advisory) => ({ package: pkg, advisory });
const via = (id, severity = 'high') => ({ severity, url: `https://github.com/advisories/${id}` });

describe('findUnmatchedExceptions', () => {
  it('flags an exception whose package is absent', () => {
    const e = ex('braces', 'GHSA-AAAA-BBBB-CCCC');
    expect(findUnmatchedExceptions([e], {})).toEqual([e]);
  });

  it('flags an exception when the package carries a different GHSA', () => {
    const e = ex('braces', 'GHSA-AAAA-BBBB-CCCC');
    const vulns = { braces: { via: [via('GHSA-XXXX-YYYY-ZZZZ')] } };
    expect(findUnmatchedExceptions([e], vulns)).toEqual([e]);
  });

  it('passes a matching GHSA, including a lowercase id in the url', () => {
    const e = ex('braces', 'GHSA-AAAA-BBBB-CCCC');
    expect(findUnmatchedExceptions([e], { braces: { via: [via('GHSA-AAAA-BBBB-CCCC')] } })).toEqual([]);
    expect(findUnmatchedExceptions([e], { braces: { via: [via('ghsa-aaaa-bbbb-cccc')] } })).toEqual([]);
  });

  it('matches regardless of severity', () => {
    const e = ex('braces', 'GHSA-AAAA-BBBB-CCCC');
    expect(findUnmatchedExceptions([e], { braces: { via: [via('GHSA-AAAA-BBBB-CCCC', 'low')] } })).toEqual([]);
  });

  it('never matches string-only via entries (chain links)', () => {
    const e = ex('braces', 'GHSA-AAAA-BBBB-CCCC');
    expect(findUnmatchedExceptions([e], { braces: { via: ['micromatch'] } })).toEqual([e]);
  });

  it('returns [] for an empty exceptions list', () => {
    expect(findUnmatchedExceptions([], { braces: { via: [] } })).toEqual([]);
  });
});
