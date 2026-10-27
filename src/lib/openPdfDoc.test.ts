// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { openPdfDoc } from './openPdfDoc';
import { healthy, noPagesKey } from '../test/support/pdfPageTreeFixtures';

vi.mock('./maintenanceTelemetry', () => ({
  pdfPageTreeRepaired: () => ({}),
  pdfPageTreeFailed: () => ({}),
  reportMaintenanceEvent: () => undefined,
  beaconMaintenanceTransport: () => undefined,
}));

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./__fixtures__/encrypted/${name}.pdf`, import.meta.url)));

describe('openPdfDoc', () => {
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
});
