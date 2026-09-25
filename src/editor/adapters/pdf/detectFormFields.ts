import type { PDFDocument, PDFPage } from '@cantoo/pdf-lib';
import { createPageGeometry, type PageGeometry } from '../../geometry/coords.ts';
import type { CombRegion, FieldRegion } from '../../text/combPlacement.ts';
import { collectPageInk, pageCropBox } from './pageInk.js';
import { detectPageRegions } from './formGrid.js';
import { detectCellCandidates } from './formCells.js';
import { detectWidgetRegions } from './formWidgets.js';
import { reconcileFields, withWidgetFields } from './fieldRegions.js';

/**
 * ARCH-24 step A: the one entry point onto field detection. `useFormFieldRegions.ts`
 * (Sign), the element corpus (`corpus/corpus.test.js`) and the scored corpus
 * (`corpus/scoring/score.js`) all call this now, instead of each assembling the
 * same five modules itself - see ARCH-24 for why that assembly was the actual
 * gap (`src/editor/adapters/pdf/formGrid.js` and its siblings were already pure
 * functions; nothing knew them as one capability).
 *
 * Two sources today, `ink` and `widgets`, each a thin async wrapper around
 * functions that already existed and are unchanged by this step. So is the
 * order they are reconciled in: `reconcileFields` then `withWidgetFields`,
 * exactly as `useFormFieldRegions.ts` called them before this file existed.
 * Turning that order into declared data, so a third source can be added
 * without editing this function, is ARCH-24 step B - the sources are already
 * behind the `FieldSource` contract for it, but precedence is still
 * hard-coded to these two names below.
 *
 * Never touches pdf.js or the DOM. `document` is an already-loaded
 * `@cantoo/pdf-lib` document, and `pageDirections` is not part of the return
 * value even though the old assembly computed it here: it is read straight
 * off the same text runs the caller already has in hand
 * (`dominantTextDirection`), so `useFormFieldRegions.ts` computes it itself
 * rather than asking a detector for something that is not geometry.
 */

/**
 * One page's text, already in the editor's page-percent shape - what
 * `textRuns.js`'s `toPageTextRuns` produces from a pdf.js page, and what a
 * corpus row authors directly (`corpus/README.md`, "Two things to know").
 */
export interface PageTextRun {
  str: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * What a source needs to detect one page: its own text runs, the page's
 * geometry (built once per page in `detectFormFields` and shared by every
 * source, so two sources can never disagree about it), and which page this
 * is, for the regions a source stamps with `pageIndex`.
 */
export interface DetectionContext {
  textRuns: PageTextRun[];
  geometry: PageGeometry;
  pageIndex: number;
}

/** What one source reports for one page, before reconciliation. */
export interface SourceRegions {
  combs: CombRegion[];
  checkboxes: FieldRegion[];
  cells: FieldRegion[];
}

/**
 * One way of finding fields on a page. Async from the start: today's two
 * sources are synchronous wrappers around synchronous functions, but OCR
 * will not be - it will likely run in a worker - and a contract that is sync
 * now is one every future source has to rewrite around.
 */
export interface FieldSource {
  name: string;
  detect(page: PDFPage, context: DetectionContext): Promise<SourceRegions>;
}

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
 * `ink` first, `widgets` second - the order the reconciliation below already
 * assumes. A caller may still pass its own `sources` (the corpus's ARCH-24
 * step C stub source does), but until step B turns precedence into data,
 * `detectFormFields` finds `ink` and `widgets` in whatever list it gets by
 * name and reconciles only those two, in this order.
 */
export const DEFAULT_SOURCES: FieldSource[] = [inkSource, widgetsSource];

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
 * @param document an already-loaded `@cantoo/pdf-lib` document.
 */
export async function detectFormFields(
  document: PDFDocument,
  { textRuns, sources = DEFAULT_SOURCES }: { textRuns: PageTextRun[][]; sources?: FieldSource[] },
): Promise<{ combs: CombRegion[]; checkboxes: FieldRegion[]; cells: FieldRegion[] }> {
  const ink = sources.find((source) => source.name === 'ink');
  const widgets = sources.find((source) => source.name === 'widgets');
  if (!ink || !widgets) {
    throw new Error('detectFormFields needs an "ink" and a "widgets" source by name - reconciliation is not yet data-driven (ARCH-24 step B).');
  }

  const found: { combs: CombRegion[]; checkboxes: FieldRegion[]; cells: FieldRegion[] } = {
    combs: [],
    checkboxes: [],
    cells: [],
  };
  for (let pageIndex = 0; pageIndex < document.getPageCount(); pageIndex += 1) {
    const page = document.getPage(pageIndex);
    const geometry = createPageGeometry({
      cropBox: pageCropBox(page),
      rotation: page.getRotation().angle,
    });
    const context: DetectionContext = { textRuns: textRuns[pageIndex], geometry, pageIndex };

    // The ink walk first, then whatever the page's own `/Tx` widgets add: a
    // live form draws its boxes inside each widget's appearance stream,
    // which the ink source does not walk and should not, so on a fillable
    // form the ink pass finds only what is printed under the widgets.
    const [inkRegions, widgetRegions] = await Promise.all([
      ink.detect(page, context),
      widgets.detect(page, context),
    ]);
    const reconciled = reconcileFields({
      combs: inkRegions.combs,
      checkboxes: inkRegions.checkboxes,
      cells: inkRegions.cells,
    });
    const { combs, cells } = withWidgetFields(
      { ...reconciled, checkboxes: inkRegions.checkboxes },
      widgetRegions,
    );
    found.combs.push(...combs);
    found.cells.push(...cells);
    found.checkboxes.push(...inkRegions.checkboxes);
  }
  return found;
}
