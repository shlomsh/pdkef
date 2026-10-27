import { useEffect, useRef } from 'preact/hooks';
import { Download, Eraser, FileEdit, FileSignature, Merge, Shrink } from 'lucide-preact';
import PdfShareButton from '../../../shell/PdfShareButton.tsx';
import DownloadButton from '../../../shell/DownloadButton.tsx';
import styles from '../PdfSecurityTool.module.css';
import pdfToolStyles from '../../../shell/PdfTool.module.css';
import { UNLOCK_RETURN_IDS, handoffHrefOf, type UnlockReturnId } from '../../../lib/toolIds.ts';
import type { SecurityMessages } from '../messages.ts';
import type { HandoffTool } from '../../../shell/pageWorkspace/useDownloadFlow.ts';
import { formatMessage } from '../../../lib/formatMessage.ts';

// The tools that can send a protected file here as a detour, and the way back to each. Unlock's done
// state leads with "Continue in <name>" for a file that arrived with that `from` (guidelines 13).
// Which tools those are, and their pages, come from the registry (src/lib/toolIds.ts); the name and icon are this tool's wording.
const RETURN_ICON: Record<UnlockReturnId, typeof Eraser> = {
  redact: Eraser,
  sign: FileSignature,
  compress: Shrink,
  'edit-pdf': FileEdit,
  merge: Merge,
};
const RETURN_NAME_KEY: Record<UnlockReturnId, keyof SecurityMessages> = {
  redact: 'returnRedact',
  sign: 'returnSign',
  compress: 'returnCompress',
  'edit-pdf': 'returnEditPdf',
  merge: 'returnMerge',
};
const RETURN_TO = Object.fromEntries(
  UNLOCK_RETURN_IDS.map((id) => [id, { Icon: RETURN_ICON[id], href: handoffHrefOf(id) as string }]),
) as Record<UnlockReturnId, { Icon: typeof Eraser; href: string }>;
type ReturnTool = UnlockReturnId;
export const returnToolOf = (from: string | null): ReturnTool | null => (from && from in RETURN_TO ? from as ReturnTool : null);

/** The done state's controls: Download, Share and the hand-offs, or the way back to the tool that sent the file. */
export default function SecurityActions({ t, mode, status, downloadUrl, outputBlob, fileName, returnTool, shareReady, handoffBusy, handoffFailed, requestHandoff, onDownloadTap, onShare }: {
  t: SecurityMessages;
  mode: string | null;
  status: string;
  downloadUrl: string | null;
  outputBlob: Blob | null;
  fileName: string;
  returnTool: ReturnTool | null;
  shareReady: boolean;
  handoffBusy: boolean;
  handoffFailed: boolean;
  requestHandoff: (tool: HandoffTool) => Promise<void>;
  onDownloadTap: (event: Event) => void;
  onShare: () => void;
}) {
  return (
    <div class={styles.actions}>
      {mode && status === 'done' && downloadUrl && (
        returnTool && mode === 'unlock' && outputBlob ? (
          <>
            <ContinueButton tool={returnTool} name={t[RETURN_NAME_KEY[returnTool]]} label={t.continueIn} disabled={handoffBusy} onClick={() => { void requestHandoff(returnTool); /* reason: requestHandoff catches its own failure and shows the hand-off error */ }} />
            <div class={styles['handoff-row']}>
              <a class={styles['handoff-button']} data-quiet-download href={downloadUrl} download={fileName} onClick={onDownloadTap}>
                <Download size={16} aria-hidden="true" />
                {t.downloadUnlockedPdf}
              </a>
              <PdfShareButton visible={shareReady} onShare={onShare} label={t.share} className={styles['handoff-button']} />
            </div>
          </>
        ) : (
          <>
            <DownloadButton
              href={downloadUrl}
              download={fileName}
              label={mode === 'unlock' ? t.downloadLabelUnlocked : t.downloadLabelProtected}
              onClick={onDownloadTap}
            />
            <PdfShareButton visible={shareReady} onShare={onShare} label={t.share} />
            {mode === 'unlock' && outputBlob && (
              <div class={styles['handoff-row']}>
                <button type="button" class={styles['handoff-button']} disabled={handoffBusy} onClick={() => { void requestHandoff('redact'); /* reason: requestHandoff catches its own failure and shows the hand-off error */ }}>
                  <Eraser size={16} aria-hidden="true" />
                  {t.redactIt}
                </button>
                <button type="button" class={styles['handoff-button']} disabled={handoffBusy} onClick={() => { void requestHandoff('sign'); /* reason: requestHandoff catches its own failure and shows the hand-off error */ }}>
                  <FileSignature size={16} aria-hidden="true" />
                  {t.signIt}
                </button>
              </div>
            )}
          </>
        )
      )}

      {status === 'done' && handoffFailed && (
        <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">
          {t.handoffFailed}
        </p>
      )}
    </div>
  );
}

/** The done state's primary control when another tool sent the file here: the way back to that tool. */
function ContinueButton({ tool, name, label, disabled, onClick }: { tool: ReturnTool; name: string; label: string; disabled: boolean; onClick: () => void }) {
  const { Icon } = RETURN_TO[tool];
  const ref = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <button ref={ref} type="button" class={`${pdfToolStyles['download-button']} ${styles['continue-button']}`} disabled={disabled} onClick={onClick}>
      <Icon size={20} aria-hidden="true" />
      <span class={pdfToolStyles['download-button-label']}>{formatMessage(label, { name })}</span>
    </button>
  );
}

/** The form's one primary control: Unlock or Protect, then the busy label while it runs. */
export function SubmitButton({ processing, disabled, label, busyLabel }: { processing: boolean; disabled: boolean; label: string; busyLabel: string }) {
  return (
    <button
      type="submit"
      class={`${pdfToolStyles['tool-primary-action']}${processing ? ` ${pdfToolStyles['is-processing']}` : ''}`}
      data-processing={processing || undefined}
      disabled={disabled || processing}
    >
      {processing ? busyLabel : label}
    </button>
  );
}
