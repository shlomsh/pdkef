import type { DocumentTraces } from '../../../editor/adapters/pdf/documentTraces.js';

/**
 * RED-59: what a file says about itself, read from its bytes on the device.
 * pdf-lib and the adapter load on demand so /redact/'s first paint carries
 * neither.
 */
export async function readDetails(file: File | Blob): Promise<DocumentTraces> {
  const [{ PDFDocument, ParseSpeeds }, { readDocumentTraces }] = await Promise.all([
    import('@cantoo/pdf-lib'),
    import('../../../editor/adapters/pdf/documentTraces.js'),
  ]);
  const doc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false, parseSpeed: ParseSpeeds.Fastest });
  return readDocumentTraces(doc);
}
