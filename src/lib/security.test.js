import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { isPdfEncrypted, unlockPdf, protectPdf, WrongPasswordError, SecurityError } from './security.js';

describe('security.js', () => {
  function getFixtureFile(name = 'num-1.pdf') {
    const filePath = path.resolve(__dirname, './__fixtures__', name);
    const buffer = fs.readFileSync(filePath);
    return new File([buffer], name, { type: 'application/pdf' });
  }

  async function createEncryptedPdfBlob(password) {
    const file = getFixtureFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    doc.encrypt({ userPassword: password, ownerPassword: password });
    const encryptedBytes = await doc.save();
    return new Blob([encryptedBytes], { type: 'application/pdf' });
  }

  async function extractTextFromPdfBlob(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      useWorkerFetch: false,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    const text = textContent.items.map(item => item.str).join('').trim();
    await loadingTask.destroy();
    return text;
  }

  it('detects an unencrypted PDF', async () => {
    const file = getFixtureFile();
    const isEnc = await isPdfEncrypted(file);
    expect(isEnc).toBe(false);
  });

  it('detects an encrypted PDF', async () => {
    const blob = await createEncryptedPdfBlob('secret');
    const file = new File([blob], 'test.pdf', { type: 'application/pdf' });
    const isEnc = await isPdfEncrypted(file);
    expect(isEnc).toBe(true);
  });

  it('protects an unencrypted PDF and text survives round trip', async () => {
    const file = getFixtureFile();
    
    const protectedBlob = await protectPdf(file, 'newpass');
    expect(protectedBlob).toBeInstanceOf(Blob);

    const protectedFile = new File([protectedBlob], 'protected.pdf', { type: 'application/pdf' });
    const isEnc = await isPdfEncrypted(protectedFile);
    expect(isEnc).toBe(true);

    // Now unlock and assert the text survives
    const unlockedBlob = await unlockPdf(protectedFile, 'newpass');
    const text = await extractTextFromPdfBlob(unlockedBlob);
    expect(text).toBe('1');
  });

  it('fails to protect an already encrypted PDF', async () => {
    const blob = await createEncryptedPdfBlob('secret');
    const file = new File([blob], 'test.pdf', { type: 'application/pdf' });
    
    await expect(protectPdf(file, 'newpass')).rejects.toThrow(SecurityError);
  });

  it('unlocks an encrypted PDF with correct password', async () => {
    const blob = await createEncryptedPdfBlob('secret');
    const file = new File([blob], 'test.pdf', { type: 'application/pdf' });
    
    const unlockedBlob = await unlockPdf(file, 'secret');
    expect(unlockedBlob).toBeInstanceOf(Blob);

    const unlockedFile = new File([unlockedBlob], 'unlocked.pdf', { type: 'application/pdf' });
    const isEnc = await isPdfEncrypted(unlockedFile);
    expect(isEnc).toBe(false);

    const text = await extractTextFromPdfBlob(unlockedBlob);
    expect(text).toBe('1');
  });

  it('fails to unlock an encrypted PDF with wrong password', async () => {
    const blob = await createEncryptedPdfBlob('secret');
    const file = new File([blob], 'test.pdf', { type: 'application/pdf' });
    
    await expect(unlockPdf(file, 'wrong')).rejects.toThrow(WrongPasswordError);
  });
});
