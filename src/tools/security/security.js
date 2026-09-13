import { PDFDocument } from '@cantoo/pdf-lib';

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
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return pdfDoc.isEncrypted;
  } catch (err) {
    return false; // If we can't load it even with ignoreEncryption, it's malformed, but we treat it as unencrypted for our flow
  }
}

// Decrypts a password-protected PDF and returns an unencrypted copy as a Blob.
export async function unlockPdf(file, password) {
  const bytes = await file.arrayBuffer();

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
