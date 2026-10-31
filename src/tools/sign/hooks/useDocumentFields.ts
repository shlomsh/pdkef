import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageGeometry } from '#editor/geometry/coords.ts';
import type { PageTurns } from '#editor/geometry/pageTurn.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import type { SignToolAction } from '../components/SignToolContext.tsx';
import useFormFieldRegions from './useFormFieldRegions.ts';
import { useFormDetectionTelemetry } from './useFormDetectionTelemetry.ts';
import { useTurnedPages } from './useTurnedPages.ts';

/**
 * The document's pages and detected fields as a person sees them: detection runs on
 * the file's own pages (with its one anonymous report), then the person's page turns
 * are applied once (SIGN-43). Field hops and the workspace both read this result.
 */
export function useDocumentFields({ sourceBytes, numPages, pdfDocument, filePageSizes, pageTurns, dispatch, announce, t }: {
  sourceBytes: ArrayBuffer | null;
  numPages: number;
  pdfDocument: PDFDocumentProxy | null;
  filePageSizes: PageGeometry[];
  pageTurns: PageTurns;
  dispatch: (action: SignToolAction) => void;
  announce: (message: string) => void;
  t: SignMessages;
}) {
  const fileFormRegions = useFormFieldRegions(sourceBytes, numPages, pdfDocument);
  useFormDetectionTelemetry(fileFormRegions);
  return useTurnedPages({ filePageSizes, fileFormRegions, pageTurns, dispatch, announce, t });
}
