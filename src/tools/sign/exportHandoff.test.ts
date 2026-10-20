import { describe, expect, it } from 'vitest';
import { exportAtRevision, handoffHref } from './exportHandoff.ts';

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
