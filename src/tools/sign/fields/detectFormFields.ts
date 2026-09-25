import type { PDFDocument, PDFPage } from '@cantoo/pdf-lib';
import { createPageGeometry, type PageGeometry } from '../../../editor/geometry/coords.ts';
import type { CombRegion, FieldRegion } from '../../../editor/text/combPlacement.ts';
import type {
  DetectedCell,
  DetectionContext,
  FieldSource,
  PageTextRun,
  SourceRegions,
} from './fieldTypes.ts';
import { collectPageInk, pageCropBox } from './pageInk.js';
import { detectPageRegions } from './formGrid.js';
import { detectCellCandidates } from './formCells.js';
import { detectWidgetRegions } from './formWidgets.js';
import { reconcile, SOURCE_ORDER, KIND_PRECEDENCE } from './fieldRegions.js';

/**
 * ARCH-24 step A: the one entry point onto field detection. `useFormFieldRegions.ts`
 * (Sign), the element corpus (`corpus/corpus.test.js`) and the scored corpus
 * (`corpus/scoring/score.js`) all call this now, instead of each assembling the
 * same five modules itself - see ARCH-24 for why that assembly was the actual
 * gap (`src/tools/sign/fields/formGrid.js` and its siblings were already pure
 * functions; nothing knew them as one capability).
 *
 * A caller needs more than the detection call itself to gather what it passes
 * in: `toPageTextRuns` (re-exported below, from `textRuns.js`) turns pdf.js
 * text items into the page-percent runs this module's `textRuns` parameter
 * expects, and `pageGeometry` (below) builds the same per-page geometry this
 * module builds internally. Both are exported from here, not from their own
 * modules directly, so a consumer - the hook is the one this matters for -
 * reaches every detector-adjacent piece through this one module and cannot
 * drift from what `detectFormFields` itself uses.
 *
 * Two sources today, `ink` and `widgets`, each a thin async wrapper around
 * functions that already existed and are unchanged by this step. Precedence
 * between what they find is declared data, not code here: `fieldRegions.js`'s
 * `reconcile` is driven by its own exported `SOURCE_ORDER` and
 * `KIND_PRECEDENCE` (ARCH-24 step B), so this function no longer knows the
 * two source names by name, or how many there are - it hands every source's
 * raw regions to `reconcile` keyed by name and gets back one set of fields.
 *
 * Never touches pdf.js or the DOM. `document` is an already-loaded
 * `@cantoo/pdf-lib` document, and `pageDirections` is not part of the return
 * value even though the old assembly computed it here: it is read straight
 * off the same text runs the caller already has in hand
 * (`dominantTextDirection`), so `useFormFieldRegions.ts` computes it itself
 * rather than asking a detector for something that is not geometry.
 */

/** See the module doc above: re-exported so a caller reaches the pdf.js-item
 * conversion through this one module rather than importing `textRuns.js`
 * directly. */
export { toPageTextRuns } from './textRuns.js';

/**
 * The source contract - `PageTextRun`, `DetectionContext`, `SourceRegions`,
 * `FieldSource` - lives in `fieldTypes.ts` now (FORM-23), next to the kind
 * vocabulary a source's regions carry. Re-exported here so an existing
 * `import type { FieldSource } from './detectFormFields.ts'` (or the other
 * three) keeps working unchanged; a new import should prefer `fieldTypes.ts`
 * directly.
 */
export type { PageTextRun, DetectionContext, SourceRegions, FieldSource };

/**
 * The page's own drawn ink: comb teeth, checkbox squares and glyphs, ruled
 * cells. Wraps `detectPageRegions` (combs + checkboxes, which already folds
 * in checkbox widgets read straight off `/Annots` - see its own docstring)
 * and `detectCellCandidates` (closed cells, which needs the page's ink,
 * geometry and text runs for label lookup) - the two calls
 * `useFormFieldRegions.ts` made directly before this file existed.
 */
const inkSource: FieldSource = {
  name: 'ink',
  async detect(page, { geometry, pageIndex, textRuns }) {
    const { combs, checkboxes } = detectPageRegions(page, pageIndex);
    const cells = detectCellCandidates(collectPageInk(page), geometry, pageIndex, textRuns);
    return { combs, checkboxes, cells };
  },
};

/**
 * A form's own `/Tx` widgets: what a live AcroForm says about itself,
 * independent of anything printed. Reports no checkboxes of its own -
 * checkbox widgets are already folded into the ink source above
 * (`detectPageRegions` reads `/Annots` for them too), so a second copy here
 * would double-count them.
 */
const widgetsSource: FieldSource = {
  name: 'widgets',
  async detect(page, { pageIndex }) {
    const { combs, cells } = detectWidgetRegions(page, pageIndex);
    return { combs, checkboxes: [], cells };
  },
};

/**
 * The two sources this module ships. A caller may pass its own `sources`
 * list (a future OCR or metadata source, or the corpus's ARCH-24 step C
 * stub, `corpus/thirdSourceContract.test.js`) - `detectFormFields` runs
 * whatever it is given and hands every source's regions to `reconcile` by
 * name. A source not named in `fieldRegions.js`'s `SOURCE_ORDER` is still
 * folded in, appended after every source that is named there (`reconcile`'s
 * own module doc); it just cannot win a same-kind tie against `ink` or
 * `widgets` until it earns a deliberate line in `SOURCE_ORDER`. This module
 * itself never has to change either way - that is the whole point of step C.
 */
export const DEFAULT_SOURCES: FieldSource[] = [inkSource, widgetsSource];

/**
 * One page's geometry (crop box plus rotation), exactly as `detectFormFields`
 * builds it for each page below. Exported so a caller that needs the same
 * geometry to gather text runs - the hook, the scored corpus - computes it
 * through this one function instead of repeating `createPageGeometry({
 * cropBox: pageCropBox(page), rotation: ... })` itself. Before this, two call
 * sites building "the same" geometry by convention was exactly the kind of
 * drift ARCH-24's acceptance line rules out: nothing enforced that a second
 * copy stayed identical to this one.
 */
export function pageGeometry(page: PDFPage): PageGeometry {
  return createPageGeometry({
    cropBox: pageCropBox(page),
    rotation: page.getRotation().angle,
  });
}

/**
 * Detects every comb, checkbox and free-text cell in a document.
 *
 * `textRuns` is required, per page, and never defaulted: the element corpus
 * passes `[]` (or a case's own `text`, for the few rows that pin text-plus-
 * geometry behaviour) to isolate a geometry rule in isolation, and the
 * scored corpus and the Sign tool pass real pdf.js text runs to measure or
 * run the shipped pipeline. Defaulting either one to the other would
 * silently start measuring the wrong thing - MOBI-13 found this the
 * expensive way, when leaving text out cost the health declaration 14 points
 * of precision and nobody had decided that on purpose.
 *
 * `cells` comes back typed as `DetectedCell[]`, not the plain `FieldRegion[]`
 * a source itself reports (`SourceRegions.cells`): every real cell a source
 * produces does carry a `kind` (`formCells.js`'s and `formWidgets.js`'s own
 * JSDoc types say so), so the entry point asserts that once here rather than
 * leaving every caller to re-assert it with its own widening cast.
 *
 * @param document an already-loaded `@cantoo/pdf-lib` document.
 */
export async function detectFormFields(
  document: PDFDocument,
  { textRuns, sources = DEFAULT_SOURCES }: { textRuns: PageTextRun[][]; sources?: FieldSource[] },
): Promise<{ combs: CombRegion[]; checkboxes: FieldRegion[]; cells: DetectedCell[] }> {
  const found: { combs: CombRegion[]; checkboxes: FieldRegion[]; cells: DetectedCell[] } = {
    combs: [],
    checkboxes: [],
    cells: [],
  };
  for (let pageIndex = 0; pageIndex < document.getPageCount(); pageIndex += 1) {
    const page = document.getPage(pageIndex);
    const geometry = pageGeometry(page);
    const context: DetectionContext = { textRuns: textRuns[pageIndex], geometry, pageIndex };

    // Every source runs against the same page and context - order here does
    // not matter, since `reconcile` below is what decides precedence, from
    // `SOURCE_ORDER` and `KIND_PRECEDENCE` (fieldRegions.js), not from the
    // order these promises settle in.
    const results = await Promise.all(sources.map((source) => source.detect(page, context)));
    const sourceResults: Record<string, SourceRegions> = {};
    sources.forEach((source, index) => {
      sourceResults[source.name] = results[index];
    });
    const { combs, checkboxes, cells } = reconcile(sourceResults, { sourceOrder: SOURCE_ORDER, kindPrecedence: KIND_PRECEDENCE });
    found.combs.push(...combs);
    found.cells.push(...cells);
    found.checkboxes.push(...checkboxes);
  }
  return found;
}
