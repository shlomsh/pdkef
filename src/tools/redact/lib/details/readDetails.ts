import type { DocumentTraces } from '../documentTraces.js';

/**
 * RED-59: what a file says about itself, read from its bytes on the device.
 * pdf-lib and the adapter load on demand so /redact/'s first paint carries
 * neither. Reads the bytes held since load, never the picked File, which Chromium
 * refuses to read twice once it has moved on disk.
 */
export async function readDetails(bytes: ArrayBuffer): Promise<DocumentTraces> {
  const [{ openPdfDoc }, { readDocumentTraces }] = await Promise.all([
    import('../../../../lib/openPdfDoc'),
    import('../documentTraces.js'),
  ]);
  const { doc } = await openPdfDoc(bytes, { updateMetadata: false, fast: true });
  return readDocumentTraces(doc);
}
