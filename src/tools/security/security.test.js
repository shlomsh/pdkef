import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { probeEncryption } from '../../lib/pdfEncryption.ts';
import { unlockPdf, protectPdf, WrongPasswordError, SecurityError, UnreadablePdfError } from './security.js';

describe('security.js', () => {
  function getFixtureFile(name = 'num-1.pdf') {
    const filePath = path.resolve(__dirname, '../../lib/__fixtures__', name);
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

  const legacyPdfjs = () => pdfjs;
  const probe = (file) => file.arrayBuffer().then((bytes) => probeEncryption(bytes, legacyPdfjs));
  function encryptedFixture(name) {
    const buffer = fs.readFileSync(path.resolve(__dirname, '../../lib/__fixtures__/encrypted', `${name}.pdf`));
    return new File([buffer], `${name}.pdf`, { type: 'application/pdf' });
  }

  it('protects an unencrypted PDF and text survives round trip', async () => {
    const file = getFixtureFile();
    
    const protectedBlob = await protectPdf(file, 'newpass');
    expect(protectedBlob).toBeInstanceOf(Blob);

    const protectedFile = new File([protectedBlob], 'protected.pdf', { type: 'application/pdf' });
    expect(await probe(protectedFile)).toBe('needs-password');

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
    expect(await probe(unlockedFile)).toBe('open');

    const text = await extractTextFromPdfBlob(unlockedBlob);
    expect(text).toBe('1');
  });

  it('fails to unlock an encrypted PDF with wrong password', async () => {
    const blob = await createEncryptedPdfBlob('secret');
    const file = new File([blob], 'test.pdf', { type: 'application/pdf' });
    
    await expect(unlockPdf(file, 'wrong')).rejects.toThrow(WrongPasswordError);
  });

  it('unlocks an owner-password-only file with an empty password', async () => {
    const file = encryptedFixture('owner-only');
    expect(await probe(file)).toBe('owner-restricted');

    const unlocked = await unlockPdf(file, '');
    expect(await probe(new File([unlocked], 'u.pdf'))).toBe('open');
  });

  it('unlocks the needs-password fixture with its password and not without', async () => {
    const file = encryptedFixture('needs-password');
    const unlocked = await unlockPdf(file, 'u');
    expect(await probe(new File([unlocked], 'u.pdf'))).toBe('open');

    await expect(unlockPdf(file, 'wrong')).rejects.toThrow(WrongPasswordError);
    await expect(unlockPdf(file, '')).rejects.toThrow(WrongPasswordError);
  });

  it('tells a damaged file from a wrong password', async () => {
    const junk = new File([new Uint8Array([1, 2, 3, 4])], 'junk.pdf', { type: 'application/pdf' });
    const error = await unlockPdf(junk, 'anything').catch((err) => err);
    expect(error).toBeInstanceOf(UnreadablePdfError);
    expect(error).not.toBeInstanceOf(WrongPasswordError);
    expect(error.message).toBe('This file could not be unlocked. It may be damaged.');
  });
});
