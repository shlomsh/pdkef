import { formatMessage } from '#lib/text/formatMessage.ts';
import pdfToolStyles from '#shell/PdfTool.module.css';
import { englishScanMessages as t } from '../messages.ts';

/** Which picked files were not photos, so the person knows why they are not among the pages. */
export default function ScanSkippedNotice({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <p class={pdfToolStyles['hint-message']} role="status">
      {names.length === 1
        ? formatMessage(t.skippedOne, { name: names[0] })
        : formatMessage(t.skippedMany, { count: names.length })}
    </p>
  );
}
