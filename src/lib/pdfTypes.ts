// ARCH-70: the pdf.js types the tools touch, named once. They are the published pdfjs-dist
// types, so a tool imports these instead of writing `any` for a document, page or viewport.
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist';

/** What `getPdfjs()` resolves to: the pdfjs-dist module. */
export type PdfjsModule = typeof import('pdfjs-dist');
export type PdfDocument = PDFDocumentProxy;
export type PdfPage = PDFPageProxy;
export type PdfViewport = PageViewport;
export type PdfRenderParameters = Parameters<PDFPageProxy['render']>[0];
