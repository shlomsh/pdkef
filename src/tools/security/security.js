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

// Checks if a PDF is encrypted
export async function isPdfEncrypted(file) {
  const bytes = await file.arrayBuffer();
  try {
    // The load sits inside the try as well: this runs the moment a file is
    // picked, and its caller has no catch, so a rejection here would leave
    // the tool stuck on "Checking file" with no way forward.
    const { PDFDocument } = await getPdfLib();
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return pdfDoc.isEncrypted;
  } catch (err) {
    return false; // If we can't load it even with ignoreEncryption, it's malformed, but we treat it as unencrypted for our flow
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
