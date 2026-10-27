import { describe, expect, it } from 'vitest';
import * as lib from '@cantoo/pdf-lib';
import { diagnosePageTree, repairPageTree } from './pdfPageTree';
import {
  healthy,
  inheritedBox,
  noPagesKey,
  noRoot,
  ORIGINAL_WIDTHS,
  pagesRefMissing,
  pagesWrongType,
  twoRoots,
} from '../test/support/pdfPageTreeFixtures';

const load = (bytes: Uint8Array) => lib.PDFDocument.load(bytes, { ignoreEncryption: true });
const widths = async (bytes: Uint8Array) =>
  (await load(bytes)).getPages().map((p) => p.getSize().width);

describe('diagnosePageTree', () => {
  it('returns null when /Pages resolves to a dictionary', async () => {
    expect(diagnosePageTree(await load(healthy()), lib)).toBeNull();
  });

  it.each([
    ['no /Pages key', noPagesKey, 'no_pages_key'],
    ['/Pages to a missing object', pagesRefMissing, 'pages_ref_missing'],
    ['/Pages to a number', pagesWrongType, 'pages_wrong_type'],
  ] as const)('%s -> %s with one root', async (_n, make, shape) => {
    expect(diagnosePageTree(await load(make()), lib)).toEqual({ shape, roots: 'one' });
  });

  it('counts none and several roots', async () => {
    expect(diagnosePageTree(await load(noRoot()), lib)).toEqual({ shape: 'pages_ref_missing', roots: 'none' });
    expect(diagnosePageTree(await load(twoRoots()), lib)).toEqual({ shape: 'pages_ref_missing', roots: 'several' });
  });
});

describe('repairPageTree', () => {
  it.each([
    ['A', noPagesKey],
    ['B', pagesRefMissing],
    ['C1', pagesWrongType],
  ])('variant %s: repaired, original page order kept after save', async (_n, make) => {
    const doc = await load(make());
    expect(repairPageTree(doc, lib)).toBe(true);
    expect(await widths(await doc.save())).toEqual(ORIGINAL_WIDTHS);
  });

  it('G: pages without a MediaBox keep the one they inherit', async () => {
    const doc = await load(inheritedBox());
    expect(repairPageTree(doc, lib)).toBe(true);
    expect(await widths(await doc.save())).toEqual([250, 300, 400]);
  });

  it('works after getPageCount already threw (pdf-lib caches pages)', async () => {
    const doc = await load(noPagesKey());
    expect(() => doc.getPageCount()).toThrow();
    expect(repairPageTree(doc, lib)).toBe(true);
    expect(doc.getPageCount()).toBe(3);
  });

  it('does not guess when no root survives', async () => {
    expect(repairPageTree(await load(noRoot()), lib)).toBe(false);
  });

  it('does not pick between two roots', async () => {
    const doc = await load(twoRoots());
    expect(repairPageTree(doc, lib)).toBe(false);
    expect(diagnosePageTree(doc, lib)?.roots).toBe('several');
  });
});
