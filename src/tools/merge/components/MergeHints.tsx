import pdfToolStyles from '#shell/PdfTool.module.css';
import { isolateName } from '#lib/text/format.js';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { MergeMessages } from '../messages';

interface MergeHintsProps {
  rejectedFiles: string[];
  duplicates: File[];
  onAddAnyway: (files: File[]) => void;
  t: MergeMessages;
}

/** The two quiet status lines above the workspace: files skipped, files already added. */
export default function MergeHints({ rejectedFiles, duplicates, onAddAnyway, t }: MergeHintsProps) {
  return (
    <>
      {rejectedFiles.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {rejectedFiles.length === 1
            ? formatMessage(t.skippedOne, { name: isolateName(rejectedFiles[0], t.dir) })
            : formatMessage(t.skippedMany, { count: rejectedFiles.length })}
        </p>
      )}

      {duplicates.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          <span>{duplicates.map((f) => formatMessage(t.alreadyAdded, { name: isolateName(f.name, t.dir) })).join(' ')}</span>{' '}
          <button type="button" class={pdfToolStyles['quiet-link']} onClick={() => onAddAnyway(duplicates)}>
            {t.addAnyway}
          </button>
        </p>
      )}
    </>
  );
}
