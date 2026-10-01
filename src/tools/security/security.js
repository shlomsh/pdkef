import { getPdfLib } from '../../lib/pdfLib.js';

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

// The file could not be read at all: the bytes were unreachable or are not a PDF.
export class UnreadablePdfError extends SecurityError {
  constructor() {
    super('This PDF could not be read. It may be damaged.');
    this.name = 'UnreadablePdfError';
  }
}

// Checks if a PDF is encrypted. Throws UnreadablePdfError when the file cannot
// be read or parsed (even with ignoreEncryption), so the caller can say so
// instead of offering a form that can only fail.
export async function isPdfEncrypted(file) {
  // Outside the try below, whose catch means "this file is unreadable": a
  // failure to load pdf-lib itself is not the file's fault and propagates.
  const { PDFDocument } = await getPdfLib();
  try {
    const bytes = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return pdfDoc.isEncrypted;
  } catch (err) {
    throw new UnreadablePdfError();
  }
}

// Decrypts a password-protected PDF and returns an unencrypted copy as a Blob.
export async function unlockPdf(file, password) {
  const bytes = await file.arrayBuffer();
  // Outside the try below, whose catch means "wrong password": a failure to
  // load pdf-lib itself must not be reported as a bad password.
  const { PDFDocument } = await getPdfLib();

  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(bytes, { password });
  } catch (err) {
    throw new WrongPasswordError();
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
    throw new SecurityError('Failed to protect the PDF.');
  }
}
