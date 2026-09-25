// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import fs from 'node:fs';
// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import path from 'node:path';
// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import { createRequire } from 'node:module';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import useFormFieldRegions from './useFormFieldRegions.ts';
import type { FormFieldRegions } from './useFormFieldRegions.ts';

/**
 * SNG-10 regression: the product's own "N form fields found" count must
 * agree with what `corpus/scoring/score.js` measures for this exact form -
 * `node scripts/score-form.mjs --pdf public/images/redaction-guide/sample.pdf
 * --truth .../ground-truth/practice-form-page1.json` reports 13 candidates
 * matching all 13 targets (`baselines.json`'s `pdkef-practice-form` row).
 *
 * It used to report 12. The detector itself was never the gap -
 * `detectFormFields` (what `score.js` calls directly) always found all 13,
 * signature line included. `useFormFieldRegions.ts` threw one away on the
 * way out: `cells: detected.cells.filter((cell) => cell.kind !== 'signature')`
 * dropped every signature-kind cell before the toolbar's count
 * (`PdfWorkspace.tsx`: `formRegions.combs.length + formRegions.cells.length
 * + formRegions.checkboxes.length`) ever saw it. That filter predates
 * `formLines.js` (SNG-10): before an *open* signature line could be
 * detected at all, `kind: 'signature'` only ever came from a closed cell
 * captioned "signature", on forms this pipeline had no score for, so the
 * filter's effect on the published count was invisible. The fix keeps the
 * exclusion - a signature is still placed through the saved-signature
 * dialog, never a typed snap - but moves it to the two places that build a
 * *typable* field list (`useWorkspaceGestures.ts`'s tap path,
 * `useFieldNavigation.ts`'s Next/Previous order), so `formRegions.cells`
 * itself, and everything counting off it, keeps every detected field.
 *
 * This drives the hook itself - real `@cantoo/pdf-lib` and
 * `detectFormFields.ts`, no mocks - with a pdf.js document read the way
 * `corpus/scoring/score.js` reads one in Node (the legacy build, real text
 * extraction), wrapped in the `streamTextContent().getReader()` shape
 * `useFormFieldRegions.ts`'s own `pageTextRuns` reads from (see that
 * function's docstring for why the hook never calls `getTextContent()`
 * directly). That is what makes this "the product path" rather than a
 * second copy of what `scoring.test.js` already proves about the detector
 * alone: it is the same assembly `PdfWorkspace.tsx` renders from, not the
 * raw detector output `score.js` scores.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PDF_PATH = path.join(repoRoot, 'public/images/redaction-guide/sample.pdf');

async function loadPdfjsDocument(bytes: ArrayBuffer) {
  const require = createRequire(import.meta.url);
  const pdfjsDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: `${path.join(pdfjsDir, 'standard_fonts')}${path.sep}`,
    cMapUrl: `${path.join(pdfjsDir, 'cmaps')}${path.sep}`,
    wasmUrl: `${path.join(pdfjsDir, 'wasm')}${path.sep}`,
    cMapPacked: true,
    useSystemFonts: false,
  });
  const doc = await loadingTask.promise;
  return {
    numPages: doc.numPages,
    // The shape `useFormFieldRegions.ts` reads (`PDFDocumentProxy.getPage`),
    // not `PDFPageProxy.getTextContent()` directly - the hook drains
    // `streamTextContent()` with a reader for iOS Safari's sake, and this
    // stands in for that same call so the test exercises the same code path.
    getPage: async (pageNumber: number) => {
      const page = await doc.getPage(pageNumber);
      return {
        streamTextContent: () => {
          let delivered = false;
          return {
            getReader: () => ({
              read: async () => {
                if (delivered) return { done: true, value: undefined };
                delivered = true;
                const { items } = await page.getTextContent();
                return { done: false, value: { items } };
              },
            }),
          };
        },
      };
    },
  };
}

describe('useFormFieldRegions on the SNG-10 practice form (product path)', () => {
  it('counts all 13 detected fields, the signature line included', async () => {
    const buffer = fs.readFileSync(PDF_PATH);
    // A jsdom `File`, like PdfSignTool.test.tsx's own fixtures use, not
    // Node's `Buffer.buffer` directly: `@cantoo/pdf-lib`'s validator checks
    // `instanceof ArrayBuffer` against jsdom's own global, and a Node-realm
    // ArrayBuffer fails that check even though it is one. `.arrayBuffer()`
    // is also called twice, deliberately, for its own reason: pdf.js's
    // `getDocument` transfers ownership of the buffer it is handed (postMessage
    // to its worker, even the in-thread fake one), which would otherwise
    // detach the very bytes the hook needs a moment later.
    const file = new File([buffer], 'sample.pdf', { type: 'application/pdf' });
    const bytes = await file.arrayBuffer();
    const pdfDocument = await loadPdfjsDocument(await file.arrayBuffer());

    const container = document.createElement('div');
    document.body.appendChild(container);
    try {
      let latest!: FormFieldRegions;
      function Probe() {
        latest = useFormFieldRegions(bytes, pdfDocument.numPages, pdfDocument as never);
        return null;
      }
      await act(async () => { render(<Probe />, container); });
      await vi.waitFor(() => expect(latest.detection).toBe('done'), { timeout: 10_000, interval: 20 });

      // The exact formula PdfWorkspace.tsx's toolbar reads (FORM-11) and
      // PdfSignTool.tsx's maintenance telemetry mirrors.
      const count = latest.combs.length + latest.cells.length + latest.checkboxes.length;
      expect(count).toBe(13);

      // The specific field this regression is about, named rather than just
      // counted: a signature-kind cell must still be in what the hook
      // publishes, even though it stays untypable (see the module doc above).
      expect(latest.cells.some((cell) => cell.kind === 'signature')).toBe(true);
    } finally {
      act(() => render(null, container));
      container.remove();
    }
  });
});
