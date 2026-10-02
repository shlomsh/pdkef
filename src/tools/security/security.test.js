import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { PDFDocument, PDFName, PDFString, PDFHexString } from '@cantoo/pdf-lib';
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

  // Everything a reader shows: page text, the title and the form fields' names and values.
  async function readWithPdfjs(bytes, password) {
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes).slice(), password, useWorkerFetch: false, isEvalSupported: false });
    const pdf = await loadingTask.promise;
    const pages = [];
    const fields = {};
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      pages.push((await page.getTextContent()).items.map((item) => item.str).join(' ').trim());
      const annotations = await page.getAnnotations();
      for (const a of annotations) if (a.fieldName) fields[a.fieldName] = a.fieldValue;
    }
    const { info } = await pdf.getMetadata();
    await loadingTask.destroy();
    return { pages, title: info.Title, fields };
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
    const { pages } = await readWithPdfjs(new Uint8Array(await unlockedBlob.arrayBuffer()));
    expect(pages[0]).toBe('1');
  });

  // What a person sees: lock a file, unlock it with the same password, and
  // the result opens elsewhere with every page, its text, its title and its
  // form fields intact. Read with pdf.js, not pdf-lib, so the writer is never
  // also the judge. A file saved without object streams leaves strings as
  // top-level objects, which is where both directions go wrong.
  it.each([
    ['with object streams', true],
    ['without object streams', false],
  ])('a protected file unlocks with the same password into the same document (%s)', async (_, useObjectStreams) => {
    const doc = await PDFDocument.load(await getFixtureFile('three-page-header.pdf').arrayBuffer());
    doc.setTitle('Quarterly report');
    const field = doc.getForm().createTextField('full_name');
    field.setText('Dana Levi');
    field.addToPage(doc.getPage(0), { x: 40, y: 40, width: 200, height: 20 });
    const original = await doc.save({ useObjectStreams });

    const protectedFile = new File([await protectPdf(new File([original], 'a.pdf'), 'test123')], 'a_protected.pdf');
    const unlocked = new Uint8Array(await (await unlockPdf(protectedFile, 'test123')).arrayBuffer());

    const before = await readWithPdfjs(original);
    expect(before.fields).toEqual({ full_name: 'Dana Levi' });
    expect(await readWithPdfjs(unlocked)).toEqual(before);
  });

  // A real government form (xref and object streams, 5 pages): its unlocked
  // copy would not open at all. The bytes are the Sign corpus's, read in place.
  it('a real form protected and unlocked with the same password still opens, page for page', async () => {
    const formPath = path.resolve(__dirname, '../sign/fields/corpus/scoring/forms/thai-pnd90-2565.pdf');
    const original = fs.readFileSync(formPath);

    const protectedFile = new File([await protectPdf(new File([original], 'form.pdf'), 'test123')], 'form_protected.pdf');
    const unlocked = new Uint8Array(await (await unlockPdf(protectedFile, 'test123')).arrayBuffer());

    expect(await readWithPdfjs(unlocked)).toEqual(await readWithPdfjs(original));
  }, 30000);

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

    const { pages } = await readWithPdfjs(new Uint8Array(await unlockedBlob.arrayBuffer()));
    expect(pages[0]).toBe('1');
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

  async function protectedWith(entries) {
    const file = getFixtureFile();
    const doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()));
    entries(doc);
    const withExtra = new File([await doc.save()], 'extra.pdf', { type: 'application/pdf' });
    const blob = await protectPdf(withExtra, 'pw');
    return { blob, bytes: Buffer.from(await blob.arrayBuffer()).toString('latin1') };
  }

  it('encrypts strings inside a stream dictionary and decrypts them on unlock', async () => {
    const { blob, bytes } = await protectedWith((doc) => {
      const ref = doc.context.register(doc.context.flateStream('x', { Foo: PDFString.of('hello') }));
      doc.catalog.set(PDFName.of('TestStream'), ref);
    });
    expect(bytes).not.toContain('(hello)');
    const unlocked = await unlockPdf(new File([blob], 'p.pdf', { type: 'application/pdf' }), 'pw');
    const reloaded = await PDFDocument.load(new Uint8Array(await unlocked.arrayBuffer()));
    const stream = reloaded.catalog.lookup(PDFName.of('TestStream'));
    expect(stream.dict.lookup(PDFName.of('Foo')).decodeText()).toBe('hello');
  });

  it('leaves a signature dictionary /Contents unencrypted', async () => {
    const { bytes } = await protectedWith((doc) => {
      const ref = doc.context.register(doc.context.obj({ Type: 'Sig', Contents: PDFHexString.of('00aabbcc') }));
      doc.catalog.set(PDFName.of('TestSig'), ref);
    });
    expect(bytes.toLowerCase()).toContain('<00aabbcc>');
  });
});
