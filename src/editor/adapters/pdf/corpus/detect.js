import { detectPageRegions } from '../formGrid.js';
import { detectWidgetRegions } from '../formWidgets.js';
import { detectCellCandidates } from '../formCells.js';
import { reconcileFields, withWidgetFields } from '../fieldRegions.js';
import { collectPageInk, pageCropBox } from '../pageInk.js';
import { createPageGeometry } from '../../../geometry/coords.ts';

/**
 * One page through the whole detector, exactly as `useFormFieldRegions.ts`
 * assembles it, minus the pdf.js text pass.
 *
 * It lives here because there are now two readers of it - the element corpus
 * and the scored corpus (MOBI-13) - and the hook is a third. Three copies of
 * an assembly is how they drift, and a corpus measuring something the product
 * does not do is worse than no corpus. ARCH-24 replaces all three with one
 * entry point in the product; until then this is the one copy the tests share.
 *
 * **Text is left out deliberately.** It feeds `formCells.js`'s label lookup
 * and its "this cell is explanatory, drop it" filter. Including it would make
 * every case depend on a second parser and on whatever prose a fixture
 * carries, and the geometry this measures does not read text at all. The cost
 * is real and measured: on the health declaration, `[]` gives 80.2% precision
 * where real text runs give 94.2% (`docs/mobi-10-field-map-spike.md`). A
 * caller with text in hand should pass it.
 *
 * @param {import('@cantoo/pdf-lib').PDFPage} page
 * @param {number} pageIndex
 * @param {Array<{str: string, left: number, top: number, width: number, height: number}>} textRuns
 * @returns {{combs: Array, cells: Array, checkboxes: Array}} page percentages
 */
export function detectPage(page, pageIndex = 0, textRuns = []) {
  const ink = detectPageRegions(page, pageIndex);
  const geometry = createPageGeometry({
    cropBox: pageCropBox(page),
    rotation: page.getRotation().angle,
  });
  const cells = detectCellCandidates(collectPageInk(page), geometry, pageIndex, textRuns);
  const reconciled = reconcileFields({ combs: ink.combs, checkboxes: ink.checkboxes, cells });
  const merged = withWidgetFields({ ...reconciled, checkboxes: ink.checkboxes }, detectWidgetRegions(page, pageIndex));
  return { combs: merged.combs, cells: merged.cells, checkboxes: ink.checkboxes };
}

/** Every region a page reported, whichever kind or source found it. */
export const allRegions = ({ combs, cells, checkboxes }) => [...combs, ...cells, ...checkboxes];

/** How many of each kind a page reported. */
export const countRegions = ({ combs, cells, checkboxes }) => ({
  combs: combs.length,
  cells: cells.length,
  checkboxes: checkboxes.length,
});
