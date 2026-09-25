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
 * SNG-10: the product path on the practice form. `score-form.mjs` scores
 * `detectFormFields` directly and finds all 13 spots (`baselines.json`'s
 * `pdkef-practice-form` row). The current editor's toolbar reads 12, on
 * purpose: `useFormFieldRegions.ts` keeps signature-kind cells out of Sign
 * (MOBI-11, a848570c), because a signature is placed through the signature
 * dialog, never as a typed snap, and a marked spot that does nothing on tap
 * would be a promise the editor does not keep. The next-generation editor
 * decides how a found signature line is offered (SNG-05,
 * docs/sign-next-gen-guidelines.md: "Sign" at a found signature line); until
 * then this pins the difference so it is a decision, not drift.
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
  it('counts 12: every detected spot except the signature line, which Sign keeps out', async () => {
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
      expect(count).toBe(12);

      // The one detected spot the current editor leaves out, named rather than just counted.
      expect(latest.cells.some((cell) => (cell as { kind?: string }).kind === 'signature')).toBe(false);
    } finally {
      act(() => render(null, container));
      container.remove();
    }
  });

  it('publishes the ID number comb as its own nine cells, not grown into the Full name box above it', async () => {
    // SNG-10 follow-up: `FormFieldHints.module.css`'s `.field-hint-comb`
    // grows an OPEN comb's teeth-height region up to the writable strip, and
    // used to be applied to every comb regardless of `boxed` - a BOXED
    // comb's region is already the printed cells (formGrid.js measures the
    // box walls, not teeth), so the same growth doubled its hint upward into
    // whatever sat above it. This drives the hook the product path renders
    // from (see the module doc above) and checks the *published* region -
    // what `FormFieldHints` and `combPlacement.ts` both read - against the
    // form's own defined rect (practice-form-page1.json's `id_number`
    // target: x 0.0807, y 0.2138, width 0.3025, height 0.0261, page
    // 595x842pt), not a value re-derived from this test.
    const buffer = fs.readFileSync(PDF_PATH);
    const file = new File([buffer], 'sample.pdf', { type: 'application/pdf' });
    const bytes = await file.arrayBuffer();
    const pdfDocument = await loadPdfjsDocument(await file.arrayBuffer());
    const pageWidthPoints = 595;
    const pageHeightPoints = 842;
    // 0.5pt, in the editor's page-percent units on each axis.
    const toleranceX = (0.5 / pageWidthPoints) * 100;
    const toleranceY = (0.5 / pageHeightPoints) * 100;

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

      const idNumber = latest.combs.find((comb) => comb.pageIndex === 0 && comb.cells === 9);
      expect(idNumber).toBeDefined();
      expect(idNumber!.boxed).toBe(true);
      expect(idNumber!.left).toBeCloseTo(8.0672, 3);
      expect(idNumber!.top).toBeCloseTo(21.3777, 3);
      expect(idNumber!.width).toBeCloseTo(30.2521, 3);
      // The one that used to fail: `.field-hint-comb`'s growth is a rendering
      // concern this hook's own output never carried, but this pins the
      // published height against the ground truth within 0.5pt either way,
      // rather than only against the code's own arithmetic.
      expect(Math.abs(idNumber!.height - 2.6128)).toBeLessThan(toleranceY);
      expect(Math.abs(idNumber!.left - 8.07)).toBeLessThan(toleranceX);
      expect(Math.abs(idNumber!.top - 21.38)).toBeLessThan(toleranceY);
    } finally {
      act(() => render(null, container));
      container.remove();
    }
  });
});
