import { formatMessage } from '#lib/text/formatMessage.ts';
import DownloadElement from '#shell/DownloadElement.tsx';
import ErrorMessage from '#shell/ErrorMessage.tsx';
import OutputName from '#shell/OutputName.tsx';
import { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';
import { pagesLabel } from '#shell/pageWorkspace/pageCounts.ts';
import { englishShellMessages } from '#shell/shellMessages.ts';
import { failedPositions } from '../lib/scanPages.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanOutput } from '../state/scanOutput.ts';
import type { ScanPage } from '../state/scanWork.ts';

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

/** The Download element: the rail's primary on desktop, and on a phone that cannot share files, or holds the PDF back, the table's filled button. */
export function ScanDownloadElement({ pages, failedIds, output }: { pages: ScanPage[]; failedIds: number[]; output: ScanOutput }) {
  const { prepared, flow } = output;
  return (
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
}
