import { describe, expect, it } from 'vitest';
import { buildDocument } from './documents.js';
import { ELEMENT_CASES } from './corpus.js';
import { detectFormFields, DEFAULT_SOURCES } from '../detectFormFields.ts';

/**
 * ARCH-24 step C's acceptance line: "a third source can be added without
 * touching `useFormFieldRegions` - demonstrated by a stub source in the
 * corpus, not asserted in prose." Both stubs below live only in this file:
 * production's `DEFAULT_SOURCES` (`detectFormFields.ts`) is never touched,
 * and neither is `useFormFieldRegions.ts` - every case here reaches a third
 * source only through `detectFormFields`'s own public `sources` option,
 * exactly the door a real OCR or metadata source would use.
 *
 * Two things a source can do, two things to prove:
 *
 * 1. A source that finds nothing must change nothing - every existing
 *    element-corpus case, run with and without it, comes back identical.
 * 2. A source that finds something is folded in through the same declared
 *    precedence `ink` and `widgets` already are - `SOURCE_ORDER` and
 *    `KIND_PRECEDENCE` in `fieldRegions.js` - including when what it finds
 *    conflicts with what `ink` already found.
 */

/** `textRuns`, sized to the document's page count - `corpus.test.js`'s own helper, unchanged. */
function textRunsFor(doc, text) {
  return Array.from({ length: doc.getPageCount() }, (_, pageIndex) => (pageIndex === 0 ? (text ?? []) : []));
}

/** A source that reports nothing on any page, ever. */
const emptyStub = {
  name: 'stub',
  async detect() {
    return { combs: [], checkboxes: [], cells: [] };
  },
};

describe('a third source that finds nothing leaves every corpus case unchanged', () => {
  it.each(ELEMENT_CASES)('$group: $name', async (testCase) => {
    const doc = await buildDocument(testCase.doc);
    const runs = textRunsFor(doc, testCase.text);
    const withoutStub = await detectFormFields(doc, { textRuns: runs, sources: DEFAULT_SOURCES });
    const withStub = await detectFormFields(doc, { textRuns: runs, sources: [...DEFAULT_SOURCES, emptyStub] });
    expect(withStub).toEqual(withoutStub);
  });
});

describe('a third source that finds something is folded in by declared precedence', () => {
  it('a stand-alone region from the stub appears, on an otherwise empty page', async () => {
    const doc = await buildDocument({});
    const runs = textRunsFor(doc);
    const region = { pageIndex: 0, left: 10, top: 10, width: 20, height: 5 };
    const stubCell = {
      name: 'stub',
      async detect(_page, context) {
        return context.pageIndex === 0
          ? { combs: [], checkboxes: [], cells: [{ ...region }] }
          : { combs: [], checkboxes: [], cells: [] };
      },
    };

    const withoutStub = await detectFormFields(doc, { textRuns: runs, sources: DEFAULT_SOURCES });
    expect(withoutStub).toEqual({ combs: [], checkboxes: [], cells: [] });

    const withStub = await detectFormFields(doc, { textRuns: runs, sources: [...DEFAULT_SOURCES, stubCell] });
    expect(withStub).toEqual({ combs: [], checkboxes: [], cells: [region] });
  });

  it('a comb from the stub claims a cell ink already found on the same rectangle', async () => {
    // One ruled row of three cells, from ink alone - the same spec as
    // corpus.js's "a ruled row of three cells" row.
    const doc = await buildDocument({ ink: [{ ink: 'cellRow', x: 40, y: 200, width: 240, height: 20, columns: 3 }] });
    const runs = textRunsFor(doc);

    const inkOnly = await detectFormFields(doc, { textRuns: runs, sources: DEFAULT_SOURCES });
    expect(inkOnly.cells).toHaveLength(3);
    expect(inkOnly.combs).toEqual([]);
    const [disputedCell] = inkOnly.cells;

    // A stub reporting a comb on the exact rectangle ink already reported as
    // a cell - the shape the brief asks for: "a comb overlapping an ink
    // cell". `SOURCE_ORDER` does not name 'stub', so it is appended after
    // `ink` and `widgets` (fieldRegions.js's `reconcile`, ARCH-24 step C);
    // KIND_PRECEDENCE still says a comb (protected) claims a cell
    // (reclaimable) it overlaps whichever source found either one, so it
    // wins this rectangle even though it is the later source.
    const stubComb = {
      name: 'stub',
      async detect(_page, context) {
        return context.pageIndex === 0
          ? { combs: [{ ...disputedCell, cells: 2, boxed: true }], checkboxes: [], cells: [] }
          : { combs: [], checkboxes: [], cells: [] };
      },
    };
    const withStub = await detectFormFields(doc, { textRuns: runs, sources: [...DEFAULT_SOURCES, stubComb] });

    expect(withStub.combs).toHaveLength(1);
    expect(withStub.combs[0]).toMatchObject({
      left: disputedCell.left, top: disputedCell.top, width: disputedCell.width, height: disputedCell.height,
    });
    // The other two ink cells are untouched; only the one the stub's comb
    // overlaps was reclaimed.
    expect(withStub.cells).toHaveLength(2);
    expect(withStub.cells).not.toContainEqual(disputedCell);
  });
});
