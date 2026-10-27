import { describe, expect, it } from 'vitest';
import { exportAtRevision, handoffHref, signExportReady, exportToHandOff } from './exportHandoff.ts';

const signed = { blob: new Blob(['x']), name: 'signed_a.pdf', revision: 3 };

describe('exportAtRevision', () => {
  it('keeps the export while the document is the one it was made from', () => {
    expect(exportAtRevision(signed, 3)).toBe(signed);
  });

  it('drops it the moment the document changes, so a stale file is never handed off', () => {
    expect(exportAtRevision(signed, 4)).toBeNull();
  });

  it('is null when nothing was exported', () => {
    expect(exportAtRevision(null, 0)).toBeNull();
  });
});

describe('handoffHref', () => {
  it('goes to the plain tool page from the English Sign page', () => {
    expect(handoffHref('compress', '/sign/')).toBe('/compress/');
    expect(handoffHref('redact', '/sign/')).toBe('/redact/');
  });

  it('keeps the Hebrew prefix only where the target has a Hebrew page', () => {
    expect(handoffHref('compress', '/he/sign/')).toBe('/he/compress/');
    expect(handoffHref('redact', '/he/sign/')).toBe('/redact/');
  });
});

describe('signExportReady', () => {
  const ready = { status: 'editing' as const, elementCount: 1, blocked: false };

  it('is ready when there is something to export and Download would be enabled', () => {
    expect(signExportReady(ready)).toBe(true);
  });

  it('is not ready with nothing placed', () => {
    expect(signExportReady({ ...ready, elementCount: 0 })).toBe(false);
  });

  it('is not ready while the export is blocked', () => {
    expect(signExportReady({ ...ready, blocked: true })).toBe(false);
  });

  it('is not ready while loading, signing or after an error', () => {
    for (const status of ['idle', 'loading', 'signing', 'error'] as const) {
      expect(signExportReady({ ...ready, status })).toBe(false);
    }
  });
});

describe('exportToHandOff', () => {
  const made = { blob: new Blob(['x']), name: 'signed_a.pdf', revision: 3 };
  const other = { blob: new Blob(['y']), name: 'signed_b.pdf', revision: 2 };

  it('prefers the recorded export for this revision', () => {
    expect(exportToHandOff(made, other, 3)).toBe(made);
  });

  it('falls back to the prepared share file when it is for this revision', () => {
    expect(exportToHandOff(other, made, 3)).toBe(made);
  });

  it('is null when neither matches, so the export has to run', () => {
    expect(exportToHandOff(other, null, 3)).toBeNull();
    expect(exportToHandOff(null, null, 0)).toBeNull();
  });
});
