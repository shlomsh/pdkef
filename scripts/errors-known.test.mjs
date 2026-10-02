import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  STAMP_COMMIT,
  classify,
  describeFingerprint,
  findEntry,
  matchEntry,
  toSlug,
  validateRegistry,
} from './errors-known.mjs';

const REGISTRY = JSON.parse(readFileSync(new URL('../docs/error-known-items.json', import.meta.url), 'utf8'));

const gitErr = (status) => Object.assign(new Error('git failed'), status === undefined ? {} : { status });
// A fake git whose merge-base answers by (ancestor, descendant) pairs: true = ancestor, false = status 1.
const fakeGit = (answers, fallback = 128) => (args) => {
  if (args[0] === 'merge-base') {
    const a = answers[`${args[2]}>${args[3]}`];
    if (a === true) return '';
    if (a === false) throw gitErr(1);
  }
  throw gitErr(fallback);
};

describe('toSlug', () => {
  it.each([
    ['/merge/', 'merge'],
    ['/he/merge/', 'merge'],
    ['/unlock/', 'unlock'],
    ['/', 'home'],
    ['/he/', 'home'],
    ['', ''],
    [undefined, ''],
    [42, ''],
  ])('%s -> %s', (tool, slug) => expect(toSlug(tool)).toBe(slug));
});

describe('describeFingerprint', () => {
  const field = 'redact|um|pdf-lib.CqiVumd9.js:45:2284|export|chromium-154';
  it('splits the field and reads the slug from the sample', () => {
    expect(describeFingerprint(field, { tool: '/redact/' })).toEqual({
      area: 'redact', name: 'um', step: 'export', engine: 'chromium-154', slug: 'redact', module: 'pdf-lib',
    });
  });
  it('has an empty slug with no sample', () => {
    expect(describeFingerprint(field, null).slug).toBe('');
  });
  it('has a null module for an unparseable frame', () => {
    expect(describeFingerprint('a|b|nonsense|c|d', null).module).toBeNull();
  });
});

describe('matchEntry / findEntry', () => {
  const fp = { area: 'redact', name: 'um', step: 'export', engine: 'x', slug: 'redact', module: 'pdf-lib' };
  const e = (match) => ({ id: 'X', match });
  it('matches a string value', () => expect(matchEntry(e({ area: 'redact' }), fp)).toBe(true));
  it('matches a listed value', () => expect(matchEntry(e({ step: ['list_objects', 'export'] }), fp)).toBe(true));
  it('a missing key matches anything', () => expect(matchEntry(e({ slug: 'redact' }), fp)).toBe(true));
  it('mismatch on any key fails', () => {
    expect(matchEntry(e({ area: 'redact', name: 'TypeError' }), fp)).toBe(false);
    expect(matchEntry(e({ step: ['a', 'b'] }), fp)).toBe(false);
  });
  it('findEntry returns the first match or null', () => {
    const list = [{ id: 'A', match: { area: 'nope' } }, { id: 'B', match: { area: 'redact' } }, { id: 'C', match: { slug: 'redact' } }];
    expect(findEntry(list, fp).id).toBe('B');
    expect(findEntry([list[0]], fp)).toBeNull();
  });
});

describe('validateRegistry', () => {
  const ok = { id: 'A', ticket: 'T-1', title: 't', match: { area: 'x', step: 'y' }, fixedIn: 'abcdef1' };
  it('accepts the real registry', () => expect(validateRegistry(REGISTRY)).toEqual([]));
  it('still holds the entries the digest was built around', () => {
    expect(REGISTRY.map((r) => r.id)).toEqual(expect.arrayContaining(['DEBT-30', 'ENC-02', 'DEBT-34']));
  });
  it('rejects a match with a single key, which would swallow a whole area', () => {
    expect(validateRegistry([{ ...ok, match: { area: 'uncaught' } }]).join()).toMatch(/at least two/i);
  });
  it('rejects an empty string in a match, which matches a missing field', () => {
    expect(validateRegistry([{ ...ok, match: { area: 'x', slug: '' } }]).length).toBeGreaterThan(0);
    expect(validateRegistry([{ ...ok, match: { area: 'x', step: [''] } }]).length).toBeGreaterThan(0);
  });
  it('rejects a fixedIn that is not a string, even when it looks like hex', () => {
    expect(validateRegistry([{ ...ok, fixedIn: 1234567 }]).length).toBeGreaterThan(0);
  });
  it('rejects a non-array', () => expect(validateRegistry({}).length).toBeGreaterThan(0));
  it('rejects duplicate ids', () => expect(validateRegistry([ok, ok]).join()).toMatch(/duplicate/i));
  it('rejects no match keys', () => expect(validateRegistry([{ ...ok, match: {} }]).length).toBeGreaterThan(0));
  it('rejects both fixedIn and open', () => expect(validateRegistry([{ ...ok, open: true }]).length).toBeGreaterThan(0));
  it('rejects neither', () => {
    const { fixedIn, ...rest } = ok;
    expect(validateRegistry([rest]).length).toBeGreaterThan(0);
  });
  it('rejects a bad hex fixedIn', () => {
    expect(validateRegistry([{ ...ok, fixedIn: 'XYZ' }]).length).toBeGreaterThan(0);
    expect(validateRegistry([{ ...ok, fixedIn: 'abc12' }]).length).toBeGreaterThan(0);
  });
  it('accepts open: true alone', () => {
    const { fixedIn, ...rest } = ok;
    expect(validateRegistry([{ ...rest, open: true }])).toEqual([]);
  });
});

describe('classify', () => {
  const entry = { id: 'A', ticket: 'DEBT-9', match: { area: 'x' }, fixedIn: 'aaaaaaa' };
  const build = 'bbbbbbb';
  it('no entry is new', () => {
    expect(classify({ entry: null, build, run: fakeGit({}) })).toEqual({
      category: 'new', actionable: true, reason: 'not in the known items', ticket: null,
    });
  });
  it('open is known_open and names the ticket', () => {
    const r = classify({ entry: { id: 'A', ticket: 'DEBT-9', match: {}, open: true }, build, run: fakeGit({}) });
    expect(r).toMatchObject({ category: 'known_open', actionable: false, ticket: 'DEBT-9' });
    expect(r.reason).toContain('DEBT-9');
  });
  it('a build containing the fix is a regression', () => {
    const r = classify({ entry, build, run: fakeGit({ 'aaaaaaa>bbbbbbb': true }) });
    expect(r).toMatchObject({ category: 'regression', actionable: true, ticket: 'DEBT-9' });
    expect(r.reason).toBe('build bbbbbbb contains the fix aaaaaaa');
  });
  it('a build predating the fix is an old tab', () => {
    const r = classify({ entry, build, run: fakeGit({ 'aaaaaaa>bbbbbbb': false }) });
    expect(r).toMatchObject({ category: 'old_tab', actionable: false });
    expect(r.reason).toBe('build bbbbbbb predates the fix');
  });
  it.each([
    ['status 128', gitErr(128)],
    ['no status', gitErr(undefined)],
    ['timeout-like', Object.assign(new Error('spawnSync git ETIMEDOUT'), { code: 'ETIMEDOUT', signal: 'SIGTERM' })],
  ])('git failing with %s is unverifiable (with build)', (_n, error) => {
    const r = classify({ entry, build, run: () => { throw error; } });
    expect(r).toMatchObject({ category: 'unverifiable', actionable: true });
    expect(r.reason).toMatch(/git could not tell/);
  });
  it('no build and the fix newer than stamping is most likely an old tab, never certain', () => {
    // A build deployed without a commit (a CLI deploy) sends no stamp either, so this cannot be a certainty.
    const r = classify({ entry, build: undefined, run: fakeGit({ [`aaaaaaa>${STAMP_COMMIT}`]: false }) });
    expect(r).toMatchObject({ category: 'likely_old_tab', actionable: false });
    expect(r.reason).toMatch(/most likely/);
    expect(r.reason).toMatch(/without a commit/);
  });
  it('no build and the fix older than stamping is unverifiable', () => {
    const r = classify({ entry, build: undefined, run: fakeGit({ [`aaaaaaa>${STAMP_COMMIT}`]: true }) });
    expect(r).toMatchObject({ category: 'unverifiable', actionable: true });
    expect(r.reason).toBe('no build stamp and the fix predates stamping: resolve it to tell');
  });
  it('no build and another git failure is unverifiable', () => {
    expect(classify({ entry, build: undefined, run: fakeGit({}) }).category).toBe('unverifiable');
  });
  it('never throws', () => {
    expect(() => classify({ entry, build, run: () => { throw 'boom'; } })).not.toThrow();
    expect(() => classify({ entry, build: undefined, run: () => { throw null; } })).not.toThrow();
  });
});

describe('the real registry against real fingerprints', () => {
  const fp = (field, tool) => describeFingerprint(field, tool ? { tool } : null);
  it('matches the Unlock ReferenceError to DEBT-34', () => {
    const f = fp('pdf_tool_run|ReferenceError|pdf-lib.CqiVumd9.js:12:36319|unlock|chromium-154', '/unlock/');
    expect(findEntry(REGISTRY, f).id).toBe('DEBT-34');
  });
  it('matches the Redact list_objects error to ENC-02', () => {
    const f = fp('redact|um|pdf-lib.CqiVumd9.js:45:2284|list_objects|chromium-154', '/redact/');
    expect(findEntry(REGISTRY, f).id).toBe('ENC-02');
  });
  it('matches the Redact pdf.js read_glyphs error to nothing', () => {
    const f = fp('redact|TypeError|pdf.Zn9K1YuS.js:44:99875|read_glyphs|chromium-143', '/redact/');
    expect(findEntry(REGISTRY, f)).toBeNull();
  });
  it('classifies a matched entry through a fake git', () => {
    const f = fp('pdf_tool_run|ReferenceError|pdf-lib.CqiVumd9.js:12:36319|unlock|chromium-154', '/unlock/');
    const r = classify({ entry: findEntry(REGISTRY, f), build: 'abcdef1', run: fakeGit({ '01bf5820>abcdef1': false }) });
    expect(r).toMatchObject({ category: 'old_tab', ticket: 'DEBT-34' });
  });
});
