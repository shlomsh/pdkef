import { formatMessage } from '../../lib/formatMessage';
import { isolateName } from '../../lib/format.js';
import pdfToolStyles from '../PdfTool.module.css';
import type { PageToolMessages } from './pageToolMessages.ts';

/** The note the page tools show when a drop held files that are not PDFs (Split's, shared by Edit Pages and PDF to Image). */
export default function SkippedFilesNote({ names, messages, dir }: {
  names: string[];
  messages: Pick<PageToolMessages, 'skippedOne' | 'skippedMany'>;
  dir: 'ltr' | 'rtl';
}) {
  if (names.length === 0) return null;
  return (
    <p class={pdfToolStyles['hint-message']} role="status">
      {names.length === 1
        ? formatMessage(messages.skippedOne, { name: isolateName(names[0], dir) })
        : formatMessage(messages.skippedMany, { count: names.length })}
    </p>
  );
}
