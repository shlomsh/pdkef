import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckBox, CheckTerm } from './types.ts';

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  readSavedFile: vi.fn(),
  checkBoxesOnPage: vi.fn(),
  readGlyphs: vi.fn(),
  readTextItems: vi.fn(),
  readDocumentTraces: vi.fn(),
  openPdfDoc: vi.fn(),
  coveredTerms: vi.fn(),
  checkSavedFile: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock('../../../../editor/adapters/pdf/pdfjsLoader.js', () => ({ getPdfjs: async () => ({ getDocument: mocks.getDocument }) }));
vi.mock('../readGlyphs.js', () => ({ readGlyphs: mocks.readGlyphs }));
vi.mock('../../../../lib/pdfTextItems.ts', () => ({ readTextItems: mocks.readTextItems }));
vi.mock('../../../../editor/geometry/coords.ts', () => ({ pageGeometryFromPdfJsPage: () => ({ width: 100, height: 200 }) }));
vi.mock('../find/pageText.ts', () => ({ buildPageText: (pageIndex: number, items: unknown[]) => ({ pageIndex, items }) }));
vi.mock('./readSavedFile.ts', () => ({ readSavedFile: mocks.readSavedFile }));
vi.mock('./renderBoxes.ts', () => ({ checkBoxesOnPage: mocks.checkBoxesOnPage }));
vi.mock('../documentTraces.js', () => ({ readDocumentTraces: mocks.readDocumentTraces }));
vi.mock('../../../../lib/openPdfDoc', () => ({ openPdfDoc: mocks.openPdfDoc }));
vi.mock('./coveredTerms.ts', () => ({ coveredTerms: mocks.coveredTerms }));
vi.mock('./checkSavedFile.ts', () => ({ checkSavedFile: mocks.checkSavedFile }));

import { runSavedFileCheck } from './runCheck.ts';

const term = (label: string, source: CheckTerm['source'] = 'covered'): CheckTerm => ({
  label,
  source,
  finder: { test: () => true } as unknown as CheckTerm['finder'],
});
const box = (pageIndex: number, type: CheckBox['type'] = 'blackout'): CheckBox => ({ pageIndex, type } as CheckBox);

const originalDoc = (pages: number) => ({
  numPages: pages,
  getPage: async (n: number) => ({ n }),
}) as never;

function run(overrides: Record<string, unknown> = {}) {
  return runSavedFileCheck({
    originalDoc: originalDoc(2),
    savedBytes: new Uint8Array([1, 2]),
    originalBytes: new Uint8Array([3]),
    boxes: [box(0)],
    extraTerms: [],
    picturePages: [],
    ...overrides,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  const savedDoc = { getPage: async (n: number) => ({ saved: n }) };
  mocks.getDocument.mockReturnValue({ promise: Promise.resolve(savedDoc), destroy: mocks.destroy });
  mocks.readSavedFile.mockResolvedValue({ pages: [], places: [], picturePages: [], attachmentCount: 0 });
  mocks.checkBoxesOnPage.mockResolvedValue([{ boxIndex: 0, solid: true }]);
  mocks.readGlyphs.mockResolvedValue([{ g: 1 }]);
  mocks.readTextItems.mockResolvedValue([{ str: 'hi' }, { notText: true }]);
  mocks.coveredTerms.mockReturnValue([]);
  mocks.checkSavedFile.mockReturnValue([]);
  mocks.openPdfDoc.mockImplementation(async (bytes: Uint8Array) => ({ doc: { bytes } }));
  mocks.readDocumentTraces.mockImplementation((doc: { bytes: Uint8Array }) => ({ from: doc.bytes[0] }));
});

describe('runSavedFileCheck', () => {
  it('reads every original page into the context, keeping only text items', async () => {
    const out = await run();
    expect(out.context.original).toHaveLength(2);
    expect(out.context.original[0]).toMatchObject({ text: { pageIndex: 0, items: [{ str: 'hi' }] }, geometry: { width: 100, height: 200 } });
    expect(out.context.boxes).toHaveLength(1);
    expect(out.context.saved).toEqual({ pages: [], places: [], picturePages: [], attachmentCount: 0 });
  });

  it('reads glyphs for boxed pages even over the budget, and gives only boxed pages to coveredTerms', async () => {
    await run({ boxes: [box(1)] });
    const pages = mocks.coveredTerms.mock.calls[0][0];
    expect(pages).toHaveLength(1);
    expect(pages[0].boxes).toEqual([box(1)]);
  });

  it('skips a boxed page whose glyphs cannot be read', async () => {
    mocks.readGlyphs.mockResolvedValue(null);
    const out = await run();
    expect(mocks.coveredTerms.mock.calls[0][0]).toEqual([]);
    expect(out.context.original[0].glyphs).toBeNull();
  });

  it('hands the saved bytes and picture pages to readSavedFile', async () => {
    await run({ picturePages: [1] });
    expect(mocks.readSavedFile.mock.calls[0][2]).toEqual({ picturePages: [1], bytes: new Uint8Array([1, 2]) });
  });

  it('flags a page whose solid box is not one flat colour, once per page', async () => {
    mocks.checkBoxesOnPage.mockResolvedValue([{ boxIndex: 0, solid: true }, { boxIndex: 1, solid: false }]);
    const out = await run({ boxes: [box(0), box(0), box(1)] });
    expect(out.unsolidPages).toEqual([0, 1]);
    expect(mocks.checkBoxesOnPage).toHaveBeenCalledTimes(2);
  });

  it('never checks blur boxes for solidity', async () => {
    const out = await run({ boxes: [box(0, 'blur')] });
    expect(mocks.checkBoxesOnPage).not.toHaveBeenCalled();
    expect(out.unsolidPages).toEqual([]);
  });

  it('checks covered and extra terms together, dropping repeats by label', async () => {
    mocks.coveredTerms.mockReturnValue([term('Secret')]);
    await run({ extraTerms: [term('secret ', 'deleted'), term('Other', 'deleted')] });
    const input = mocks.checkSavedFile.mock.calls[0][0];
    expect(input.terms.map((t: CheckTerm) => t.label)).toEqual(['Secret', 'Other']);
  });

  it('returns the results and traces of both files', async () => {
    mocks.checkSavedFile.mockReturnValue([{ term: term('x'), findings: [] }]);
    const out = await run();
    expect(out.results).toHaveLength(1);
    expect(out.traces).toEqual({ original: { from: 3 }, saved: { from: 1 } });
    expect(mocks.openPdfDoc.mock.calls[0][1]).toEqual({ updateMetadata: false, fast: true });
  });

  it('passes the measure through to the context and the check', async () => {
    const measure = vi.fn();
    const out = await run({ measure });
    expect(out.context.measure).toBe(measure);
    expect(mocks.checkSavedFile.mock.calls[0][0].measure).toBe(measure);
  });

  it('destroys the loading task even when reading the saved file fails', async () => {
    mocks.readSavedFile.mockRejectedValue(new Error('boom'));
    await expect(run()).rejects.toThrow('boom');
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
  });
});
