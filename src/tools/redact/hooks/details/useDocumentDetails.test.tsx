import { render } from 'preact';
import { drainPromises } from '../../../../test/support/drainPromises.ts';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/telemetry/errorReport.ts', () => ({ reportError: vi.fn() }));
// Spy-through: the real reader runs on real bytes; the spy only shows whether it was asked to.
vi.mock('../../lib/details/readDetails.ts', { spy: true });

import { useDocumentDetails } from './useDocumentDetails.ts';
import { readDetails } from '../../lib/details/readDetails.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { PDFDocument } from '@cantoo/pdf-lib';
import { waitUntil } from '../../../../test/support/waitUntil.ts';

async function pdfTitled(title: string): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  doc.addPage([100, 100]);
  doc.setTitle(title);
  doc.setCreationDate(new Date('2020-01-02T03:04:05Z'));
  doc.setModificationDate(new Date('2020-01-02T03:04:05Z'));
  const saved = await doc.save();
  return saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer;
}

// Literal output of the real readDetails on pdfTitled('T'), captured once.
const DETAILS_OF_T = { title: 'T', author: null, subject: null, keywords: null, creator: 'pdf-lib (https://github.com/Hopding/pdf-lib)', producer: 'pdf-lib (https://github.com/Hopding/pdf-lib)', creationDate: { iso: '2020-01-02T03:04:05', offsetMinutes: 0 }, modDate: { iso: '2020-01-02T03:04:05', offsetMinutes: 0 }, otherInfoKeys: [], xmp: { present: false, hasHistory: false }, attachments: [], scripts: { document: false, pages: [] }, pieceInfo: false, thumbnails: [], pageDetails: [] };

let host: HTMLElement | null = null;
afterEach(() => {
  vi.mocked(readDetails).mockClear();
  vi.mocked(reportError).mockClear(); if (host) { render(null, host); host.remove(); host = null; } });

function Probe({ file, opened = true, seen }: { file: ArrayBuffer | null; opened?: boolean; seen: unknown[] }) {
  seen.push(useDocumentDetails(file, opened));
  return null;
}

describe('useDocumentDetails', () => {
  it('returns null, then the traces once read', async () => {
    const seen: unknown[] = [];
    host = document.createElement('div');
    const file = await pdfTitled('T');
    await act(async () => { render(<Probe file={file} seen={seen} />, host!); });
    await waitUntil(() => seen[seen.length - 1] !== null);
    expect(seen[0]).toBeNull();
    expect(seen[seen.length - 1]).toEqual(DETAILS_OF_T);
    expect(readDetails).toHaveBeenCalledWith(file);
  });

  it('stays null with no file', async () => {
    const seen: unknown[] = [];
    host = document.createElement('div');
    await act(async () => { render(<Probe file={null} seen={seen} />, host!); });
    expect(seen.every((value) => value === null)).toBe(true);
  });

  // RED-64 (ENC-02): a protected file never opens in pdf.js, so it must never reach pdf-lib here.
  it('reads nothing until the document has opened', async () => {
    const seen: unknown[] = [];
    host = document.createElement('div');
    const file = await pdfTitled('Later');
    await act(async () => { render(<Probe file={file} opened={false} seen={seen} />, host!); });
    await act(async () => { await drainPromises(); });
    expect(readDetails).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
    expect(seen.every((value) => value === null)).toBe(true);
    await act(async () => { render(<Probe file={file} opened seen={seen} />, host!); });
    await waitUntil(() => seen[seen.length - 1] !== null);
    expect(seen[seen.length - 1]).toEqual({ ...DETAILS_OF_T, title: 'Later' });
    expect(readDetails).toHaveBeenCalledWith(file);
  });
});
