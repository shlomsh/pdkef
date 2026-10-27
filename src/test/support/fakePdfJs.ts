import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

/**
 * Tests drive pdf.js consumers with a hand-built document or page that carries only the members
 * the code under test reads. These two builders are the one place that says so to the type checker,
 * so a test double never needs its own cast.
 */
export function fakePdfDocument(members: object): PDFDocumentProxy {
  return members as unknown as PDFDocumentProxy;
}

export function fakePdfPage(members: object): PDFPageProxy {
  return members as unknown as PDFPageProxy;
}
