import PageNumbersRow from '#shell/pageWorkspace/PageNumbersRow.tsx';
import DownloadElement from '#shell/DownloadElement.tsx';
import FinishRow from '#shell/pageWorkspace/FinishRow.tsx';
import pdfToolStyles from '#shell/PdfTool.module.css';
import railStyles from './MergeRail.module.css';
import type { MergeMessages } from '../messages';
import type { ShellMessages } from '#shell/shellMessages.ts';
import type { PreparedMerge } from '../hooks/usePreparedMerge.ts';
import type { useDownloadFlow } from '#shell/pageWorkspace/useDownloadFlow.ts';
import type { BeforeInstallPromptEvent } from '../state/mergeState.ts';

interface MergeRailPinnedProps {
  fileCount: number;
  addPageNumbers: boolean;
  onPageNumbersChange: (event: Event) => void;
  lockedView: boolean;
  downloadFlow: ReturnType<typeof useDownloadFlow>;
  prepared: PreparedMerge;
  fileName: string;
  detail: string;
  renderedCount: number;
  renderTotal: number;
  outputCount: number;
  /** A file's own failure replaces the generic build error. */
  hasFailedEntry: boolean;
  isOutputNameBeingRenamed: boolean;
  onChooseFiles: () => void;
  onStartAgain: () => void;
  showInstallLine: boolean;
  installPrompt: BeforeInstallPromptEvent | null;
  onIos: boolean;
  onInstall: () => void;
  t: MergeMessages;
  sm: ShellMessages;
}

export default function MergeRailPinned({
  fileCount, addPageNumbers, onPageNumbersChange, lockedView, downloadFlow, prepared, fileName, detail, renderedCount, renderTotal,
  outputCount, hasFailedEntry, isOutputNameBeingRenamed, onChooseFiles, onStartAgain, showInstallLine, installPrompt, onIos, onInstall, t, sm,
}: MergeRailPinnedProps) {
  const {
    downloadState, downloadedOnce, shareReady, handoffBusy, handoffFailed, requestHandoff, onDownloadTap, onRowPreparingTap, handleShare,
  } = downloadFlow;
  return (
    <>
      {/* Direction A follow-up (review P1): the page-numbers row and
          the hand-off row only make sense once a merge is possible -
          with one file the Download element's own text-plus-
          button state is the whole story, so both are held back
          until there are two files. Shlomi (2026-09-13): the Options
          disclosure is gone entirely - a plain checkbox row directly
          above Download, no summary, no chevron, nothing to open.
          MERGE-24 (2026-10-23): shown at every width, since below
          1024px this rail is the completion row under the pages. */}
      {fileCount >= 2 && (
        <PageNumbersRow checked={addPageNumbers} onChange={onPageNumbersChange} label={t.addPageNumbers} />
      )}

      {!lockedView && (
        <DownloadElement
          state={downloadState}
          href={prepared.status === 'ready' ? prepared.url : null}
          fileName={fileName}
          detail={detail}
          renderedCount={renderedCount}
          totalCount={renderTotal}
          pageCount={outputCount}
          progress={prepared.progress}
          errorMessage={hasFailedEntry ? undefined : t.buildFailed}
          messages={t}
          chooseFilesLabel={sm.chooseFilesMany}
          onChooseFiles={onChooseFiles}
          onPreparingTap={onRowPreparingTap}
          onWarm={prepared.prepareNow}
          onDownloadClick={onDownloadTap}
          isOutputNameBeingRenamed={isOutputNameBeingRenamed}
        />
      )}

      {fileCount >= 2 && (
        <FinishRow
          ready={prepared.status === 'ready'}
          shareReady={shareReady}
          onShare={handleShare}
          busy={handoffBusy}
          onHandoff={(tool) => { void requestHandoff(tool); /* reason: requestHandoff catches its own failure and shows the hand-off error */ }}
          onWarm={prepared.prepareNow}
          labels={{ share: t.shareLabel, compress: t.handoffCompress, sign: t.handoffSign }}
        />
      )}

      {downloadedOnce && (
        <button type="button" class={railStyles['start-again']} onClick={onStartAgain}>
          {t.startAgain}
        </button>
      )}

      {handoffFailed && (
        <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">{t.handoffFailed}</p>
      )}

      {downloadState === 'saved' && showInstallLine && (
        <p class={railStyles['install-line']} data-install-line>
          {t.installLine}{' '}
          {installPrompt ? (
            t.installWithPrompt.split('{install}').map((part, index) =>
              index === 0 ? part : (
                <>
                  <button type="button" class={pdfToolStyles['quiet-link']} onClick={onInstall}>{t.installLink}</button>
                  {part}
                </>
              ))
          ) : onIos ? t.installIos : t.installOther}
        </p>
      )}
    </>
  );
}
