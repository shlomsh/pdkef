import type { ComponentChildren } from 'preact';
import EditorExportActions from '../../editor-ui/EditorExportActions.tsx';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import styles from './RedactFinish.module.css';
import { DoneHandoffs, DoneResult } from './RedactDone.tsx';
import { finishCountText, finishStatusText, type FinishFacts } from './finishState.ts';

export interface RedactFinishProps {
  facts: FinishFacts;
  canShare: boolean;
  shareReady: boolean;
  onDownload(): void;
  onPrepareShare(): void;
  onShare(): void;
  onHandoff(tool: 'compress' | 'sign'): void;
  handoffBusy: boolean;
  handoffFailed: boolean;
  /** The saved-file check slot, rendered last. */
  children?: ComponentChildren;
  /** The rating ask, rendered after the check. */
  rating?: ComponentChildren;
}

export default function RedactFinish({
  facts, canShare, shareReady, onDownload, onPrepareShare, onShare, onHandoff, handoffBusy, handoffFailed, children, rating,
}: RedactFinishProps) {
  const { phase } = facts;
  const saved = phase === 'saved';
  const status = finishStatusText(facts);
  const count = saved ? null : finishCountText(facts);

  const actions = (
    <div class={styles['action-row']}>
      <EditorExportActions
        variant="completion"
        canShare={canShare}
        shareReady={shareReady}
        disabled={phase === 'exporting'}
        onDownload={onDownload}
        onPrepareShare={onPrepareShare}
        onShare={onShare}
        downloadLabel={saved ? 'Download again' : undefined}
        downloadTitle="Download the redacted PDF"
        shareTitle={shareReady ? 'Share the redacted PDF' : 'Prepare the redacted PDF for sharing'}
      />
      {count && <p class={styles.caption} data-redact-count>{count}</p>}
    </div>
  );

  return (
    <div class={styles.finish}>
      {phase === 'empty' ? (
        <p class={styles.empty}>Draw a box or delete something, then download it here.</p>
      ) : (
        <>
          {saved && <DoneResult facts={facts} />}
          {actions}
          {phase === 'exporting' && (
            <span class={`${pdfToolStyles['tool-primary-action-progress']} ${pdfToolStyles['tool-primary-action-progress--standalone']}`}>
              <svg class={pdfToolStyles['progress-ring']} width="22" height="22" viewBox="0 0 40 40" aria-hidden="true">
                <circle class={pdfToolStyles['progress-ring-track']} cx="20" cy="20" r="18" stroke="var(--color-border-strong)" />
              </svg>
              {status}
            </span>
          )}
          {phase === 'cancelled' && status && <p class={styles.line} role="status">{status}</p>}
          {/* Everywhere Download is enabled: a tap makes the export first if none matches the document. */}
          {phase !== 'exporting' && (
            <DoneHandoffs fileSize={facts.fileSize} busy={handoffBusy} failed={handoffFailed} onHandoff={onHandoff} />
          )}
        </>
      )}
      {children}
      {rating}
    </div>
  );
}
