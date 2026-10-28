import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as lib from '@cantoo/pdf-lib';

const sent = vi.hoisted(() => [] as unknown[]);
vi.mock('../telemetry/maintenanceTelemetry', () => ({
  pdfPageTreeRepaired: (shape: string) => ({ name: 'pdf_page_tree', outcome: 'repaired', shape }),
  pdfPageTreeFailed: (shape: string, roots: string) => ({ name: 'pdf_page_tree', outcome: 'failed', shape, roots }),
  reportMaintenanceEvent: (event: unknown) => void sent.push(event),
  beaconMaintenanceTransport: () => undefined,
}));

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

beforeEach(() => {
  sent.length = 0;
});

describe('loadPdfWithPages', () => {
  it('leaves a healthy file alone', async () => {
    const input = new Uint8Array(healthy());
    const r = await loadPdfWithPages(input);
    expect(r.repaired).toBe(false);
    expect(r.bytes).toBe(input);
    expect(r.pageCount).toBe(3);
    expect(sent).toEqual([]);
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
    expect(sent).toEqual([{ name: 'pdf_page_tree', outcome: 'repaired', shape }]);
  });

  it('rethrows the original error and reports roots none when nothing survives', async () => {
    await expect(loadPdfWithPages(new Uint8Array(noRoot()))).rejects.toThrow(lib.UnexpectedObjectTypeError);
    expect(sent).toEqual([{ name: 'pdf_page_tree', outcome: 'failed', shape: 'pages_ref_missing', roots: 'none' }]);
  });

  it('does not repair two parentless roots', async () => {
    await expect(loadPdfWithPages(new Uint8Array(twoRoots()))).rejects.toThrow();
    expect(sent).toEqual([{ name: 'pdf_page_tree', outcome: 'failed', shape: 'pages_ref_missing', roots: 'several' }]);
  });

  it('rethrows an encrypted document without an event', async () => {
    // isEncrypted is an instance field set at load; flag the loaded doc instead of building an encrypted file.
    const realLoad = lib.PDFDocument.load.bind(lib.PDFDocument);
    const spy = vi.spyOn(lib.PDFDocument, 'load').mockImplementation(async (...args) => {
      const doc = await realLoad(...args);
      (doc as { isEncrypted: boolean }).isEncrypted = true;
      return doc;
    });
    try {
      await expect(loadPdfWithPages(new Uint8Array(noPagesKey()))).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
    expect(sent).toEqual([]);
  });
});
