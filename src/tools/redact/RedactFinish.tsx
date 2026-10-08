import type { ComponentChildren } from 'preact';
import { FileSignature, Shrink } from 'lucide-preact';
import EditorExportActions from '../../editor-ui/EditorExportActions.tsx';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import styles from './RedactFinish.module.css';
import { finishCountText, finishPagesText, finishStatusText, type FinishFacts } from './finishState.ts';

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
}

export default function RedactFinish({
  facts, canShare, shareReady, onDownload, onPrepareShare, onShare, onHandoff, handoffBusy, handoffFailed, children,
}: RedactFinishProps) {
  const { phase } = facts;
  const status = finishStatusText(facts);
  const count = finishCountText(facts);
  const pages = finishPagesText(facts);

  return (
    <div class={styles.finish}>
      {phase === 'empty' ? (
        <p class={styles.empty}>Draw a box or delete something, then download it here.</p>
      ) : (
        <>
          <div class={styles['action-row']}>
          <EditorExportActions
            variant="completion"
            canShare={canShare}
            shareReady={shareReady}
            disabled={phase === 'exporting'}
            onDownload={onDownload}
            onPrepareShare={onPrepareShare}
            onShare={onShare}
            downloadTitle="Download the redacted PDF"
            shareTitle={shareReady ? 'Share the redacted PDF' : 'Prepare the redacted PDF for sharing'}
          />
          {count && <p class={styles.caption} data-redact-count>{count}</p>}
          </div>
          {phase === 'exporting' && (
            <span class={`${pdfToolStyles['tool-primary-action-progress']} ${pdfToolStyles['tool-primary-action-progress--standalone']}`}>
              <svg class={pdfToolStyles['progress-ring']} width="22" height="22" viewBox="0 0 40 40" aria-hidden="true">
                <circle class={pdfToolStyles['progress-ring-track']} cx="20" cy="20" r="18" stroke="var(--color-border-strong)" />
              </svg>
              {status}
            </span>
          )}
          {phase === 'cancelled' && status && <p class={styles.line} role="status">{status}</p>}
          {phase === 'saved' && (
            <>
              {status && <p class={styles.line} role="status">{status}</p>}
              {pages && <p class={styles.line}>{pages}</p>}
              <div class={styles['handoff-row']}>
                <button type="button" class={styles['handoff-button']} disabled={handoffBusy} onClick={() => onHandoff('compress')}>
                  <Shrink size={16} aria-hidden="true" />
                  Compress it
                </button>
                <button type="button" class={styles['handoff-button']} disabled={handoffBusy} onClick={() => onHandoff('sign')}>
                  <FileSignature size={16} aria-hidden="true" />
                  Sign it
                </button>
              </div>
              {handoffFailed && (
                <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">
                  Could not hand this off. Download it instead and open it there.
                </p>
              )}
            </>
          )}
        </>
      )}
      {children}
    </div>
  );
}
