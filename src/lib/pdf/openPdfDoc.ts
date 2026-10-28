/**
 * The one way to open a PDF with pdf-lib (ARCH-39): which encryption policy, and whether to
 * repair a lost page tree (DEBT-54). Every tool that opens a document with pdf-lib goes through here.
 *
 * `PDFDocument.load` succeeds on a file whose catalog lost its /Pages entry and only
 * `getPageCount()` throws. With `repair`, when exactly one page-tree root survives we repoint
 * the catalog at it, save, and hand back the repaired bytes so pdf.js (thumbnails) and export
 * read the same file. Anything we cannot repair rethrows the ORIGINAL error, so error reports
 * keep pdf-lib's frames.
 */
import { getPdfLib } from './pdfLib.js';
import { toBytes } from '../output/toBytes.js';
import { diagnosePageTree, repairPageTree } from './pdfPageTree';
import { beaconMaintenanceTransport, pdfPageTreeFailed, pdfPageTreeRepaired, reportMaintenanceEvent } from '../telemetry/maintenanceTelemetry';

type PdfLib = typeof import('@cantoo/pdf-lib');
type Doc = import('@cantoo/pdf-lib').PDFDocument;
type Input = File | Blob | ArrayBuffer | ArrayBufferView;

export type OpenPdfDocOptions = {
  /**
   * 'throw' (default): pdf-lib's own behaviour, an encrypted file throws.
   * 'ignore': open it anyway (an owner-only file loads, its streams stay encrypted, check `doc.isEncrypted`).
   * 'empty-password': like 'ignore', then an encrypted file is re-read with the empty password so an
   *   owner-password-only PDF opens decrypted; one that needs a real password stays the first read, `unlocked: false`.
   */
  encryption?: 'throw' | 'ignore' | 'empty-password';
  /** With 'empty-password': asked about the still-encrypted first read; false skips the retry. */
  shouldUnlock?: (encrypted: Doc) => boolean;
  /** Open with this password (an unlock). Overrides `encryption`. */
  password?: string;
  /** Repair a lost /Pages, see the file comment. Reads the page count, so a file with no page list throws here. */
  repair?: boolean;
  /** pdf-lib stamps a new Producer/ModDate on save unless this is false. Default: pdf-lib's (true). */
  updateMetadata?: boolean;
  /** Skip pdf-lib's per-object yielding: for read-only inspection, never for a document we will edit. */
  fast?: boolean;
};

export type OpenedPdfDoc = {
  doc: Doc;
  /** The bytes `doc` was read from: the repaired copy after a repair, else the input as a Uint8Array. */
  bytes: Uint8Array;
  repaired: boolean;
  /** Set with `repair`. */
  pageCount: number | null;
  /** The first, still-encrypted read when 'empty-password' found an encrypted file, else null. */
  encrypted: Doc | null;
  /** 'empty-password': the empty password opened it. */
  unlocked: boolean;
};

// pdf-lib's own wording for a bad password ('Password incorrect', or 'NEEDS PASSWORD' for an empty one).
const isPasswordFailure = (error: unknown) => /password/i.test((error as Error)?.message ?? '');

export async function openPdfDoc(input: Input, options: OpenPdfDocOptions = {}): Promise<OpenedPdfDoc> {
  const { encryption = 'throw', shouldUnlock, password, repair = false, updateMetadata, fast = false } = options;
  const bytes = await toBytes(input);
  const lib = await getPdfLib();
  const base = {
    ...(updateMetadata === undefined ? {} : { updateMetadata }),
    ...(fast ? { parseSpeed: lib.ParseSpeeds.Fastest } : {}),
  };

  let doc: Doc;
  let encrypted: Doc | null = null;
  let unlocked = false;
  if (password !== undefined) {
    doc = await lib.PDFDocument.load(bytes, { ...base, password });
  } else if (encryption === 'throw') {
    doc = await lib.PDFDocument.load(bytes, base);
  } else {
    doc = await lib.PDFDocument.load(bytes, { ...base, ignoreEncryption: true });
    if (encryption === 'empty-password' && doc.isEncrypted && (shouldUnlock?.(doc) ?? true)) {
      encrypted = doc;
      try {
        doc = await lib.PDFDocument.load(bytes, { ...base, password: '' });
        unlocked = true;
      } catch (error) {
        // expected: a file that needs a real password is the person's file; keep the first read
        if (!isPasswordFailure(error)) throw error;
      }
    } else if (encryption === 'empty-password' && doc.isEncrypted) {
      encrypted = doc;
    }
  }

  if (!repair) return { doc, bytes, repaired: false, pageCount: null, encrypted, unlocked };
  try {
    return { doc, bytes, repaired: false, pageCount: doc.getPageCount(), encrypted, unlocked };
  } catch (error) {
    const recovered = await recoverPageTree(doc, lib);
    if (recovered) return { ...recovered, encrypted, unlocked };
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
  return { doc, bytes: saved, repaired: true, pageCount: doc.getPageCount() };
}
