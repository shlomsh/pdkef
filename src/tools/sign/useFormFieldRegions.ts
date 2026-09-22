import { useEffect, useRef, useState } from 'preact/hooks';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { CombRegion, FieldRegion } from '../../editor/text/combPlacement.ts';
import type { PageGeometry } from '../../editor/geometry/coords.ts';
import type { TextDirection } from '../../editor/model/editorModel.ts';
import { dominantTextDirection } from '../../lib/signHelpers.js';
import { describeFormDetectionFailure } from './formDetectionDetail.ts';

/** A page-percent `{left, top, width, height}` box - what `toPagePercentBox`
 * actually returns, which is `FieldRegion` minus `pageIndex` (the caller's to
 * add, since the transform itself never sees which page it is on). */
type PercentBox = Omit<FieldRegion, 'pageIndex'>;

/**
 * Where the one detection run for the current file got to. `pending` covers
 * both "no file yet" and "still walking"; nothing is claimed about the
 * document until it leaves that state.
 *
 * `unavailable` and `failed` are separate because only one of them is the
 * person's to act on. The detector arrives by dynamic import, `sw.js` serves
 * HTML navigations cache-first, and it deliberately has no `skipWaiting()` -
 * so a shell cached before a deploy goes on asking for chunk names that
 * deploy replaced. The import rejects, and before this the whole thing came
 * out as "this PDF has no fields", permanently, for as long as that shell
 * kept being served. That is a stale copy of the site, not a fact about the
 * document, and reopening the page fixes it. `failed` means the detector
 * really ran on this file and threw, which is ours to fix, not theirs.
 *
 * `not-started` is the one that was never a state at all, and is the hardest
 * kind of bug to see: the effect's own precondition bail. No error is thrown,
 * no catch runs, nothing is logged - if the bytes, the page count or the
 * pdf.js document are not all there when the effect runs, detection simply
 * never happens, and the result is indistinguishable from a form with nothing
 * in it. It is reported only after a grace period, because during a load
 * those three arrive in two separate steps and a bail on the way through is
 * the normal case, not a fault.
 */
export type FormDetectionState = 'pending' | 'done' | 'failed' | 'unavailable' | 'not-started';

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
 * Detection failure stays silent *for the person*. This is an accelerator on
 * top of placing a text box by hand, so a PDF whose content stream cannot be
 * walked should leave the editor exactly as it was rather than raise an error
 * about a feature nobody asked for.
 *
 * It is no longer silent for everyone else, and that distinction is the whole
 * of FORM-11. A bare `catch` that reset the regions made "detection threw" and
 * "this PDF has no detectable fields" the same observable state - the exact
 * hole `useFormFieldRegions.wiring.test.js` was written after a total failure
 * went unnoticed through a green build. `detection` below tells the two apart,
 * so the status line can say something honest about each and the caller can
 * report the failure as maintenance telemetry.
 */
export interface FormFieldRegions {
  /**
   * How the walk ended. `done` with every list empty is a real answer about
   * the document ("nothing detectable in it"); `failed` and `unavailable`
   * are answers about the app, and about two different things (see
   * `FormDetectionState`). Only the UI copy and the maintenance telemetry
   * read this - every consumer of the regions themselves treats all three
   * exactly as it treats an empty result, which is what keeps a failure
   * quiet in the editor.
   */
  detection: FormDetectionState;
  /**
   * Whatever `detection: 'failed'` was thrown by, carried so the caller can
   * classify it into a maintenance error code (`classifyExportError`) instead
   * of reporting every failure as the generic one. **Never render it and
   * never send it**: an exception message can quote a filename or a stretch
   * of the document, which is why the telemetry boundary takes the error and
   * emits only a code off a closed list. Absent in every other state.
   */
  detectionError?: unknown;
  /**
   * One content-free line about the last thing that went wrong for this file,
   * kept even once a later run has succeeded (see `issueRef`). It is already
   * safe to show and to paste into a public issue - either
   * `describeUnmetPreconditions`' own words or a sanitised error line - and
   * it is what the Feedback report carries. The status line never reads it.
   */
  detectionIssue?: string;
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

const NONE: FormFieldRegions = { detection: 'pending', combs: [], checkboxes: [], cells: [], pageDirections: [] };
/** The same "no fields" the rest of the editor sees, tagged so the status line
 * and the telemetry can tell it from an honest empty document. */
const FAILED: FormFieldRegions = { ...NONE, detection: 'failed' };
/** The detector itself never arrived - see `FormDetectionState`. */
const UNAVAILABLE: FormFieldRegions = { ...NONE, detection: 'unavailable' };
/** The effect bailed on its own preconditions and never ran - see `FormDetectionState`. */
const NOT_STARTED: FormFieldRegions = { ...NONE, detection: 'not-started' };

/**
 * How long the inputs may be incomplete before that is worth reporting.
 * `loadEditorPdf` sets the bytes in one step and the pdf.js document in a
 * later one, so an incomplete moment is ordinary; an incomplete second and a
 * half after the editor is up is not.
 */
const PRECONDITION_GRACE_MS = 1_500;

/**
 * Which of the effect's three inputs were not there, in one line with no
 * document content in it. The byte length is included deliberately: a
 * zero-length or detached `ArrayBuffer` is a real way to get here, and a size
 * is a number the file row already shows. Bytes themselves never leave this
 * module, and never leave the device at all.
 */
function describeUnmetPreconditions(
  bytes: ArrayBuffer | null,
  numPages: number,
  pdfDocument: PDFDocumentProxy | null,
): string | null {
  const unmet: string[] = [];
  if (!bytes) unmet.push('no bytes');
  else if (bytes.byteLength === 0) unmet.push('0 bytes (empty or detached)');
  if (numPages <= 0) unmet.push('no page count');
  if (!pdfDocument) unmet.push('no pdf.js document');
  if (unmet.length === 0) return null;
  return `Detection did not start: ${unmet.join(', ')}. bytes=${bytes ? bytes.byteLength : 'null'}, pages=${numPages}, document=${pdfDocument ? 'yes' : 'no'}`;
}

/** The page's own text runs, in `formCells.js`'s page-percent shape. Only the
 * opening of the document differs between this caller and the scored corpus,
 * so the conversion itself lives in `textRuns.js` and both perform the
 * identical one - see its docstring for why that matters to a measurement. */
async function pageTextRuns(
  pdfjsPage: PDFPageProxy,
  geometry: PageGeometry,
  convert: (items: object[], geometry: PageGeometry) => Array<{ str: string } & PercentBox>,
) {
  // Drained with a reader rather than `getTextContent()`, which is the same
  // stream read a different way. pdf.js's `getTextContent` ends in
  // `for await (const value of readableStream)`, and async iteration of a
  // native `ReadableStream` has never shipped in Safari (WebKit bug 194379).
  // On iOS the iterator-protocol lookup finds neither `Symbol.asyncIterator`
  // nor `Symbol.iterator`, calls `undefined`, and every document detected zero
  // fields with `TypeError: undefined is not a function` - reported 2026-09-20
  // on iOS 26.6.2, in Safari and Chrome alike since both are WebKit, and
  // reproducible on no engine we can run here: Playwright's Linux WebKit is a
  // trunk build that HAS the feature (measured: `typeof
  // ReadableStream.prototype[Symbol.asyncIterator]` is `'function'` there and
  // in Chromium), which is why every local run was green.
  //
  // Rendering was never affected, and that is the tell: it drains the very
  // same stream with `getReader()` (`_pumpOperatorList`), so a device that
  // paints a page correctly could still not read a word of its text. We use
  // only the primitives that path already proves are present.
  const reader = pdfjsPage.streamTextContent().getReader();
  const items: object[] = [];
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    items.push(...chunk.value.items);
  }
  return convert(items, geometry);
}

export default function useFormFieldRegions(
  bytes: ArrayBuffer | null,
  numPages: number,
  pdfDocument: PDFDocumentProxy | null,
): FormFieldRegions {
  const [regions, setRegions] = useState<FormFieldRegions>(NONE);
  /**
   * The last thing that went wrong for *this* file, kept across the effect's
   * later runs. Detection re-runs whenever its inputs change, so a run that
   * eventually succeeds would otherwise erase the evidence that the first two
   * never started - and "it works if you wait" is exactly the shape of the
   * bug being hunted. The status line ignores this and reports the current
   * state honestly; only the Feedback report reads it.
   */
  const issueRef = useRef<{ key: ArrayBuffer | null; issue: string | null }>({ key: null, issue: null });

  useEffect(() => {
    if (issueRef.current.key !== bytes) issueRef.current = { key: bytes, issue: null };
    let current = true;

    // The silent early return this hook shipped with. It is not an error and
    // must not read as one, but it is also not nothing: it is the only path
    // to "no fields" that leaves no trace anywhere, and it produces exactly
    // the reported symptom (no outlines, no snapping, nothing in the console)
    // without a single throw.
    const unmet = describeUnmetPreconditions(bytes, numPages, pdfDocument);
    // The two direct checks repeat what the helper already did: its answer is
    // a string, and a string does not narrow `bytes` or `pdfDocument` for the
    // walk below.
    if (unmet || !bytes || !pdfDocument) {
      setRegions(NONE);
      // Nothing has been opened at all - the editor before a file, not a
      // bail. Reporting that would be reporting an empty page.
      if (!bytes && numPages <= 0 && !pdfDocument) return undefined;
      const reason = unmet ?? 'Detection did not start.';
      const timer = setTimeout(() => {
        if (!current) return;
        issueRef.current.issue = reason;
        console.warn(reason);
        setRegions({ ...NOT_STARTED, detectionIssue: reason });
      }, PRECONDITION_GRACE_MS);
      return () => { current = false; clearTimeout(timer); };
    }

    // Named locals so the walk below reads the values this run started with
    // rather than the current props.
    const sourceBytes = bytes;
    const sourceDocument = pdfDocument;
    setRegions(NONE);

    (async () => {
      // Which side of the dynamic import a throw came from. The destructuring
      // below has to stay one array destructuring of one `await Promise.all`
      // (useFormFieldRegions.wiring.test.js parses that exact shape, after a
      // renamed export once made every document report zero fields - and its
      // parser reads backwards from the Promise.all, so this comment must not
      // contain that syntax either), so the two phases are told apart with a
      // flag rather than by splitting the block in two.
      let detectorLoaded = false;
      try {
        const [
          { PDFDocument },
          { detectPageRegions },
          { collectPageInk, pageCropBox },
          { detectCellCandidates },
          { reconcileFields, withWidgetFields },
          { createPageGeometry },
          { toPageTextRuns },
          { detectWidgetRegions },
        ] = await Promise.all([
          import('@cantoo/pdf-lib'),
          import('../../editor/adapters/pdf/formGrid.js'),
          import('../../editor/adapters/pdf/pageInk.js'),
          import('../../editor/adapters/pdf/formCells.js'),
          import('../../editor/adapters/pdf/fieldRegions.js'),
          import('../../editor/geometry/coords.ts'),
          import('../../editor/adapters/pdf/textRuns.js'),
          import('../../editor/adapters/pdf/formWidgets.js'),
        ]);
        detectorLoaded = true;
        const document = await PDFDocument.load(sourceBytes.slice(0), {
          ignoreEncryption: true,
          updateMetadata: false,
        });
        if (!current) return;
        const found: FormFieldRegions = { detection: 'done', combs: [], checkboxes: [], cells: [], pageDirections: [] };
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
          const pdfjsPage = await sourceDocument.getPage(pageIndex + 1);
          if (!current) return;
          const textItems = await pageTextRuns(pdfjsPage, geometry, toPageTextRuns);
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
          // dialog, not a point tap) and stays out of this first pass. This
          // now also catches a signature line on a fillable form: our own
          // practice form's `parent_guardian_signature` widget reads as
          // `kind: 'signature'` from its own field name (`formWidgets.js`),
          // so the location it used to offer as an ordinary "double-click to
          // edit" text cell is dropped here rather than mislabelled.
          found.cells.push(...cells.filter((cell) => cell.kind !== 'signature'));
        }
        if (current) setRegions({ ...found, detectionIssue: issueRef.current.issue ?? undefined });
      } catch (error) {
        // Quiet in the UI, loud in the console: the person gets the editor
        // they already had (neither state carries any regions), while anyone
        // debugging a "it does not detect my form" report gets the throw
        // itself instead of a blank. The reason is never shown on screen -
        // the status line says only which of the two happened.
        // The sanitised line first, so what a person can relay from the
        // Feedback report and what an engineer reads in the console are the
        // same string; the error object after it, because a console stays on
        // the device and a stack is worth having there.
        const outcome = detectorLoaded ? FAILED : UNAVAILABLE;
        issueRef.current.issue = describeFormDetectionFailure(error);
        console.warn(
          detectorLoaded
            ? `Form field detection did not complete for this document. ${describeFormDetectionFailure(error)}`
            : `Form field detection could not be loaded - this page may be a stale cached copy. ${describeFormDetectionFailure(error)}`,
          error,
        );
        if (current) setRegions({ ...outcome, detectionError: error, detectionIssue: issueRef.current.issue });
      }
    })();

    return () => { current = false; };
  }, [bytes, numPages, pdfDocument]);

  return regions;
}
