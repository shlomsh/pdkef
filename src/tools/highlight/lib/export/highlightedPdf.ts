import { degrees } from '@cantoo/pdf-lib';
import { drawElements } from '#editor/export/drawElements.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import type { PageTurns } from '#editor/geometry/pageTurn.ts';
import { applyRotation } from '#lib/pages/pageOps.js';
import { openPdfDoc } from '#lib/pdf/openPdfDoc.ts';
import { withAffixes } from '#lib/output/outputName.ts';

/** The name a highlighted copy is saved under: `highlighted_<the source's own name>`. */
export const highlightedFileName = (sourceName: string) => withAffixes(sourceName, { prefix: 'highlighted_', ext: null });

/** The PDF with every highlight (and its comment) written in as a standard annotation. Highlight has no text, so no fonts load. */
export async function exportHighlighted(bytes: ArrayBuffer, elements: EditorElement[], pageTurns: PageTurns = {}): Promise<Uint8Array> {
  const { doc } = await openPdfDoc(bytes);
  // Turn the pages before any geometry is read: marks are stored in percent of the turned page.
  for (const [index, turns] of Object.entries(pageTurns)) {
    if (!(Number(index) in doc.getPages())) continue;
    const page = doc.getPage(Number(index));
    applyRotation(page, 90 * turns);
    const angle = page.getRotation().angle;
    if (angle >= 360) page.setRotation(degrees(angle % 360));
  }
  await drawElements(doc, elements, {});
  return doc.save();
}
