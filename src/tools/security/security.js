import { getPdfLib } from '../../lib/pdfLib.js';
import { reportError } from '../../lib/errorReport.ts';

export class SecurityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecurityError';
  }
}

export class WrongPasswordError extends SecurityError {
  constructor() {
    super('Incorrect password for this PDF.');
    this.name = 'WrongPasswordError';
  }
}

// The file would not open for a reason other than its password: damaged, or not a PDF.
export class UnreadablePdfError extends SecurityError {
  constructor() {
    super('This file could not be unlocked. It may be damaged.');
    this.name = 'UnreadablePdfError';
  }
}

// pdf-lib's own wording for a bad password ('Password incorrect', or 'NEEDS PASSWORD' for an empty one).
const isPasswordFailure = (err) => /password/i.test(err?.message ?? '');

// Decrypts a password-protected PDF and returns an unencrypted copy as a Blob.
// An owner-password-only file opens with an empty password.
export async function unlockPdf(file, password) {
  const bytes = await file.arrayBuffer();
  // Outside the try below, whose catch means "wrong password": a failure to
  // load pdf-lib itself must not be reported as a bad password.
  const { PDFDocument } = await getPdfLib();

  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(bytes, { password });
  } catch (err) {
    throw isPasswordFailure(err) ? new WrongPasswordError() : new UnreadablePdfError();
  }

  const unlockedBytes = await pdfDoc.save();
  return new Blob([unlockedBytes], { type: 'application/pdf' });
}

// Encrypts a PDF with a password and returns it as a Blob.
export async function protectPdf(file, password) {
  const bytes = await file.arrayBuffer();
  // Outside the try below for the same reason as in unlockPdf: its catch
  // blames an already-encrypted file, which a chunk-load failure is not.
  const { PDFDocument } = await getPdfLib();

  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(bytes);
  } catch (err) {
    throw new SecurityError('Failed to protect PDF. It might already be encrypted.');
  }

  try {
    pdfDoc.encrypt({ userPassword: password, ownerPassword: password });
    const protectedBytes = await pdfDoc.save();
    return new Blob([protectedBytes], { type: 'application/pdf' });
  } catch (err) {
    reportError('pdf_tool_run', err, 'protect');
    throw new SecurityError('Failed to protect the PDF.');
  }
}
