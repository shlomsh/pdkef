import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIONS,
  MAX_ACTIONS,
  MAX_FRAMES,
  MAX_REPORT_BYTES,
  MAX_REPORTS_PER_PAGE,
  parseErrorReport,
  readPageContext,
  reportError,
  sendBeacon,
  resetErrorReportingForTests,
  setReportingEnabledForTests,
  toErrorReport,
  type PageContext,
} from './errorReport.ts';
import { recordAction, resetActionTrailForTests } from './actionTrail.ts';

function errorAt(frame: string, message = 'boom', name?: string): Error {
  const e = new TypeError(message);
  if (name) e.name = name;
  e.stack = `${e.name}: ${message}\n    at f (https://pdkef.com/_astro/${frame})`;
  return e;
}

const CTX: PageContext = { tool: '/sign/', installed: false, sw: true, age: 'under_1m', actions: [] };

describe('toErrorReport', () => {
  it('carries no message text', () => {
    const e = errorAt('PdfSignTool.Ab12Cd.js:12:345', 'Cannot read "Social Security Number" of /Users/me/tax return 2024.pdf');
    const report = toErrorReport('sign_export', e, 'export', CTX);
    expect(report).toEqual({ area: 'sign_export', name: 'TypeError', stack: ['PdfSignTool.Ab12Cd.js:12:345'], step: 'export', ...CTX });
    const json = JSON.stringify(report);
    for (const leak of ['Social', 'Users', 'tax', '2024.pdf', 'Cannot']) expect(json).not.toContain(leak);
  });
  it('drops ignored names, extension-only stacks and non-errors', () => {
    expect(toErrorReport('pdf_render', errorAt('A.js:1:1', 'x', 'PasswordException'), 'save_draft', CTX)).toBeNull();
    const ext = new Error('x');
    ext.stack = 'Error: x\n at chrome-extension://abc/inject.js:1:2';
    expect(toErrorReport('uncaught', ext, 'save_draft', CTX)).toBeNull();
    expect(toErrorReport('uncaught', 'a string', 'save_draft', CTX)).toBeNull();
    expect(toErrorReport('uncaught', { name: 'TypeError' }, 'save_draft', CTX)).toBeNull();
  });
  it('cuts 12 frames to 8 and skips frames from other origins', () => {
    const e = new TypeError('x');
    const lines = Array.from({ length: 12 }, (_, i) => `    at f (https://pdkef.com/_astro/A.js:${i + 1}:1)\n    at g (https://cdn.x/o.js:${i}:1)`);
    e.stack = `TypeError: x\n${lines.join('\n')}`;
    const report = toErrorReport('drafts', e, 'save_draft', CTX);
    expect(report?.stack).toHaveLength(8);
    expect(report?.stack[7]).toBe('A.js:8:1');
  });
  it('never reads a frame out of a multi-line message', () => {
    const e = new TypeError("bad\n    at x (https://pdkef.com/_astro/Secret.js:1:1)");
    e.stack = `${String(e)}\n    at f (https://pdkef.com/_astro/Real.js:5:6)`;
    expect(toErrorReport('drafts', e, 'save_draft', CTX)?.stack).toEqual(['Real.js:5:6']);
  });
  it('is null when the schema rejects the step', () => {
    expect(toErrorReport('drafts', errorAt('A.js:1:1'), 'has space', CTX)).toBeNull();
  });
});

describe('readPageContext', () => {
  const stubPage = (pathname: string, matchMedia: unknown = () => ({ matches: false })) => {
    vi.stubGlobal('location', { pathname });
    vi.stubGlobal('matchMedia', matchMedia);
    vi.stubGlobal('navigator', { serviceWorker: { controller: {} } });
  };
  it('reads the page facts', () => {
    stubPage('/he/sign/', () => ({ matches: true }));
    expect(readPageContext()).toMatchObject({ tool: '/he/sign/', installed: true, sw: true });
  });
  it('falls back to / for a path outside the schema shape', () => {
    for (const p of ['/x?y', '/Sign/', '/a/b/c/d/e/']) {
      stubPage(p);
      expect(readPageContext().tool).toBe('/');
    }
  });
  it('falls back for that one fact when matchMedia throws, keeping the others', () => {
    stubPage('/sign/', () => {
      throw new Error('no');
    });
    expect(readPageContext()).toMatchObject({ tool: '/sign/', installed: false });
  });
});

describe('stack frames, as the review attacked them', () => {
  it('never reads a frame out of the message of an error renamed after construction', () => {
    class Renamed extends Error {}
    const e = new Renamed("bad font '\n    at x (https://pdkef.com/_astro/Forged.js:1:1)'");
    e.name = 'FontError';
    e.stack = `Error: ${e.message}\n    at f (https://pdkef.com/_astro/Real.1.js:5:6)`;
    expect(toErrorReport('fonts', e, 'save_draft', CTX)?.stack).toEqual(['Real.1.js:5:6']);
  });
  it('skips an oversized frame instead of losing the report', () => {
    const e = new TypeError('x');
    e.stack = `TypeError: x\n    at f (https://pdkef.com/_astro/${'a'.repeat(130)}.js:1:1)\n    at g (https://pdkef.com/_astro/Ok.2.js:3:4)`;
    expect(toErrorReport('drafts', e, 'save_draft', CTX)?.stack).toEqual(['Ok.2.js:3:4']);
  });
  it('reads WebKit and Gecko frames', () => {
    const e = new TypeError('x');
    // The async line is verbatim from Playwright WebKit against a production build.
    e.stack = 'readTextItems@https://pdkef.com/_astro/pdf.Zn.js:44:100768\nasync outer@http://localhost:4395/_astro/raw.Zz9.js:2:36\nasync*pageTextRuns@https://pdkef.com/_astro/Sign.1.js:9:9\n@https://pdkef.com/_astro/Sign.1.js:2:3';
    expect(toErrorReport('sign_form_detection', e, 'detect_fields', CTX)?.stack).toEqual(['pdf.Zn.js:44:100768', 'raw.Zz9.js:2:36', 'Sign.1.js:9:9', 'Sign.1.js:2:3']);
  });
});

describe('reportError', () => {
  const beacon = vi.fn((..._args: unknown[]) => true);
  beforeEach(() => {
    beacon.mockReset();
    beacon.mockReturnValue(true);
    vi.stubGlobal('navigator', { onLine: true, sendBeacon: beacon });
    setReportingEnabledForTests(true);
    resetErrorReportingForTests();
  });

  it('sends a repeated error once, as a body that parses back', async () => {
    const e = errorAt('A.js:1:2');
    reportError('drafts', e, 'save_draft');
    reportError('drafts', e, 'save_draft');
    expect(beacon).toHaveBeenCalledTimes(1);
    const [path, blob] = beacon.mock.calls[0] as [string, Blob];
    expect(path).toBe('/api/report');
    const body = parseErrorReport(JSON.parse(await blob.text()));
    expect(body).toMatchObject({ area: 'drafts', name: 'TypeError', stack: ['A.js:1:2'], step: 'save_draft' });
  });
  it('carries exactly the recorded actions, oldest first', async () => {
    resetActionTrailForTests();
    recordAction('add_files');
    recordAction('clear_all');
    reportError('drafts', errorAt('Act.js:1:2'), 'save_draft');
    const [, blob] = beacon.mock.calls[0] as [string, Blob];
    expect(JSON.parse(await blob.text()).actions).toEqual(['add_files', 'clear_all']);
    resetActionTrailForTests();
  });
  it('keeps two call sites over one throw site apart', () => {
    const e = errorAt('S.js:1:2');
    reportError('drafts', e, 'save_draft');
    reportError('drafts', e, 'load_draft');
    expect(beacon).toHaveBeenCalledTimes(2);
  });
  it('sends one defect once, even when it also escapes as uncaught', () => {
    const e = errorAt('B.js:1:2');
    reportError('drafts', e, 'save_draft');
    reportError('uncaught', e, 'save_draft');
    expect(beacon).toHaveBeenCalledTimes(1);
  });
  it('drops pdf.js cancellation', () => {
    reportError('pdf_render', errorAt('C.js:1:2', 'x', 'RenderingCancelledException'), 'save_draft');
    expect(beacon).not.toHaveBeenCalled();
  });
  it('caps the total per page', () => {
    for (let i = 0; i < MAX_REPORTS_PER_PAGE + 5; i++) reportError('drafts', errorAt(`A.js:${i + 1}:1`), 'save_draft');
    expect(beacon).toHaveBeenCalledTimes(MAX_REPORTS_PER_PAGE);
  });
  it('does nothing offline or outside production', () => {
    vi.stubGlobal('navigator', { onLine: false, sendBeacon: beacon });
    reportError('drafts', errorAt('A.js:1:1'), 'save_draft');
    vi.stubGlobal('navigator', { onLine: true, sendBeacon: beacon });
    setReportingEnabledForTests(false);
    reportError('drafts', errorAt('A.js:1:1'), 'save_draft');
    expect(beacon).not.toHaveBeenCalled();
  });
  it('sendBeacon returns false and posts nothing when offline', () => {
    vi.stubGlobal('navigator', { onLine: false, sendBeacon: beacon });
    expect(sendBeacon({ a: 1 })).toBe(false);
    expect(beacon).not.toHaveBeenCalled();
  });
  it('never throws', () => {
    beacon.mockImplementation(() => {
      throw new Error('nope');
    });
    expect(() => reportError('drafts', errorAt('A.js:1:1'), 'save_draft')).not.toThrow();
  });
});

describe('parseErrorReport', () => {
  const ok = { area: 'drafts', name: 'TypeError', stack: ['A.1.js:1:2'], step: 'none', ...CTX };
  it('accepts the exact shape', () => expect(parseErrorReport(ok)).toEqual(ok));
  it('rejects extra keys, unknown areas, spaced names and slashed frames', () => {
    expect(parseErrorReport({ ...ok, message: 'x' })).toBeNull();
    expect(parseErrorReport({ ...ok, area: 'other' })).toBeNull();
    expect(parseErrorReport({ ...ok, name: 'Type Error' })).toBeNull();
    expect(parseErrorReport({ ...ok, stack: ['/_astro/A.js:1:2'] })).toBeNull();
  });
});

describe('actions field', () => {
  const ok = { area: 'drafts', name: 'TypeError', stack: ['A.1.js:1:2'], step: 'none', ...CTX };
  const names = (n: number) => Array.from({ length: n }, (_, i) => ACTIONS[i % ACTIONS.length]);
  it('accepts 0 and exactly MAX_ACTIONS names', () => {
    expect(parseErrorReport({ ...ok, actions: [] })?.actions).toEqual([]);
    expect(parseErrorReport({ ...ok, actions: names(MAX_ACTIONS) })?.actions).toHaveLength(10);
  });
  it('rejects 11 names', () => {
    expect(parseErrorReport({ ...ok, actions: names(MAX_ACTIONS + 1) })).toBeNull();
  });
  it('rejects names off the list, near misses and non-strings', () => {
    for (const bad of ['nope', 'Add_files', 'add_files ', ' add_files', 'add-files', '', 1, null, undefined, {}, ['add_files']]) {
      expect(parseErrorReport({ ...ok, actions: [bad] })).toBeNull();
    }
  });
  it('rejects a non-array actions, and an extra key, accepting a missing one (older build)', () => {
    expect(parseErrorReport({ ...ok, actions: { 0: 'add_files', length: 1 } })).toBeNull();
    expect(parseErrorReport({ ...ok, actions: 'add_files' })).toBeNull();
    const { actions: _drop, ...without } = ok as Record<string, unknown>;
    expect(parseErrorReport(without)?.actions).toEqual([]);
    expect(parseErrorReport({ ...without, tenth: 1 })).toBeNull();
    expect(parseErrorReport({ ...ok, actions: null })).toBeNull();
    expect(parseErrorReport({ ...ok, actions: [], tenth: 1 })).toBeNull();
  });
  it('returns a frozen copy, not the input array', () => {
    const input = ['add_files', 'clear_all'];
    const parsed = parseErrorReport({ ...ok, actions: input });
    expect(parsed?.actions).toEqual(input);
    expect(parsed?.actions).not.toBe(input);
    expect(Object.isFrozen(parsed?.actions)).toBe(true);
    input.push('undo');
    expect(parsed?.actions).toHaveLength(2);
  });
  it('toErrorReport carries the context actions', () => {
    const report = toErrorReport('drafts', errorAt('A.js:1:1'), 'save_draft', { ...CTX, actions: ['undo', 'redo'] });
    expect(report?.actions).toEqual(['undo', 'redo']);
  });
  it('keeps the largest valid report under MAX_REPORT_BYTES', () => {
    const longest = [...ACTIONS].sort((a, b) => b.length - a.length)[0];
    const frame = `${'a'.repeat(120)}.js:1234567:1234567`;
    const largest = {
      actions: Array(MAX_ACTIONS).fill(longest),
      area: 'sign_form_detection',
      name: 'A' + 'b'.repeat(63),
      stack: Array(MAX_FRAMES).fill(frame),
      step: 'a' + 'b'.repeat(31),
      tool: '/he/sign/',
      installed: true,
      sw: true,
      age: 'under_10m',
    };
    expect(parseErrorReport(largest)).not.toBeNull();
    const bytes = new TextEncoder().encode(JSON.stringify(largest)).length;
    expect(bytes).toBe(1538);
    expect(bytes).toBeLessThan(MAX_REPORT_BYTES);
  });
});
