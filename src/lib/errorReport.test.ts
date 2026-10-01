import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_REPORTS_PER_PAGE,
  parseErrorReport,
  reportError,
  resetErrorReportingForTests,
  setReportingEnabledForTests,
  toErrorReport,
} from './errorReport.ts';

function errorAt(frame: string, message = 'boom', name?: string): Error {
  const e = new TypeError(message);
  if (name) e.name = name;
  e.stack = `${e.name}: ${message}\n    at f (https://pdkef.com/_astro/${frame})`;
  return e;
}

describe('toErrorReport', () => {
  it('carries no message text', () => {
    const e = errorAt('PdfSignTool.Ab12Cd.js:12:345', 'Cannot read "Social Security Number" of /Users/me/tax return 2024.pdf');
    const report = toErrorReport('sign_export', e);
    expect(report).toEqual({ area: 'sign_export', name: 'TypeError', frame: 'PdfSignTool.Ab12Cd.js:12:345' });
    const json = JSON.stringify(report);
    for (const leak of ['Social', 'Users', 'tax', '2024.pdf', 'Cannot']) expect(json).not.toContain(leak);
  });
  it('drops ignored names, extension-only stacks and non-errors', () => {
    expect(toErrorReport('pdf_render', errorAt('A.js:1:1', 'x', 'PasswordException'))).toBeNull();
    const ext = new Error('x');
    ext.stack = 'Error: x\n at chrome-extension://abc/inject.js:1:2';
    expect(toErrorReport('uncaught', ext)).toBeNull();
    expect(toErrorReport('uncaught', 'a string')).toBeNull();
    expect(toErrorReport('uncaught', { name: 'TypeError' })).toBeNull();
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
    reportError('drafts', e);
    reportError('drafts', e);
    expect(beacon).toHaveBeenCalledTimes(1);
    const [path, blob] = beacon.mock.calls[0] as [string, Blob];
    expect(path).toBe('/api/report');
    expect(parseErrorReport(JSON.parse(await blob.text()))).toEqual({ area: 'drafts', name: 'TypeError', frame: 'A.js:1:2' });
  });
  it('caps the total per page', () => {
    for (let i = 0; i < MAX_REPORTS_PER_PAGE + 5; i++) reportError('drafts', errorAt(`A.js:${i + 1}:1`));
    expect(beacon).toHaveBeenCalledTimes(MAX_REPORTS_PER_PAGE);
  });
  it('does nothing offline or outside production', () => {
    vi.stubGlobal('navigator', { onLine: false, sendBeacon: beacon });
    reportError('drafts', errorAt('A.js:1:1'));
    vi.stubGlobal('navigator', { onLine: true, sendBeacon: beacon });
    setReportingEnabledForTests(false);
    reportError('drafts', errorAt('A.js:1:1'));
    expect(beacon).not.toHaveBeenCalled();
  });
  it('never throws', () => {
    beacon.mockImplementation(() => {
      throw new Error('nope');
    });
    expect(() => reportError('drafts', errorAt('A.js:1:1'))).not.toThrow();
  });
});

describe('parseErrorReport', () => {
  const ok = { area: 'drafts', name: 'TypeError', frame: 'A.1.js:1:2' };
  it('accepts the exact shape', () => expect(parseErrorReport(ok)).toEqual(ok));
  it('rejects extra keys, unknown areas, spaced names and slashed frames', () => {
    expect(parseErrorReport({ ...ok, message: 'x' })).toBeNull();
    expect(parseErrorReport({ ...ok, area: 'other' })).toBeNull();
    expect(parseErrorReport({ ...ok, name: 'Type Error' })).toBeNull();
    expect(parseErrorReport({ ...ok, frame: '/_astro/A.js:1:2' })).toBeNull();
  });
});
