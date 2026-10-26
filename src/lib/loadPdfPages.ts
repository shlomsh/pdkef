/**
 * How Edit PDF and Split open a PDF with pdf-lib and read its pages (DEBT-54): `openPdfDoc` with the
 * page-tree repair and pdf-lib's encrypted-file handling switched to 'ignore' (the caller checks
 * `doc.isEncrypted`). Keeps the input's own `bytes` when nothing was repaired, so a caller that
 * hands them to pdf.js keeps its ArrayBuffer.
 */
import { openPdfDoc } from './openPdfDoc';

type Bytes = ArrayBuffer | Uint8Array;

export async function loadPdfWithPages(bytes: Bytes) {
  const opened = await openPdfDoc(bytes, { encryption: 'ignore', repair: true });
  return {
    doc: opened.doc,
    pageCount: opened.pageCount as number,
    bytes: opened.repaired ? (opened.bytes as Bytes) : bytes,
    repaired: opened.repaired,
  };
}
