import type { EditorElement } from '../model/editorModel.ts';

/**
 * SIGN-44's read-back (docs/sign-comments-model.md, Round-trip contract): a freshly opened file's standard
 * highlights and comments become editable elements and leave the PDF. The reader loads on demand.
 */
export async function readBackAnnotations(bytes: ArrayBuffer): Promise<{ bytes: ArrayBuffer; elements: EditorElement[] }> {
  try {
    const { importStandardAnnotations } = await import('./importAnnotations.ts');
    return await importStandardAnnotations(bytes);
  } catch {
    // expected: the reader chunk cannot load while offline, so the file opens untouched as before
    return { bytes, elements: [] };
  }
}
