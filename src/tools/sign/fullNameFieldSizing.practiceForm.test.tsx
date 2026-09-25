// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import fs from 'node:fs';
// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import path from 'node:path';
// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import { createRequire } from 'node:module';
import { PDFDocument } from '@cantoo/pdf-lib';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import useFormFieldRegions from './useFormFieldRegions.ts';
import type { FormFieldRegions } from './useFormFieldRegions.ts';
import { placeTextOnField } from '../../editor/text/combPlacement.ts';
import { DEFAULT_FONT_FAMILY, TEXT_BOX_LINE_HEIGHT_EM } from '../../constants/signGeometry.js';

/**
 * SNG-10 follow-up, generalized under SIGN-32: a tap on the practice form's
 * detected "Full name" box (a lone, caption-less cell, 22pt tall -
 * `formCells.js`'s new lone-box rule is what makes it detectable at all) used
 * to hand a fresh session's 12pt remembered font straight through, because
 * the sizing function only ever shrunk a size that overflowed the field,
 * never grew one that under-filled it. The owner's report: the placeholder
 * rendered at "roughly a third of the box height", and on a phone the new box
 * sat as a thin strip in the field's middle.
 *
 * Today the fix is stated as SIGN-32's carried-size rule: a document with no
 * carried size yet takes one from the first field that needs it, seeded from
 * that field's own height - this is that seeding, on a document with nothing
 * carried (`carriedFontSize: null`). `carriedFontSize.practiceForm.test.tsx`
 * carries this same real geometry on through the rest of the form.
 *
 * This drives the real hook against the real practice form (same product
 * path as `useFormFieldRegions.practiceForm.test.tsx`), then feeds the
 * detected "Full name" region through `placeTextOnField` - the one function
 * `useWorkspaceGestures.ts`'s tap-to-place and `useFieldNavigation.ts`'s
 * Next/Previous both call - to prove the sizing rule lands where the fix
 * intends on the actual detected geometry, not just on hand-built fixtures.
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
    // not `PDFPageProxy.getTextContent()` directly - see that test's own
    // docstring for why the hook drains `streamTextContent()` with a reader.
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

describe('Full name field sizing on the SNG-10 practice form (product path)', () => {
  it('sizes a fresh session\'s box from the field, not a small remembered default', async () => {
    const buffer = fs.readFileSync(PDF_PATH);
    const file = new File([buffer], 'sample.pdf', { type: 'application/pdf' });
    const bytes = await file.arrayBuffer();
    const pdfDocument = await loadPdfjsDocument(await file.arrayBuffer());
    const pdfLibDoc = await PDFDocument.load(await file.arrayBuffer());
    const { height: pageHeightPoints, width: pageWidthPoints } = pdfLibDoc.getPage(0).getSize();

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

      const fullName = latest.cells.find((cell) => (cell as { label?: string }).label === 'Full name');
      expect(fullName).toBeDefined();
      // The bug report's own numbers: a closed box, no caption inside it (so
      // no `writable` carve narrows it further), 22pt tall.
      expect(fullName!.height / 100 * pageHeightPoints).toBeCloseTo(22, 0);
      expect(fullName).not.toHaveProperty('writable');

      const placement = placeTextOnField(
        { kind: 'cell', region: fullName! },
        {
          // A document with nothing carried yet: this is the seeding case,
          // not the ordinary shrink-only fit (SIGN-32).
          carriedFontSize: null,
          fontFamily: DEFAULT_FONT_FAMILY,
          pageWidthPoints,
          pageHeightPoints,
        },
      );
      const fontSize = (placement as { fontSize: number }).fontSize;

      // Seeded, not passed straight through: it grows toward the field's own
      // fill target. The intended range from the task brief - roughly
      // 60-70% of the field, capped 12-14pt - resolves to exactly 14pt on
      // this 22pt field (FIELD_FONT_MAX_PT caps it before the ratio would
      // carry it past 14). This computed size, uncorrected, becomes the
      // carried size for the rest of the document.
      expect(fontSize).toBeGreaterThanOrEqual(12);
      expect(fontSize).toBeLessThanOrEqual(14);

      // The placed box itself must sit well inside the 22pt field, not as a
      // thin strip in the middle of it.
      const boxHeightPt = fontSize * TEXT_BOX_LINE_HEIGHT_EM;
      expect(boxHeightPt).toBeGreaterThan(15);
      expect(boxHeightPt).toBeLessThan(22);
    } finally {
      act(() => render(null, container));
      container.remove();
    }
  });
});
