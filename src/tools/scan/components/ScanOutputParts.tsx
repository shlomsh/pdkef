import { Trash2 } from 'lucide-preact';
import { formatMessage } from '#lib/text/formatMessage.ts';
import DownloadElement from '#shell/DownloadElement.tsx';
import DriveSaveMenu from '#shell/DriveSaveMenu.tsx';
import pdfToolStyles from '#shell/PdfTool.module.css';
import ErrorMessage from '#shell/ErrorMessage.tsx';
import OutputName from '#shell/OutputName.tsx';
import { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';
import { pagesLabel } from '#shell/pageWorkspace/pageCounts.ts';
import { englishShellMessages } from '#shell/shellMessages.ts';
import { failedPositions } from '../lib/scanPages.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanOutput } from '../state/scanOutput.ts';
import type { ScanPage } from '../state/scanWork.ts';
import styles from '../PdfScanTool.module.css';

/** The name (renamable) and the page count: the top of the table and of the desktop page. */
export function ScanHeading({ pageCount, output }: { pageCount: number; output: ScanOutput }) {
  return (
    <h2 class={workspaceStyles['doc-heading']}>
      <span class="sr-only">{t.documentHeading}</span>
      <OutputName name={output.outputName} label={t.fileNameLabel} onRename={output.onRename} onEditingChange={output.onEditingChange} wrapOnPhone>
        <span class={workspaceStyles['doc-heading-count']}>{' · '}{pagesLabel(pageCount, englishShellMessages)}</span>
      </OutputName>
    </h2>
  );
}

/** Clear all: small, at the end of the name row on a phone and on desktop, away from everything that moves the scan forward. */
export function ScanClearAll({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button type="button" class={styles.clear} data-clear-all onClick={onClear}>
      <Trash2 size={14} aria-hidden="true" />
      {label}
    </button>
  );
}

/** The quiet line saying the scan is kept on this device, or that it could not be (SCAN-18). */
export function ScanDraftStatus({ output }: { output: ScanOutput }) {
  const status = output.draftStatus;
  if (!status) return null;
  return (
    <p
      class={`${pdfToolStyles['hint-message']}${status.failed ? ` ${pdfToolStyles.danger}` : ''}`}
      data-draft-status={status.failed ? 'error' : 'ok'}
      role={status.failed ? 'alert' : undefined}
    >
      {status.label}
    </p>
  );
}

/** Under the header: why there is no PDF yet, when there is not. */
export function ScanErrors({ pages, failedIds, buildFailed }: { pages: ScanPage[]; failedIds: number[]; buildFailed: boolean }) {
  return (
    <>
      {buildFailed && <ErrorMessage>{t.buildFailed}</ErrorMessage>}
      {failedIds.length > 0 && (
        <ErrorMessage>
          {formatMessage(t.pagesFailed, { pages: failedPositions(pages, failedIds) })}
        </ErrorMessage>
      )}
    </>
  );
}

/** The Download element: the rail's primary on desktop, and on a phone that cannot share files, or holds the PDF back, the table's filled button. On desktop the Save to Google Drive arrow is joined to it. */
export function ScanDownloadElement({ pages, failedIds, output }: { pages: ScanPage[]; failedIds: number[]; output: ScanOutput }) {
  const { prepared, flow, drive } = output;
  const element = (
    <DownloadElement
      state={flow.downloadState}
      href={prepared.status === 'ready' ? prepared.url : null}
      fileName={output.fileName}
      detail={output.detail}
      pageCount={pages.length}
      progress={prepared.progress}
      errorMessage={failedIds.length > 0
        ? formatMessage(t.removeToMake, { pages: failedPositions(pages, failedIds) })
        : t.buildFailed}
      messages={t}
      onPreparingTap={flow.onRowPreparingTap}
      onErrorTap={failedIds.length > 0 ? output.onShowFailedPage : undefined}
      onWarm={prepared.prepareNow}
      onDownloadClick={flow.onDownloadTap}
      isOutputNameBeingRenamed={output.isRenaming}
    />
  );
  // The menu draws nothing until Drive is connected, online, on a desktop and the PDF is ready: then the row is joined.
  if (!drive.available && drive.state === 'idle') return element;
  return (
    <div class={styles['download-joined']}>
      {element}
      <DriveSaveMenu drive={drive} />
    </div>
  );
}
