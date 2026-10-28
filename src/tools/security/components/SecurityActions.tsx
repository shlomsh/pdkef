import { useEffect, useRef } from 'preact/hooks';
import { Download, Eraser, FileEdit, FileSignature, Merge, Shrink } from 'lucide-preact';
import PdfShareButton from '#shell/PdfShareButton.tsx';
import DownloadElement from '#shell/DownloadElement.tsx';
import PhoneFinish from '#shell/pageWorkspace/PhoneFinish.tsx';
import { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';
import { formatFileSize } from '#lib/text/format.js';
import FinishRow from '#shell/pageWorkspace/FinishRow.tsx';
import type { ExportHandoffItem } from '#shell/ExportHandoffs.tsx';
import type { PreparedOutput } from '#lib/output/usePreparedOutput.ts';
import styles from '../PdfSecurityTool.module.css';
import pdfToolStyles from '#shell/PdfTool.module.css';
import { UNLOCK_RETURN_IDS, handoffHrefOf, type UnlockReturnId } from '#lib/app/toolIds.ts';
import type { SecurityMessages } from '../messages.ts';
import type { HandoffTool, useDownloadFlow } from '#shell/pageWorkspace/useDownloadFlow.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';

// The tools that can send a protected file here as a detour, and the way back to each. Unlock's done
// state leads with "Continue in <name>" for a file that arrived with that `from` (guidelines 13).
// Which tools those are, and their pages, come from the registry (src/lib/app/toolIds.ts); the name and icon are this tool's wording.
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

/** The hand-offs the finish offers: an unlocked file can go on to Redact or Sign; a protected one is only shared. */
function finishHandoffs(mode: string | null, t: SecurityMessages): ExportHandoffItem[] {
  return mode === 'unlock'
    ? [{ tool: 'redact', label: t.handoffRedact, Icon: Eraser }, { tool: 'sign', label: t.handoffSign, Icon: FileSignature }]
    : [];
}

/** The phone bar's quiet Download and done strip; a file that came from another tool goes back there, so no hand-offs. */
export function SecurityPhoneBar({ t, mode, flow, prepared, fileName, size, returnTool }: {
  t: SecurityMessages;
  mode: string | null;
  flow: ReturnType<typeof useDownloadFlow>;
  prepared: Pick<PreparedOutput, 'status' | 'url' | 'prepareNow'>;
  fileName: string;
  size: number;
  returnTool: ReturnTool | null;
}) {
  return (
    <div class={workspaceStyles['chip-bar']}>
      <PhoneFinish
        flow={flow}
        prepared={prepared}
        fileName={fileName}
        detail={formatFileSize(size)}
        handoffs={returnTool ? [] : finishHandoffs(mode, t)}
        labels={{ download: t.downloadShort, ready: mode === 'unlock' ? t.readyUnlocked : t.readyProtected, closeStrip: t.closeStrip, handoffFailed: t.handoffFailed }}
      />
    </div>
  );
}

/** The done state's controls: Download, Share and the hand-offs, or the way back to the tool that sent the file. */
export default function SecurityActions({ t, mode, finished, prepared, flow, detail, fileName, returnTool }: {
  t: SecurityMessages;
  mode: string | null;
  finished: boolean;
  prepared: Pick<PreparedOutput, 'status' | 'url' | 'prepareNow'>;
  flow: ReturnType<typeof useDownloadFlow>;
  detail: string;
  fileName: string;
  returnTool: ReturnTool | null;
}) {
  const { handoffBusy, handoffFailed, requestHandoff, onDownloadTap, handleShare, shareReady } = flow;
  const goBack = returnTool && mode === 'unlock';
  const handoffs = finishHandoffs(mode, t);
  return (
    <div class={styles.actions}>
      {finished && prepared.url && (
        goBack ? (
          <>
            <ContinueButton tool={returnTool} name={t[RETURN_NAME_KEY[returnTool]]} label={t.continueIn} disabled={handoffBusy} onClick={() => { void requestHandoff(returnTool); /* reason: requestHandoff catches its own failure and shows the hand-off error */ }} />
            <div class={styles['handoff-row']}>
              <a class={styles['handoff-button']} data-quiet-download href={prepared.url} download={fileName} onClick={onDownloadTap}>
                <Download size={16} aria-hidden="true" />
                {t.downloadUnlockedPdf}
              </a>
              <PdfShareButton visible={shareReady} onShare={handleShare} label={t.share} className={styles['handoff-button']} />
            </div>
          </>
        ) : (
          <>
            <DownloadElement
              state={flow.downloadState}
              href={prepared.url}
              fileName={fileName}
              detail={detail}
              errorMessage={t.buildFailed}
              messages={t}
              onPreparingTap={flow.onRowPreparingTap}
              onDownloadClick={onDownloadTap}
            />
            <FinishRow
              ready
              shareReady={shareReady}
              onShare={handleShare}
              busy={handoffBusy}
              onWarm={prepared.prepareNow}
              onHandoff={handoffs.length > 0 ? (tool) => { void requestHandoff(tool); /* reason: requestHandoff catches its own failure and shows the hand-off error */ } : undefined}
              tools={handoffs.map((item) => item.tool as HandoffTool)}
              labels={{ share: t.share, redact: t.handoffRedact, sign: t.handoffSign }}
            />
          </>
        )
      )}

      {finished && handoffFailed && (
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
