import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildDocument } from './documents.js';
import { DOCUMENT_CASES, ELEMENT_CASES } from './corpus.js';
import { detectPageRegions } from '../formGrid.js';
import { detectWidgetRegions } from '../formWidgets.js';
import { detectCellCandidates } from '../formCells.js';
import { reconcileFields, withWidgetFields } from '../fieldRegions.js';
import { collectPageInk, pageCropBox } from '../pageInk.js';
import { createPageGeometry } from '../../../geometry/coords.ts';

/**
 * The corpus runner. `README.md` has the paradigm; `corpus.js` has the cases.
 *
 * Nothing case-specific lives here on purpose: a new element is a row in
 * `corpus.js`, never a new test body, which is what keeps the cost of adding
 * one low enough that people actually do it.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

/**
 * Exactly what `useFormFieldRegions` does per page, minus the pdf.js text pass.
 *
 * Text is left out deliberately. It feeds `formCells.js`'s label lookup and
 * its "this cell is explanatory, drop it" filter, so including it would make
 * every row depend on a second parser and on whatever prose a fixture happens
 * to carry - and the detector's *geometry*, which is what this corpus is
 * about, does not read text at all. The cost is that a few cells a real page
 * would filter out survive here; the three real documents below are where
 * that path is exercised.
 *
 * If this drifts from the hook, the corpus is measuring something the product
 * does not do, so it is worth re-reading both when either changes.
 */
function detectPage(page, pageIndex = 0) {
  const ink = detectPageRegions(page, pageIndex);
  const geometry = createPageGeometry({
    cropBox: pageCropBox(page),
    rotation: page.getRotation().angle,
  });
  const cells = detectCellCandidates(collectPageInk(page), geometry, pageIndex, []);
  const reconciled = reconcileFields({ combs: ink.combs, checkboxes: ink.checkboxes, cells });
  const merged = withWidgetFields({ ...reconciled, checkboxes: ink.checkboxes }, detectWidgetRegions(page, pageIndex));
  return { combs: merged.combs, cells: merged.cells, checkboxes: ink.checkboxes };
}

const counts = ({ combs, cells, checkboxes }) => ({
  combs: combs.length,
  cells: cells.length,
  checkboxes: checkboxes.length,
});

/** Every region a page reported, for the geometry assertions below. */
const allRegions = ({ combs, cells, checkboxes }) => [...combs, ...cells, ...checkboxes];

describe.each(ELEMENT_CASES)('$group: $name', (testCase) => {
  it(testCase.why, async () => {
    const doc = await buildDocument(testCase.doc);
    const expected = testCase.perPage ?? [testCase.expect];
    expect(doc.getPageCount()).toBe(expected.length);

    expected.forEach((expectation, pageIndex) => {
      const found = detectPage(doc.getPage(pageIndex), pageIndex);
      expect(counts(found), `page ${pageIndex}`).toEqual(expectation);
      // Whatever a page reports carries that page's index, always. A region
      // that lands on the wrong page puts a hint on a document someone is not
      // looking at, which no count assertion above would notice.
      expect(allRegions(found).every((region) => region.pageIndex === pageIndex)).toBe(true);
      if (testCase.comb) expect(found.combs[0]).toMatchObject(testCase.comb);
    });
  });
});

describe('every region is a sane rectangle, whatever found it', () => {
  it.each(ELEMENT_CASES)('$group: $name', async (testCase) => {
    const doc = await buildDocument(testCase.doc);
    for (let pageIndex = 0; pageIndex < doc.getPageCount(); pageIndex += 1) {
      for (const region of allRegions(detectPage(doc.getPage(pageIndex), pageIndex))) {
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
    }
  });
});

describe('real documents', () => {
  it.each(DOCUMENT_CASES)('$name', async (documentCase) => {
    const bytes = fs.readFileSync(path.join(repoRoot, ...documentCase.file));
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const found = detectPage(doc.getPage(0), 0);

    if (documentCase.expect) expect(counts(found)).toEqual(documentCase.expect);
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
      for (let pageIndex = 0; pageIndex < doc.getPageCount(); pageIndex += 1) {
        const found = detectPage(doc.getPage(pageIndex), pageIndex);
        for (const kind of ['combs', 'cells', 'checkboxes']) {
          if (found[kind].length > 0) seen[kind].add(source);
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
