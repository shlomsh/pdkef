/**
 * Vitest setup for the island tests whose pdf.js worker and painting jsdom cannot run (ARCH-78): registers
 * the shared fakes of `../pdfjsEdges.ts` for the encryption probe and the thumbnail module. Loaded only by
 * the island projects of `vitest.config.js`; a test file that needs a different fake may `vi.mock` it again.
 */
import { vi } from 'vitest';

vi.mock('#lib/pdf/pdfEncryption.ts', async (importOriginal) => {
  const { pdfjsEdges } = await import('../pdfjsEdges.ts');
  return { ...(await importOriginal<object>()), probeEncryption: pdfjsEdges.probe };
});

vi.mock('#lib/pdf/thumbnails.js', async (importOriginal) => {
  const { pdfjsEdges } = await import('../pdfjsEdges.ts');
  return { ...(await importOriginal<object>()), ...pdfjsEdges.thumbnails };
});
