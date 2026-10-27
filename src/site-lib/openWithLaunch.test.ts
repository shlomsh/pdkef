import { describe, expect, it } from 'vitest';
import { pdfFromLaunch } from './openWithLaunch.ts';

const handleOf = (file: File) => ({ getFile: async () => file });

describe('pdfFromLaunch', () => {
  it('returns the first file of a launch', async () => {
    const file = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });
    expect(await pdfFromLaunch({ files: [handleOf(file)] })).toBe(file);
  });

  it('accepts a PDF the system left untyped, by its extension', async () => {
    const file = new File(['%PDF'], 'Scan.PDF', { type: '' });
    expect(await pdfFromLaunch({ files: [handleOf(file)] })).toBe(file);
  });

  it('returns null for an empty launch', async () => {
    expect(await pdfFromLaunch({})).toBeNull();
    expect(await pdfFromLaunch({ files: [] })).toBeNull();
  });

  it('returns null for a file that is not a PDF', async () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    expect(await pdfFromLaunch({ files: [handleOf(file)] })).toBeNull();
  });

  it('returns null when the handle cannot be read', async () => {
    const broken = { getFile: async () => { throw new Error('gone'); } };
    expect(await pdfFromLaunch({ files: [broken] })).toBeNull();
  });
});
