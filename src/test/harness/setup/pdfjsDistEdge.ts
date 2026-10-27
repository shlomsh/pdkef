/**
 * Vitest setup for Redact's island test (ARCH-78): `pdfjs-dist` is the edge there, faked by
 * `../pdfjsEdges.ts` (text items, document info read from the real bytes), and the thumbnail module on top of it runs for real.
 */
import { vi } from 'vitest';

vi.mock('pdfjs-dist', async () => {
  const { pdfjsEdges } = await import('../pdfjsEdges.ts');
  return {
    GlobalWorkerOptions: { workerSrc: '' },
    OPS: {},
    AnnotationMode: { DISABLE: 0 },
    getDocument: pdfjsEdges.getDocument,
  };
});
