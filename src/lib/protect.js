import { PDFDocument } from '@cantoo/pdf-lib';

export class ProtectError extends Error {
  constructor() {
    super('Failed to protect the PDF.');
    this.name = 'ProtectError';
  }
}

// Encrypts a PDF with a password and returns it as a Blob.
// Runs entirely in-memory in the browser — the password and file never leave the device.
export async function protectPdf(file, password) {
  const bytes = await file.arrayBuffer();

  let pdfDoc;
  try {
    // If the PDF is already encrypted, this will throw unless we provide the correct password,
    // but typically users upload unprotected PDFs to protect them. 
    // We do not pass ignoreEncryption: true because we can't save an already-encrypted PDF 
    // without decrypting it first.
    pdfDoc = await PDFDocument.load(bytes);
  } catch (err) {
    throw new ProtectError();
  }

  try {
    pdfDoc.encrypt({ userPassword: password, ownerPassword: password });
    const protectedBytes = await pdfDoc.save();
    return new Blob([protectedBytes], { type: 'application/pdf' });
  } catch (err) {
    throw new ProtectError();
  }
}
