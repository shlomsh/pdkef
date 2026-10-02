// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyPdfOpen, probeEncryption } from './pdfEncryption';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./__fixtures__/encrypted/${name}.pdf`, import.meta.url)));
// pdf.js's legacy build runs under Node with its own fake worker; the app loads the modern build.
const legacyPdfjs = () => import('pdfjs-dist/legacy/build/pdf.mjs') as never;

describe('classifyPdfOpen', () => {
  it('reads null permissions as open and any permission set as owner-restricted', () => {
    expect(classifyPdfOpen({ opened: true, permissions: null })).toBe('open');
    expect(classifyPdfOpen({ opened: true, permissions: new Set() })).toBe('owner-restricted');
    expect(classifyPdfOpen({ opened: true, permissions: new Set([4]) })).toBe('owner-restricted');
  });

  it('maps pdf.js errors by name', () => {
    expect(classifyPdfOpen({ opened: false, error: { name: 'PasswordException', code: 1 } })).toBe('needs-password');
    for (const name of ['InvalidPDFException', 'MissingPDFException', 'FormatError']) {
      expect(classifyPdfOpen({ opened: false, error: { name } })).toBe('unreadable');
    }
  });

  it('rethrows an error it cannot classify', () => {
    const boom = new TypeError('worker died');
    expect(() => classifyPdfOpen({ opened: false, error: boom })).toThrow(boom);
  });
});

describe('probeEncryption on real files', () => {
  it('says a file that needs a password needs one', async () => {
    expect(await probeEncryption(fixture('needs-password'), legacyPdfjs)).toBe('needs-password');
  });

  it('says an owner-password-only file is owner-restricted', async () => {
    expect(await probeEncryption(fixture('owner-only'), legacyPdfjs)).toBe('owner-restricted');
  });

  it('says a plain file is open', async () => {
    expect(await probeEncryption(fixture('plain'), legacyPdfjs)).toBe('open');
  });

  it('says a truncated or non-PDF file is unreadable', async () => {
    expect(await probeEncryption(fixture('truncated'), legacyPdfjs)).toBe('unreadable');
    expect(await probeEncryption(new TextEncoder().encode('not a pdf'), legacyPdfjs)).toBe('unreadable');
    expect(await probeEncryption(new Uint8Array(), legacyPdfjs)).toBe('unreadable');
  });

  it('leaves the caller bytes usable', async () => {
    const bytes = fixture('plain');
    await probeEncryption(bytes, legacyPdfjs);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
