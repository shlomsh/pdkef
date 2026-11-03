import pdfToolStyles from '#shell/PdfTool.module.css';
import { isolateName } from '#lib/text/format.js';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { CompressMessages } from '../messages';

interface IntakeNotesProps {
  t: CompressMessages;
  /** Files the tool cannot open at all. */
  rejected: string[];
  /** COMP-04: PDFs dropped among several photos. */
  leftOutPdfs: string[];
  /** The line's look; the hint band by default, a quiet line inside a set's stage. */
  className?: string;
}

/** What the last pick or drop left out, one quiet line per reason. */
export default function IntakeNotes({ t, rejected, leftOutPdfs, className = pdfToolStyles['hint-message'] }: IntakeNotesProps) {
  return (
    <>
      {rejected.length > 0 && (
        <p class={className} role="status">
          {rejected.length === 1
            ? formatMessage(t.skippedOne, { name: isolateName(rejected[0], t.dir) })
            : formatMessage(t.skippedMany, { count: rejected.length })}
        </p>
      )}
      {leftOutPdfs.length > 0 && (
        <p class={className} role="status" data-batch-left-out>
          {leftOutPdfs.length === 1
            ? formatMessage(t.batchLeftOutPdfOne, { name: isolateName(leftOutPdfs[0], t.dir) })
            : formatMessage(t.batchLeftOutPdfMany, { count: leftOutPdfs.length })}
        </p>
      )}
    </>
  );
}
