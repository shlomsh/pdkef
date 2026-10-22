import { FileSignature, Shrink } from 'lucide-preact';
import ExportHandoffs from '../../editor-ui/ExportHandoffs.tsx';
import { formatFileSize } from '../../lib/format.js';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import styles from './RedactDone.module.css';
import { finishPagesText, finishStatusText, type FinishFacts } from './finishState.ts';

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
  onHandoff(tool: 'compress' | 'sign'): void;
}

/** Compress it (carrying the size) and Sign it, plus the failure line. */
export function DoneHandoffs({ fileSize, busy, failed, onHandoff }: DoneHandoffsProps) {
  const compress = { tool: 'compress', label: 'Compress it', Icon: Shrink, ...(typeof fileSize === 'number' ? { detail: formatFileSize(fileSize) } : {}) };
  return (
    <>
      <ExportHandoffs
        items={[compress, { tool: 'sign', label: 'Sign it', Icon: FileSignature }]}
        busy={busy}
        onHandoff={(tool) => onHandoff(tool as 'compress' | 'sign')}
      />
      {failed && (
        <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">
          Could not hand this off. Download it instead and open it there.
        </p>
      )}
    </>
  );
}
