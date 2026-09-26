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
import { fieldFontSize, placeTextOnField, type TypableField } from '../../editor/text/combPlacement.ts';
import { DEFAULT_FONT_FAMILY } from '../../constants/signGeometry.js';

/**
 * SIGN-32: one carried font and size per document, on the real practice
 * form. `fullNameFieldSizing.practiceForm.test.tsx` proves the first field
 * alone (seeding from nothing); this drives the same real detected geometry
 * (same product path as `useFormFieldRegions.practiceForm.test.tsx`) through
 * a whole fill, in order, the way `useWorkspaceGestures.ts`'s tap-to-place and
 * `useFieldNavigation.ts`'s Next/Previous actually do it: Full name (a cell,
 * ~22pt tall, seeds the carried size), the ID number comb (9 cells, 20x22pt),
 * date of birth (a cell), the postal code comb (7 cells), then a hand-placed
 * free text box with no field under it at all. Every one of these fields is
 * roomy enough to fit the size Full name seeds (14pt, `FIELD_FONT_MAX_PT`)
 * without shrinking, so the whole run should come back as one number.
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

describe('One carried font size across a filled form (SIGN-32, product path)', () => {
  it('places Full name, the ID comb, date of birth, the postal comb and a free text box with one font size across all of them', async () => {
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
      const dateOfBirth = latest.cells.find((cell) => (cell as { label?: string }).label === 'Date of birth');
      const idNumber = latest.combs.find((comb) => comb.pageIndex === 0 && comb.cells === 9);
      const postalCode = latest.combs.find((comb) => comb.pageIndex === 0 && comb.cells === 7);
      expect(fullName).toBeDefined();
      expect(dateOfBirth).toBeDefined();
      expect(idNumber).toBeDefined();
      expect(postalCode).toBeDefined();

      // Ground truth (practice-form-page1.json): both combs are 20pt-wide
      // cells on a ~22pt row, the same height Full name and Date of birth
      // detect at - the numbers the ticket's acceptance criterion names.
      expect((idNumber!.width / idNumber!.cells) / 100 * pageWidthPoints).toBeCloseTo(20, 0);
      expect(idNumber!.height / 100 * pageHeightPoints).toBeCloseTo(22, 0);
      expect((postalCode!.width / postalCode!.cells) / 100 * pageWidthPoints).toBeCloseTo(20, 0);
      expect(postalCode!.height / 100 * pageHeightPoints).toBeCloseTo(22, 0);

      // Mirrors useWorkspaceGestures.ts's/useFieldNavigation.ts's own
      // resolution: placeTextOnField for a detected field, fieldFontSize
      // directly for a hand-placed box with no field under it - the null
      // carriedFontSize on the very first call is what seeds the document's
      // one carried size; every call after only ever fits it.
      let carriedFontSize: number | null = null;
      const place = (field: TypableField) => {
        const placement = placeTextOnField(field, {
          carriedFontSize, fontFamily: DEFAULT_FONT_FAMILY, pageWidthPoints, pageHeightPoints,
        });
        if (carriedFontSize === null) carriedFontSize = placement.fontSize;
        return placement.fontSize;
      };

      const fullNameSize = place({ kind: 'cell', region: fullName! });
      const idNumberSize = place({ kind: 'comb', region: idNumber! });
      const dateOfBirthSize = place({ kind: 'cell', region: dateOfBirth! });
      const postalCodeSize = place({ kind: 'comb', region: postalCode! });
      // A free text box has no field to fit - it reads the carried size back
      // unchanged, the same call useWorkspaceGestures.ts's free-placement
      // branch makes.
      const freeTextSize = fieldFontSize(carriedFontSize, {});

      expect(carriedFontSize).not.toBeNull();
      expect(fullNameSize).toBe(carriedFontSize);
      expect(idNumberSize).toBe(carriedFontSize);
      expect(dateOfBirthSize).toBe(carriedFontSize);
      expect(postalCodeSize).toBe(carriedFontSize);
      expect(freeTextSize).toBe(carriedFontSize);
    } finally {
      act(() => render(null, container));
      container.remove();
    }
  });
});
