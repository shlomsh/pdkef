import { useEffect, useState } from 'preact/hooks';
import type { CombRegion, FieldRegion } from '../editor/text/combPlacement.ts';

/**
 * The printed grids on the loaded PDF, detected once per file.
 *
 * Runs entirely on-device, like everything else here: the bytes are already in
 * memory and nothing is fetched. The detector and `@cantoo/pdf-lib` arrive via
 * a dynamic import for the same reason the serializers do - neither belongs in
 * the editor's initial hydration, and a document with no grids in it should
 * cost nothing but the walk.
 *
 * Detection failure is deliberately silent. This is an accelerator on top of
 * placing a text box by hand, so a PDF whose content stream cannot be walked
 * should leave the editor exactly as it was rather than raise an error about a
 * feature the person never asked for.
 */
export interface FormFieldRegions {
  combs: CombRegion[];
  checkboxes: FieldRegion[];
}

const NONE: FormFieldRegions = { combs: [], checkboxes: [] };

export default function useFormFieldRegions(
  bytes: ArrayBuffer | null,
  numPages: number,
): FormFieldRegions {
  const [regions, setRegions] = useState<FormFieldRegions>(NONE);

  useEffect(() => {
    if (!bytes || numPages <= 0) {
      setRegions(NONE);
      return undefined;
    }
    let current = true;
    setRegions(NONE);

    (async () => {
      try {
        const [{ PDFDocument }, { detectPageRegions }] = await Promise.all([
          import('@cantoo/pdf-lib'),
          import('../editor/adapters/pdf/formGrid.js'),
        ]);
        const document = await PDFDocument.load(bytes.slice(0), {
          ignoreEncryption: true,
          updateMetadata: false,
        });
        if (!current) return;
        const found: FormFieldRegions = { combs: [], checkboxes: [] };
        for (let pageIndex = 0; pageIndex < document.getPageCount(); pageIndex += 1) {
          const page = detectPageRegions(document.getPage(pageIndex), pageIndex);
          found.combs.push(...page.combs);
          found.checkboxes.push(...page.checkboxes);
        }
        if (current) setRegions(found);
      } catch {
        if (current) setRegions(NONE);
      }
    })();

    return () => { current = false; };
  }, [bytes, numPages]);

  return regions;
}
