/**
 * How Edit PDF and Split open a PDF with pdf-lib and read its pages (DEBT-54).
 *
 * `PDFDocument.load` succeeds on a file whose catalog lost its /Pages entry and only
 * `getPageCount()` throws. When exactly one page-tree root survives we repair it, save,
 * and hand back the repaired bytes so pdf.js (thumbnails) and export read the same file.
 * Anything we cannot repair rethrows the ORIGINAL error, so error reports keep pdf-lib's frames.
 */
import { getPdfLib } from './pdfLib.js';
import { diagnosePageTree, repairPageTree } from './pdfPageTree';
import { beaconMaintenanceTransport, pdfPageTreeFailed, pdfPageTreeRepaired, reportMaintenanceEvent } from './maintenanceTelemetry';

type Bytes = ArrayBuffer | Uint8Array;
type PdfLib = typeof import('@cantoo/pdf-lib');
type Doc = import('@cantoo/pdf-lib').PDFDocument;

export async function loadPdfWithPages(bytes: Bytes) {
  const lib = await getPdfLib();
  const doc = await lib.PDFDocument.load(bytes, { ignoreEncryption: true });
  try {
    return { doc, pageCount: doc.getPageCount(), bytes, repaired: false };
  } catch (error) {
    const repaired = await recoverPageTree(doc, lib);
    if (repaired) return repaired;
    throw error;
  }
}

/** The repaired document and its bytes, or null when the page list cannot be rebuilt. */
async function recoverPageTree(doc: Doc, lib: PdfLib) {
  // An encrypted file fails for its own reason; the encryption gate handles it.
  if (doc.isEncrypted) return null;
  const found = diagnosePageTree(doc, lib);
  if (!found) return null;
  if (!repairPageTree(doc, lib)) {
    reportMaintenanceEvent(pdfPageTreeFailed(found.shape, found.roots), beaconMaintenanceTransport);
    return null;
  }
  const saved = await doc.save();
  // Counted only once the repaired bytes exist: a save that throws is a failure, reported by the caller.
  reportMaintenanceEvent(pdfPageTreeRepaired(found.shape), beaconMaintenanceTransport);
  return { doc, pageCount: doc.getPageCount(), bytes: saved as Bytes, repaired: true };
}
