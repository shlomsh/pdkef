import { formatMessage } from '#lib/text/formatMessage.ts';
import pdfToolStyles from '#shell/PdfTool.module.css';
import { englishScanMessages as t } from '../messages.ts';

/** A picked file that is not among the pages: 'type' is a file that is not a photo or PDF, 'pdf' a PDF that could not be opened. */
export interface SkippedFile {
  name: string;
  reason: 'type' | 'pdf';
}

/** The skipped list with these added, a name already there kept once. */
export function addSkipped(current: SkippedFile[], more: SkippedFile[]): SkippedFile[] {
  const fresh = more.filter((m) => !current.some((c) => c.name === m.name && c.reason === m.reason));
  return fresh.length === 0 ? current : [...current, ...fresh];
}

/** Which picked files were left out, and why, so the person knows why they are not among the pages. */
export default function ScanSkippedNotice({ names: files }: { names: SkippedFile[] }) {
  const types = files.filter((f) => f.reason === 'type');
  const pdfs = files.filter((f) => f.reason === 'pdf').map((f) => f.name);
  if (types.length === 0 && pdfs.length === 0) return null;
  return (
    <>
      {types.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {types.length === 1
            ? formatMessage(t.skippedOne, { name: types[0].name })
            : formatMessage(t.skippedMany, { count: types.length })}
        </p>
      )}
      {pdfs.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {pdfs.length === 1
            ? formatMessage(t.skippedPdfOne, { name: pdfs[0] })
            : formatMessage(t.skippedPdfMany, { names: pdfs.join(', ') })}
        </p>
      )}
    </>
  );
}
