import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildDocument } from './documents.js';
import { DOCUMENT_CASES, ELEMENT_CASES } from './corpus.js';
import { detectFormFields } from '../detectFormFields.ts';
import { detectWidgetRegions } from '../formWidgets.js';

/**
 * The corpus runner. `README.md` has the paradigm; `corpus.js` has the cases.
 *
 * Nothing case-specific lives here on purpose: a new element is a row in
 * `corpus.js`, never a new test body, which is what keeps the cost of adding
 * one low enough that people actually do it.
 *
 * ARCH-24: every case now runs through `detectFormFields` (`../detectFormFields.ts`),
 * the product's own entry point - the same function `useFormFieldRegions.ts`
 * and the scored corpus (`scoring/score.js`) call. There is no longer a
 * second `detectPage` re-assembling the pipeline for the tests alone.
 * `detectFormFields` detects a whole document at once and tags every region
 * with the page it came from, so a case reads its own page back out of the
 * combined result by `pageIndex` rather than calling the detector once per
 * page.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

/** Every region a result reported, whichever kind or source found it. */
const allRegions = ({ combs, cells, checkboxes }) => [...combs, ...cells, ...checkboxes];

/** How many of each kind a result reported. */
const countRegions = ({ combs, cells, checkboxes }) => ({
  combs: combs.length,
  cells: cells.length,
  checkboxes: checkboxes.length,
});

/** `found`, restricted to one page - every region already carries its own `pageIndex`. */
function onPage(found, pageIndex) {
  return {
    combs: found.combs.filter((region) => region.pageIndex === pageIndex),
    checkboxes: found.checkboxes.filter((region) => region.pageIndex === pageIndex),
    cells: found.cells.filter((region) => region.pageIndex === pageIndex),
  };
}

/**
 * `textRuns`, sized to the document's real page count. `detectFormFields`
 * never defaults a missing page, so every page needs an entry even when a
 * case has nothing to say about it. Only page 0 ever carries a case's own
 * `text` (README's "Two things to know"); no case needs multi-page text yet.
 */
function textRunsFor(doc, text) {
  return Array.from({ length: doc.getPageCount() }, (_, pageIndex) => (pageIndex === 0 ? (text ?? []) : []));
}

describe.each(ELEMENT_CASES)('$group: $name', (testCase) => {
  it(testCase.why, async () => {
    const doc = await buildDocument(testCase.doc);
    const expected = testCase.perPage ?? [testCase.expect];
    expect(doc.getPageCount()).toBe(expected.length);

    // A case may declare `text` - page-percent runs in the same shape
    // `detectFormFields`'s `textRuns` takes - when the element it pins is
    // text-plus-geometry (README's "Two things to know"). Every other case
    // leaves it undefined and gets `[]`, same as before.
    const found = await detectFormFields(doc, { textRuns: textRunsFor(doc, testCase.text) });
    expected.forEach((expectation, pageIndex) => {
      const pageFound = onPage(found, pageIndex);
      expect(countRegions(pageFound), `page ${pageIndex}`).toEqual(expectation);
      // Whatever a page reports carries that page's index, always. A region
      // that lands on the wrong page puts a hint on a document someone is not
      // looking at, which no count assertion above would notice.
      expect(allRegions(pageFound).every((region) => region.pageIndex === pageIndex)).toBe(true);
      if (testCase.comb) expect(pageFound.combs[0]).toMatchObject(testCase.comb);
    });
  });
});

describe('every region is a sane rectangle, whatever found it', () => {
  it.each(ELEMENT_CASES)('$group: $name', async (testCase) => {
    const doc = await buildDocument(testCase.doc);
    const found = await detectFormFields(doc, { textRuns: textRunsFor(doc) });
    for (const region of allRegions(found)) {
      // A region with a zero or negative side renders as a hint nobody can
      // tap, and an unnoticed sign error in a transform looks exactly like
      // this. It must also intersect the visible page at all - but not sit
      // wholly inside it: a widget whose `/Rect` pokes past the crop box is
      // ordinary (pdf-lib insets a bordered field by half its border width,
      // which is enough on its own), and clamping it here would hide a real
      // transform error behind a tidy-looking number.
      const where = `${testCase.group}: ${testCase.name} ${JSON.stringify(region)}`;
      expect(region.width, where).toBeGreaterThan(0);
      expect(region.height, where).toBeGreaterThan(0);
      expect(Number.isFinite(region.left) && Number.isFinite(region.top), where).toBe(true);
      expect(region.left, where).toBeLessThan(100);
      expect(region.top, where).toBeLessThan(100);
      expect(region.left + region.width, where).toBeGreaterThan(0);
      expect(region.top + region.height, where).toBeGreaterThan(0);
    }
  });
});

describe('real documents', () => {
  it.each(DOCUMENT_CASES)('$name', async (documentCase) => {
    const bytes = fs.readFileSync(path.join(repoRoot, ...documentCase.file));
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const found = onPage(await detectFormFields(doc, { textRuns: textRunsFor(doc) }), 0);

    if (documentCase.expect) expect(countRegions(found)).toEqual(documentCase.expect);
    if (documentCase.widgetFree) {
      // The two scored flat forms carry no widget at all, which is what makes
      // the widget pass a provable no-op on them - and therefore what lets the
      // recall and precision numbers in docs/mobi-10-field-map-spike.md stand
      // unchanged since the widget source was added.
      expect(detectWidgetRegions(doc.getPage(0), 0)).toEqual({ combs: [], cells: [] });
    }
  });
});

/**
 * The corpus as a whole, so it cannot rot into something that asserts nothing.
 *
 * Most rows assert a count, and a zero is a real assertion - but a refactor
 * that broke detection outright would turn many rows green-by-accident if
 * their expectations were all zero. These two guards say the corpus is still
 * looking at something.
 */
describe('the corpus is not vacuous', () => {
  it('has rows that expect something detected, and rows that expect nothing', () => {
    const totals = ELEMENT_CASES.flatMap((entry) => entry.perPage ?? [entry.expect]);
    const found = totals.filter((e) => e.combs + e.cells + e.checkboxes > 0);
    const empty = totals.filter((e) => e.combs + e.cells + e.checkboxes === 0);
    expect(found.length).toBeGreaterThanOrEqual(15);
    expect(empty.length).toBeGreaterThanOrEqual(7);
  });

  it('covers all three region kinds from both sources', async () => {
    const seen = { combs: new Set(), cells: new Set(), checkboxes: new Set() };
    for (const testCase of ELEMENT_CASES) {
      const doc = await buildDocument(testCase.doc);
      const hasWidgets = (testCase.doc.pages ?? [testCase.doc]).some((page) => page.widgets?.length);
      const source = hasWidgets ? 'widget' : 'ink';
      const found = await detectFormFields(doc, { textRuns: textRunsFor(doc) });
      for (let pageIndex = 0; pageIndex < doc.getPageCount(); pageIndex += 1) {
        const pageFound = onPage(found, pageIndex);
        for (const kind of ['combs', 'cells', 'checkboxes']) {
          if (pageFound[kind].length > 0) seen[kind].add(source);
        }
      }
    }
    // Combs and cells must both be reachable from ink and from widgets;
    // checkboxes only ever come from ink or /Annots, which this harness
    // reports together, so one source is all there is to see.
    expect([...seen.combs].sort()).toEqual(['ink', 'widget']);
    expect([...seen.cells].sort()).toEqual(['ink', 'widget']);
    expect(seen.checkboxes.size).toBeGreaterThan(0);
  });
});
