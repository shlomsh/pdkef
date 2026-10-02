/**
 * Is this PDF protected, and how? One answer for every tool, taken from pdf.js (the one parser that
 * tells the two kinds of protection apart):
 *
 * - `needs-password`: pdf.js rejects with `PasswordException`; a person has to type a password to open it.
 * - `owner-restricted`: it opens with no password (empty user password) but carries an owner password and
 *   permission flags. pdf.js renders it fine; pdf-lib refuses it, and `ignoreEncryption: true` copies the
 *   still-encrypted page streams into a blank file (docs/encrypted-pdf-unlock-handoff.md, section 4).
 * - `open`: not encrypted.
 * - `unreadable`: damaged or not a PDF. A different problem, with its own message.
 *
 * Not pdf-lib's `isEncrypted` (cannot tell the kinds apart, reads a truncated encrypted file as plain) and
 * not a byte scan (wrong on object-stream files and on `/Encrypt` text in a comment); the measurements are
 * in the plan, section 2.
 */
import { getPdfjs } from './thumbnails.js';
import { PDFJS_WASM_URL } from './pdfjsWasm.js';

export type PdfProtection = 'open' | 'needs-password' | 'owner-restricted' | 'unreadable';

/** What pdf.js said when asked to open the file with no password. */
export type PdfOpenOutcome =
  | { opened: true; permissions: unknown }
  | { opened: false; error: unknown };

const UNREADABLE_ERRORS = new Set(['InvalidPDFException', 'MissingPDFException', 'FormatError']);

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : '';
}

/**
 * Pure. `permissions` is `getPermissions()`: `null` for a file that is not encrypted, a set (possibly
 * empty) for any encrypted file. An error that is neither a password nor a damaged-file error is not ours
 * to classify and is rethrown.
 */
export function classifyPdfOpen(outcome: PdfOpenOutcome): PdfProtection {
  if (outcome.opened) return outcome.permissions === null || outcome.permissions === undefined ? 'open' : 'owner-restricted';
  const name = errorName(outcome.error);
  if (name === 'PasswordException') return 'needs-password';
  if (UNREADABLE_ERRORS.has(name)) return 'unreadable';
  throw outcome.error;
}

type PdfjsLike = {
  getDocument: (src: Record<string, unknown>) => {
    promise: Promise<{ getPermissions: () => Promise<unknown>; destroy: () => Promise<void> }>;
    destroy: () => Promise<void>;
  };
};

/**
 * Open the bytes with pdf.js and no password, classify, and let go. Copies the bytes first because pdf.js
 * transfers its input to the worker. `loadPdfjs` is for tests, which pass the legacy build under Node.
 */
export async function probeEncryption(
  bytes: ArrayBuffer | Uint8Array,
  loadPdfjs: () => Promise<PdfjsLike> = getPdfjs as unknown as () => Promise<PdfjsLike>,
): Promise<PdfProtection> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).slice();
  const task = pdfjs.getDocument({ data, wasmUrl: PDFJS_WASM_URL });
  let outcome: PdfOpenOutcome;
  try {
    const doc = await task.promise;
    outcome = { opened: true, permissions: await doc.getPermissions() };
  } catch (error) {
    // expected: the failure is the answer, classifyPdfOpen names it or rethrows what it does not know
    outcome = { opened: false, error };
  }
  // expected: a task that already failed has nothing left to release
  await task.destroy().catch(() => {});
  return classifyPdfOpen(outcome);
}
