import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPdfDoc } from './openPdfDoc';
import { healthy, noPagesKey } from '../../test/support/pdfPageTreeFixtures';

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../__fixtures__/encrypted/${name}.pdf`, import.meta.url)));

// A file whose page list is lost and whose trailer names an /Encrypt dictionary: pdf-lib opens it with
// ignoreEncryption, reports isEncrypted, and the one surviving /Pages root would repair it.
const encryptedNoPages = () => {
  const plain = new TextDecoder('latin1').decode(noPagesKey());
  const withEncrypt = plain.replace('endobj\nxref', 'endobj\n6 0 obj\n<< /Filter /Standard /V 1 /R 2 /P -4 >>\nendobj\nxref').replace('/Root 1 0 R', '/Root 1 0 R /Encrypt 6 0 R');
  return Uint8Array.from(withEncrypt, (c) => c.charCodeAt(0));
};

describe('openPdfDoc', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens a plain PDF from a File, reading the same bytes', async () => {
    const opened = await openPdfDoc(new File([healthy() as BlobPart], 'a.pdf'));
    expect(opened.doc.getPageCount()).toBe(3);
    expect(opened.repaired).toBe(false);
    expect(opened.pageCount).toBeNull();
  });

  it('throws on an encrypted file by default, opens it with "ignore"', async () => {
    await expect(openPdfDoc(fixture('owner-only'))).rejects.toThrow();
    expect((await openPdfDoc(fixture('owner-only'), { encryption: 'ignore' })).doc.isEncrypted).toBe(true);
  });

  it('"empty-password" opens an owner-only file decrypted and keeps the encrypted first read', async () => {
    const opened = await openPdfDoc(fixture('owner-only'), { encryption: 'empty-password' });
    expect(opened.unlocked).toBe(true);
    expect(opened.encrypted?.isEncrypted).toBe(true);
  });

  it('"empty-password" keeps the first read when a real password is needed, or when shouldUnlock says no', async () => {
    const locked = await openPdfDoc(fixture('needs-password'), { encryption: 'empty-password' });
    expect(locked.unlocked).toBe(false);
    expect(locked.encrypted).toBe(locked.doc);
    const declined = await openPdfDoc(fixture('owner-only'), { encryption: 'empty-password', shouldUnlock: () => false });
    expect(declined.unlocked).toBe(false);
    expect(declined.encrypted).toBe(declined.doc);
  });

  it('repairs a lost page tree only with `repair`', async () => {
    const lost = noPagesKey();
    const fixed = await openPdfDoc(lost, { repair: true });
    expect(fixed.repaired).toBe(true);
    expect(fixed.pageCount).toBe(3);
    const plain = await openPdfDoc(healthy(), { repair: true });
    expect(plain.pageCount).toBe(3);
    expect(plain.repaired).toBe(false);
    const opened = await openPdfDoc(lost);
    expect(() => opened.doc.getPageCount()).toThrow();
  });

  it('"empty-password" rethrows a real parse error from the retry, and only swallows a password failure', async () => {
    // An owner-only file whose /Encrypt names an algorithm pdf-lib cannot run: the first read ignores
    // encryption and passes, the empty-password retry throws an error that is not about a password.
    const unsupported = fixture('owner-only');
    const text = Buffer.from(unsupported).toString('latin1');
    expect(text.split('/V 5')).toHaveLength(2);
    const damaged = new Uint8Array(Buffer.from(text.replace('/V 5', '/V 9'), 'latin1'));
    expect((await openPdfDoc(damaged, { encryption: 'ignore' })).doc.isEncrypted).toBe(true);
    await expect(openPdfDoc(damaged, { encryption: 'empty-password' })).rejects.toThrow('unsupported encryption algorithm');
    // A real user password: the retry fails with pdf-lib's own password error, which is swallowed.
    await expect(openPdfDoc(fixture('needs-password'), { password: '' })).rejects.toThrow(/password/i);
    expect((await openPdfDoc(fixture('needs-password'), { encryption: 'empty-password' })).unlocked).toBe(false);
  });

  it('leaves an encrypted file with a lost page tree to the encryption gate: it throws, it is not repaired', async () => {
    const opened = await openPdfDoc(encryptedNoPages(), { encryption: 'ignore' });
    expect(opened.doc.isEncrypted).toBe(true);
    await expect(openPdfDoc(encryptedNoPages(), { encryption: 'ignore', repair: true })).rejects.toThrow();
  });
});
