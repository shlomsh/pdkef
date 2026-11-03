import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GLYPH_BUDGET } from '../find/itemGlyphs.ts';
import { termFinder } from '../find/finders.ts';
import { PDFJS_WASM_URL } from '#lib/pdf/pdfjsWasm.js';
import { boxAroundLine, buildPdf, installCanvas, openOriginal, openedTasks } from '../../../../test/support/redactCheckPdfs.test-helper.ts';
import type { PageSpec } from '../../../../test/support/redactCheckPdfs.test-helper.ts';
import type { CheckBox, CheckTerm } from './types.ts';

// The one edge: getPdfjs() is the vite worker import, which node cannot run; the legacy build stands in.
vi.mock('#editor/adapters/pdf/pdfjsLoader.js', async () => {
  const { legacyPdfjs: stand } = await import('../../../../test/support/redactCheckPdfs.test-helper.ts');
  return { getPdfjs: async () => stand() };
});

import { runSavedFileCheck } from './runCheck.ts';

let restoreCanvas: () => void;
beforeAll(() => { restoreCanvas = installCanvas(); });
afterAll(() => restoreCanvas());

const blackout = (pageIndex: number, row: number, width?: number): CheckBox => ({ pageIndex, type: 'blackout', ...boxAroundLine(row, width) });

/** Builds the original and the saved file, runs the real check, and closes the original again. */
async function run(original: PageSpec[], saved: PageSpec[], rest: { boxes?: CheckBox[]; extraTerms?: CheckTerm[]; picturePages?: number[]; savedTitle?: string; originalTitle?: string; measure?: never } = {}) {
  const originalBytes = await buildPdf(original, { title: rest.originalTitle });
  const savedBytes = await buildPdf(saved, { title: rest.savedTitle });
  const { doc, close } = await openOriginal(originalBytes, PDFJS_WASM_URL);
  try {
    return await runSavedFileCheck({ originalDoc: doc, originalBytes, savedBytes, boxes: rest.boxes ?? [], extraTerms: rest.extraTerms ?? [], picturePages: rest.picturePages ?? [], measure: rest.measure });
  } finally {
    await close();
  }
}

const SECRET: PageSpec = { lines: ['Secret Alpha'] };

describe('runSavedFileCheck', () => {
  it('reads every original page into the context, with its text, size and the boxes', async () => {
    const boxes = [blackout(1, 0)];
    const out = await run([{ lines: ['Hello world'] }, { lines: ['Secret Beta'] }], [{}, {}], { boxes });
    expect(out.context.original).toHaveLength(2);
    expect(out.context.original[0].text.text).toContain('Hello world');
    expect(out.context.original[1].text.text).toContain('Secret Beta');
    expect(out.context.original[0].geometry).toMatchObject({ width: 400, height: 200 });
    expect(out.context.boxes).toBe(boxes);
  });

  it('reads the saved file into the context, and keeps the picture pages the export reported', async () => {
    const out = await run([SECRET, SECRET], [{ lines: ['Kept text'] }, {}], { picturePages: [1] });
    expect(out.context.saved.pages[0].text.text).toContain('Kept text');
    expect(out.context.saved.picturePages).toEqual([1]);
  });

  it('reads glyphs for every page while under the budget, and covered terms come only from boxed pages', async () => {
    const out = await run([{ lines: ['Secret Alpha'] }, { lines: ['Unboxed Words'] }], [{}, {}], { boxes: [blackout(0, 0)] });
    expect(out.context.original.every((page) => page.glyphs && page.glyphs.length > 0)).toBe(true);
    expect(out.results.map((r) => r.term.label)).toEqual(['Secret Alpha']);
  });

  it('reads glyphs for a boxed page even when the pages before it are over the glyph budget', async () => {
    // Page 0 alone holds more glyphs than the budget, so an unboxed page after it keeps none.
    const out = await run(
      [{ glyphRun: GLYPH_BUDGET + 1 }, { lines: ['Unboxed Words'] }, { lines: ['Secret Alpha'] }],
      [{}, {}, {}],
      { boxes: [blackout(2, 0)] },
    );
    expect(out.context.original[0].glyphs).toHaveLength(GLYPH_BUDGET + 1);
    expect(out.context.original[1].glyphs).toBeNull();
    expect(out.context.original[2].glyphs?.length).toBeGreaterThan(0);
    expect(out.results.map((r) => r.term.label)).toEqual(['Secret Alpha']);
  }, 60_000);

  it('gives no covered term for a boxed page whose text cannot be read', async () => {
    const originalBytes = await buildPdf([SECRET]);
    const { doc, close } = await openOriginal(originalBytes, PDFJS_WASM_URL);
    const page = await doc.getPage(1);
    page.getOperatorList = () => Promise.reject(new Error('broken content stream'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const out = await runSavedFileCheck({ originalDoc: doc, originalBytes, savedBytes: await buildPdf([{}]), boxes: [blackout(0, 0)], extraTerms: [], picturePages: [] });
      expect(out.context.original[0].glyphs).toBeNull();
      expect(out.results).toEqual([]);
    } finally {
      consoleError.mockRestore();
      await close();
    }
  });

  it('reports a Blackout that did not flatten as not solid, and a flattened one as solid', async () => {
    const boxes = [blackout(0, 0)];
    const flattened = await run([SECRET], [{ blackouts: [boxes[0]] }], { boxes });
    expect(flattened.unsolidPages).toEqual([]);
    // The saved page still shows "Secret Alpha" where the box was drawn.
    const unflattened = await run([SECRET], [SECRET], { boxes });
    expect(unflattened.unsolidPages).toEqual([0]);
  });

  it('checks each box against its own saved page', async () => {
    const boxes = [blackout(0, 0, 30), blackout(1, 1, 60)];
    // Both flattened, each at its own place: neither page is flagged.
    const both = await run([SECRET, SECRET], [{ blackouts: [boxes[0]] }, { blackouts: [boxes[1]] }], { boxes });
    expect(both.unsolidPages).toEqual([]);
    // Only page 0 flattened: page 1 is flagged, though page 0's page is the solid one.
    const second = await run([SECRET, SECRET], [{ blackouts: [boxes[0]] }, SECRET], { boxes });
    expect(second.unsolidPages).toEqual([1]);
    // Only page 1 flattened: page 0 is flagged.
    const first = await run([SECRET, SECRET], [SECRET, { blackouts: [boxes[1]] }], { boxes });
    expect(first.unsolidPages).toEqual([0]);
  });

  it('flags a page once, however many of its boxes are not solid', async () => {
    const boxes = [blackout(0, 0), blackout(0, 1), blackout(1, 0)];
    const out = await run([{ lines: ['Secret Alpha', 'Secret Beta'] }, SECRET], [{ lines: ['Secret Alpha', 'Secret Beta'] }, SECRET], { boxes });
    expect(out.unsolidPages).toEqual([0, 1]);
  });

  it('never flags a page for a blur box', async () => {
    const blur: CheckBox = { pageIndex: 0, type: 'blur', ...boxAroundLine(0) };
    const out = await run([SECRET], [SECRET], { boxes: [blur] });
    expect(out.unsolidPages).toEqual([]);
  });

  it('checks covered and extra terms together, dropping repeats by label', async () => {
    const out = await run(
      [{ lines: ['Secret Alpha', 'Other words'] }],
      [{ lines: ['Secret Alpha'] }],
      { boxes: [blackout(0, 0)], extraTerms: [
        { label: 'secret  alpha ', source: 'deleted', finder: termFinder('secret alpha') },
        { label: 'Other words', source: 'deleted', finder: termFinder('Other words') },
      ] },
    );
    expect(out.results.map((r) => [r.term.label, r.term.source])).toEqual([['Secret Alpha', 'covered'], ['Other words', 'deleted']]);
    // The saved file still carries "Secret Alpha" as text, and not the other words.
    expect(out.results.map((r) => r.findings.length)).toEqual([1, 0]);
  });

  it('returns what both files say about themselves', async () => {
    const out = await run([SECRET], [SECRET], { originalTitle: 'Original title', savedTitle: 'Saved title' });
    expect(out.traces.original.title).toBe('Original title');
    expect(out.traces.saved.title).toBe('Saved title');
  });

  it('passes the measure through to the context', async () => {
    const measure = vi.fn(() => 1) as never;
    const out = await run([SECRET], [SECRET], { measure });
    expect(out.context.measure).toBe(measure);
  });

  it('destroys the loading task even when checking the saved file fails', async () => {
    openedTasks.length = 0;
    // A box on a page the saved file does not have.
    await expect(run([SECRET, SECRET], [SECRET], { boxes: [blackout(1, 0)] })).rejects.toThrow();
    expect(openedTasks).toHaveLength(1);
    expect(openedTasks[0].destroyed).toBe(true);
  });
});
