import { useEffect, useState } from 'preact/hooks';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { CombRegion, FieldRegion } from '../../editor/text/combPlacement.ts';
import type { PageGeometry } from '../../editor/geometry/coords.ts';
import type { TextDirection } from '../../editor/model/editorModel.ts';
import { dominantTextDirection } from '../../lib/signHelpers.js';

/** A page-percent `{left, top, width, height}` box - what `toPagePercentBox`
 * actually returns, which is `FieldRegion` minus `pageIndex` (the caller's to
 * add, since the transform itself never sees which page it is on). */
type PercentBox = Omit<FieldRegion, 'pageIndex'>;

/**
 * The printed grids on the loaded PDF, detected once per file.
 *
 * Runs entirely on-device, like everything else here: the bytes are already in
 * memory and nothing is fetched. The detector and `@cantoo/pdf-lib` arrive via
 * a dynamic import for the same reason the serializers do - neither belongs in
 * the editor's initial hydration, and a document with no grids in it should
 * cost nothing but the walk.
 *
 * `cells` (MOBI-11) is the ordinary free-text fields `combs`/`checkboxes`
 * (MOBI-03) deliberately leave alone: a name, an address line, a date written
 * on a blank line - a closed printed cell with no comb teeth and no fixed
 * pitch. Finding them needs the page's own text, on top of its ink, so this
 * hook also takes the already-loading `pdfDocument` (the same `pdfjs`
 * instance `PdfWorkspace` renders pages from) rather than parsing the file a
 * third time. `formCells.js`'s docstring has the detection rules; recall on
 * the two spike forms is 53-67% (see `docs/mobi-10-field-map-spike.md`), so
 * this is an accelerator, same as combs and checkboxes, never a claim of
 * completeness.
 *
 * Two sources feed it, because a form can be either kind or both. The ink
 * detectors above read the page's own drawing operators, which is where a
 * flat form - the kind people are usually sent - puts its boxes. A form that
 * still carries live `/Tx` widgets paints each box inside that widget's own
 * appearance stream instead, so the page stream is blank where the fields
 * are and the ink pass correctly finds nothing; `detectWidgetRegions` reads
 * those widgets' rectangles directly. Our own practice form is the second
 * kind, and the ink pass alone found 1 of its 7 writable fields.
 *
 * Detection failure is deliberately silent. This is an accelerator on top of
 * placing a text box by hand, so a PDF whose content stream cannot be walked
 * should leave the editor exactly as it was rather than raise an error about a
 * feature the person never asked for.
 */
export interface FormFieldRegions {
  combs: CombRegion[];
  checkboxes: FieldRegion[];
  cells: FieldRegion[];
  /**
   * The direction each page's printed text reads in, by page index - what
   * MOBI-06's field-to-field order walks a row by. It comes from the page's
   * own text runs (`dominantTextDirection`), not from the UI locale, because
   * the form decides which of its fields comes first, not the site's language.
   */
  pageDirections: TextDirection[];
}

const NONE: FormFieldRegions = { combs: [], checkboxes: [], cells: [], pageDirections: [] };

/** pdf.js text items, converted through the one page-coordinate transform
 * (`toPagePercentBox`) into `formCells.js`'s page-percent `PageTextRun` shape.
 * `TextMarkedContent` entries (no `str`/`transform` of their own - marked-
 * content operators, not glyph runs) are skipped, same as a blank run. */
async function pageTextRuns(
  pdfjsPage: PDFPageProxy,
  geometry: PageGeometry,
  toPagePercentBox: (geometry: PageGeometry, box: { x0: number; y0: number; x1: number; y1: number }) => PercentBox,
) {
  const { items } = await pdfjsPage.getTextContent();
  // A single inline callback, not filter().map(): 'str' in item narrows the
  // TextItem | TextMarkedContent union for the rest of this function body,
  // which a separate filter predicate and map callback cannot share without
  // TextItem itself being part of pdfjs-dist's public type export.
  return items.flatMap((item) => {
    if (!('str' in item) || !item.str.trim()) return [];
    const [, , , , e, f] = item.transform;
    const box = toPagePercentBox(geometry, { x0: e, y0: f, x1: e + item.width, y1: f + item.height });
    return [{ str: item.str, ...box }];
  });
}

export default function useFormFieldRegions(
  bytes: ArrayBuffer | null,
  numPages: number,
  pdfDocument: PDFDocumentProxy | null,
): FormFieldRegions {
  const [regions, setRegions] = useState<FormFieldRegions>(NONE);

  useEffect(() => {
    if (!bytes || numPages <= 0 || !pdfDocument) {
      setRegions(NONE);
      return undefined;
    }
    let current = true;
    setRegions(NONE);

    (async () => {
      try {
        const [
          { PDFDocument },
          { detectPageRegions, toPagePercentBox },
          { collectPageInk, pageCropBox },
          { detectCellCandidates },
          { reconcileFields, withWidgetFields },
          { createPageGeometry },
          { detectWidgetRegions },
        ] = await Promise.all([
          import('@cantoo/pdf-lib'),
          import('../../editor/adapters/pdf/formGrid.js'),
          import('../../editor/adapters/pdf/pageInk.js'),
          import('../../editor/adapters/pdf/formCells.js'),
          import('../../editor/adapters/pdf/fieldRegions.js'),
          import('../../editor/geometry/coords.ts'),
          import('../../editor/adapters/pdf/formWidgets.js'),
        ]);
        const document = await PDFDocument.load(bytes.slice(0), {
          ignoreEncryption: true,
          updateMetadata: false,
        });
        if (!current) return;
        const found: FormFieldRegions = { combs: [], checkboxes: [], cells: [], pageDirections: [] };
        for (let pageIndex = 0; pageIndex < document.getPageCount(); pageIndex += 1) {
          const pdfLibPage = document.getPage(pageIndex);
          const page = detectPageRegions(pdfLibPage, pageIndex);
          found.checkboxes.push(...page.checkboxes);

          // Own geometry/ink walk, independent of detectPageRegions' internal
          // one: reusing its private state isn't worth the coupling risk to a
          // shipped, tested feature for what is, per page, one more (cheap)
          // walk of the same content stream.
          const geometry = createPageGeometry({
            cropBox: pageCropBox(pdfLibPage),
            rotation: pdfLibPage.getRotation().angle,
          });
          const ink = collectPageInk(pdfLibPage);
          const pdfjsPage = await pdfDocument.getPage(pageIndex + 1);
          if (!current) return;
          const textItems = await pageTextRuns(pdfjsPage, geometry, toPagePercentBox);
          if (!current) return;
          found.pageDirections[pageIndex] = dominantTextDirection(textItems.map((item) => item.str));
          // The ink walk first, then whatever the page's own `/Tx` widgets
          // add: a live form draws its boxes inside each widget's appearance
          // stream, which `collectPageInk` does not walk and should not, so
          // on a fillable form the ink pass finds only what is printed under
          // the widgets - on our practice form, 1 of its 7 writable fields.
          const reconciled = reconcileFields({
            combs: page.combs,
            checkboxes: page.checkboxes,
            cells: detectCellCandidates(ink, geometry, pageIndex, textItems),
          });
          const { combs, cells } = withWidgetFields(
            { ...reconciled, checkboxes: page.checkboxes },
            detectWidgetRegions(pdfLibPage, pageIndex),
          );
          found.combs.push(...combs);
          // Signature cells aren't wired into a snap yet - signature
          // placement is a different creation mode (a saved-signature
          // dialog, not a point tap) and stays out of this first pass.
          found.cells.push(...cells.filter((cell) => cell.kind !== 'signature'));
        }
        if (current) setRegions(found);
      } catch {
        if (current) setRegions(NONE);
      }
    })();

    return () => { current = false; };
  }, [bytes, numPages, pdfDocument]);

  return regions;
}
