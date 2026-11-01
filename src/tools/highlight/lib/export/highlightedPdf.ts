import { drawElements } from '#editor/export/drawElements.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { openPdfDoc } from '#lib/pdf/openPdfDoc.ts';
import { withAffixes } from '#lib/output/outputName.ts';

/** The name a highlighted copy is saved under: `highlighted_<the source's own name>`. */
export const highlightedFileName = (sourceName: string) => withAffixes(sourceName, { prefix: 'highlighted_', ext: null });

/** The PDF with every highlight (and its comment) written in as a standard annotation. Highlight has no text, so no fonts load. */
export async function exportHighlighted(bytes: ArrayBuffer, elements: EditorElement[]): Promise<Uint8Array> {
  const { doc } = await openPdfDoc(bytes);
  await drawElements(doc, elements, {});
  return doc.save();
}
