import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_REPORTS_PER_PAGE,
  parseErrorReport,
  readPageContext,
  reportError,
  resetErrorReportingForTests,
  setReportingEnabledForTests,
  toErrorReport,
  type PageContext,
} from './errorReport.ts';

function errorAt(frame: string, message = 'boom', name?: string): Error {
  const e = new TypeError(message);
  if (name) e.name = name;
  e.stack = `${e.name}: ${message}\n    at f (https://pdkef.com/_astro/${frame})`;
  return e;
}

const CTX: PageContext = { tool: '/sign/', installed: false, sw: true, age: 'under_1m' };

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
  it('falls back when matchMedia throws', () => {
    stubPage('/sign/', () => {
      throw new Error('no');
    });
    expect(readPageContext()).toEqual({ tool: '/', installed: false, sw: false, age: 'under_10s' });
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
