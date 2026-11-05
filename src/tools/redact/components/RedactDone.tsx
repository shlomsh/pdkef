import { FileSignature, Shrink } from 'lucide-preact';
import ExportHandoffs from '#shell/ExportHandoffs.tsx';
import { formatFileSize } from '#lib/text/format.js';
import pdfToolStyles from '#shell/PdfTool.module.css';
import styles from './RedactDone.module.css';
import { englishRedactMessages as t } from '../messages.ts';
import type { RedactHandoffTarget } from '#lib/app/toolIds.ts';
import { finishPagesText, finishStatusText, type FinishFacts } from '../lib/finishState.ts';

/** The saved result: what was saved, then the one line about pictures. Shared by the pinned strip and the bottom row. */
export function DoneResult({ facts, live = true }: { facts: FinishFacts; live?: boolean }) {
  if (facts.phase !== 'saved') return null;
  const status = finishStatusText(facts);
  const pages = finishPagesText(facts);
  return (
    <div class={styles.result} data-redact-done-result>
      {status && <p class={styles.line} role={live ? 'status' : undefined}>{status}</p>}
      {pages && <p class={styles.line}>{pages}</p>}
    </div>
  );
}

export interface DoneHandoffsProps {
  fileSize: number | null;
  busy: boolean;
  failed: boolean;
  onHandoff(tool: RedactHandoffTarget): void;
}

/** Compress it (carrying the size) and Sign it, plus the failure line. */
export function DoneHandoffs({ fileSize, busy, failed, onHandoff }: DoneHandoffsProps) {
  const compress = { tool: 'compress', label: t.compressIt, Icon: Shrink, ...(typeof fileSize === 'number' ? { detail: formatFileSize(fileSize) } : {}) };
  return (
    <>
      <ExportHandoffs
        items={[compress, { tool: 'sign', label: t.signIt, Icon: FileSignature }]}
        busy={busy}
        onHandoff={(tool) => onHandoff(tool as RedactHandoffTarget)}
      />
      {failed && (
        <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">
          {t.handoffFailed}
        </p>
      )}
    </>
  );
}
