import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as lib from '@cantoo/pdf-lib';

vi.mock('../telemetry/maintenanceTelemetry', { spy: true });

import { reportMaintenanceEvent } from '../telemetry/maintenanceTelemetry';
import { loadPdfWithPages } from './loadPdfPages';
import {
  healthy,
  noPagesKey,
  noRoot,
  ORIGINAL_WIDTHS,
  pagesRefMissing,
  pagesWrongType,
  twoRoots,
} from '../../test/support/pdfPageTreeFixtures';

const widths = async (bytes: ArrayBuffer | Uint8Array) =>
  (await lib.PDFDocument.load(bytes, { ignoreEncryption: true })).getPages().map((p) => p.getSize().width);

// A file whose page list is lost and whose trailer names an /Encrypt dictionary: pdf-lib opens it with
// ignoreEncryption and reports isEncrypted, and the one surviving /Pages root would repair it if it were not encrypted.
const encryptedNoPages = () => {
  const plain = new TextDecoder('latin1').decode(noPagesKey());
  const withEncrypt = plain.replace('endobj\nxref', 'endobj\n6 0 obj\n<< /Filter /Standard /V 1 /R 2 /P -4 >>\nendobj\nxref').replace('/Root 1 0 R', '/Root 1 0 R /Encrypt 6 0 R');
  return Uint8Array.from(withEncrypt, (c) => c.charCodeAt(0));
};

const sent = () => vi.mocked(reportMaintenanceEvent).mock.calls.map(([event]) => event);

beforeEach(() => {
  vi.mocked(reportMaintenanceEvent).mockClear();
});

describe('loadPdfWithPages', () => {
  it('leaves a healthy file alone', async () => {
    const input = new Uint8Array(healthy());
    const r = await loadPdfWithPages(input);
    expect(r.repaired).toBe(false);
    expect(r.bytes).toBe(input);
    expect(r.pageCount).toBe(3);
    expect(sent()).toEqual([]);
  });

  it.each([
    ['A', noPagesKey, 'no_pages_key'],
    ['B', pagesRefMissing, 'pages_ref_missing'],
    ['C1', pagesWrongType, 'pages_wrong_type'],
  ])('variant %s is repaired, saved in order, and reported', async (_n, make, shape) => {
    const r = await loadPdfWithPages(new Uint8Array(make()));
    expect(r.repaired).toBe(true);
    expect(r.pageCount).toBe(3);
    expect(await widths(r.bytes)).toEqual(ORIGINAL_WIDTHS);
    expect(sent()).toEqual([{ name: 'pdf_page_tree', properties: { outcome: 'repaired', shape, roots: 'one' } }]);
  });

  it('rethrows the original error and reports roots none when nothing survives', async () => {
    await expect(loadPdfWithPages(new Uint8Array(noRoot()))).rejects.toThrow(lib.UnexpectedObjectTypeError);
    expect(sent()).toEqual([{ name: 'pdf_page_tree', properties: { outcome: 'failed', shape: 'pages_ref_missing', roots: 'none' } }]);
  });

  it('does not repair two parentless roots', async () => {
    await expect(loadPdfWithPages(new Uint8Array(twoRoots()))).rejects.toThrow();
    expect(sent()).toEqual([{ name: 'pdf_page_tree', properties: { outcome: 'failed', shape: 'pages_ref_missing', roots: 'several' } }]);
  });

  it('rethrows an encrypted document without an event', async () => {
    // Live control: the file really opens as encrypted, with its page list lost.
    const control = await lib.PDFDocument.load(encryptedNoPages(), { ignoreEncryption: true });
    expect(control.isEncrypted).toBe(true);
    expect(() => control.getPageCount()).toThrow();
    await expect(loadPdfWithPages(encryptedNoPages())).rejects.toThrow();
    expect(sent()).toEqual([]);
  });
});
