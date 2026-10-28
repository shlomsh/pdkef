import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { FileSignature, Shrink } from 'lucide-preact';
import { outputPageCount, planKey } from '../../lib/pages/pagePlan.ts';
import { usePreparedOutput } from '../../lib/output/usePreparedOutput.ts';
import type { QuietPolicy } from '../../lib/output/quietPrepare.ts';
import { useHoldUpdate } from '../../lib/hooks/useHoldUpdate.ts';
import { reportError } from '../../lib/telemetry/errorReport.ts';
import { reportEdit } from '../../lib/telemetry/productAnalytics.ts';
import { recordAction } from '../../lib/telemetry/actionTrail.ts';
import { formatFileSize, isolateLtr } from '../../lib/text/format.js';
import { englishSplitMessages, type SplitMessages } from './messages';
import { englishShellMessages, type ShellMessages } from '../../shell/shellMessages';
import { formatMessage } from '../../lib/text/formatMessage';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import { withIslandBoundary } from '../../lib/telemetry/IslandErrorBoundary.tsx';
import ToolShellBridge from '../../shell/ToolShellBridge.tsx';
import DownloadElement from '../../shell/DownloadElement.tsx';
import NeedsUnlock from '../../shell/NeedsUnlock.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import HistoryButtons from '../../shell/HistoryButtons.tsx';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import FinishRow from '../../shell/pageWorkspace/FinishRow.tsx';
import SkippedFilesNote from '../../shell/pageWorkspace/SkippedFilesNote.tsx';
import ReplaceFileLine from '../../shell/pageWorkspace/ReplaceFileLine.tsx';
import PhoneFinish from '../../shell/pageWorkspace/PhoneFinish.tsx';
import { downloadDetail, pagesLabel } from '../../shell/pageWorkspace/pageCounts.ts';
import PageWorkspace, { workspaceStyles } from '../../shell/pageWorkspace/PageWorkspace.tsx';
import { useDownloadFlow, type HandoffTool } from '../../shell/pageWorkspace/useDownloadFlow.ts';
import { repairedPdfLoader } from '../../shell/pageWorkspace/useOpenPageDocument.ts';
import { usePageToolSession } from '../../shell/pageWorkspace/usePageToolSession.ts';
import { useLazyPageGrid } from '../../shell/pageWorkspace/useLazyPageGrid.ts';
import SplitVerb from './verb/SplitVerb.tsx';
import OptionRow, { type Option } from '../../shell/pageWorkspace/OptionRow.tsx';
import PageRangeField from '../../shell/pageWorkspace/PageRangeField.tsx';
import { buildSplit, type SplitMode } from './lib/splitOutput.ts';
import SplitHeading from './components/SplitHeading.tsx';
import SplitBulkRow from './components/SplitBulkRow.tsx';
import { outputBaseName, extractedFileName } from './lib/split.js';


// The one file has one source in the shared plan.
const FILE_ID = 0;

/** Fills a sentence that holds one non-text node (a link) at `{slot}`. */
function withSlot(template: string, slot: string, node: ComponentChildren) {
  const [before, after] = template.split(slot);
  return <>{before}{node}{after}</>;
}

export interface PdfSplitToolProps {
  /** Server-rendered by its src/pages/[locale]/<tool>.astro route for a localized
   * edition; every key not overridden keeps the English default. */
  messages?: Partial<SplitMessages>;
  shellMessages?: Partial<ShellMessages>;
  /** Tests only: jsdom cannot navigate. */
  navigate?: (href: string) => void;
  /** Tests only: shortens the quiet wait before the background build. */
  quietPolicy?: QuietPolicy;
}

export default withIslandBoundary(function PdfSplitTool({
  messages: messagesProp,
  shellMessages,
  navigate,
  quietPolicy,
}: PdfSplitToolProps = {}) {
  const t: SplitMessages = { ...englishSplitMessages, ...messagesProp };
  const sm: ShellMessages = { ...englishShellMessages, ...shellMessages };
  const resetDownloadFlowRef = useRef<() => void>(() => {});
  // What to save and the output name are outside the Undo stack, like Edit PDF's page numbers.
  const [mode, setMode] = useState<SplitMode>('combined');
  // null means "still the source's own name"; a string is the person's own.
  const [customName, setCustomName] = useState<string | null>(null);
  const [isRenamingOutputName, setIsRenamingOutputName] = useState(false);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [renderedCount, setRenderedCount] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const gridRef = useRef<HTMLUListElement | null>(null);

  // The shared page-tool session (src/shell/pageWorkspace/usePageToolSession.ts): history, the one
  // open path, PDF filtering, hand-off intake and the bulk actions. What is Split's own is reset in onPick.
  const {
    present, canUndo, canRedo, onPlanChange, handleUndo, handleRedo,
    file, workingFile, pageCount, loadId, loadStatus, needsUnlock,
    handleFilesAdded, onIncludeAll, onSkipAll, onInvert, onSelectPages,
  } = usePageToolSession({
    tool: 'split',
    loader: repairedPdfLoader,
    unlockKinds: ['needs-password', 'owner-restricted'],
    messages: t,
    announce: setAnnouncement,
    onPick: () => {
      resetDownloadFlowRef.current();
      setRenderedCount(0);
      setMode('combined');
      setCustomName(null);
    },
    onRejected: setRejectedFiles,
  });
  const { plan } = present;
  useHoldUpdate(file !== null, 'open');
  const PageGrid = useLazyPageGrid(file !== null);

  const sources = useMemo(
    () => (workingFile ? [{ id: FILE_ID, file: workingFile, pageCount, error: null }] : []),
    [workingFile, pageCount],
  );

  const outputCount = outputPageCount(plan);
  const skippedCount = plan.length - outputCount;
  const baseName = file ? outputBaseName(file.name) : '';
  const title = customName ?? baseName;
  const combined = mode === 'combined';
  const fileName = combined ? extractedFileName(title) : `${baseName}-page-N.pdf`;

  // The output name is not in the key: renaming never rebuilds.
  const key = file && workingFile && loadStatus === 'idle' && !needsUnlock && outputCount > 0
    ? `${loadId}|${planKey(plan)}|${mode}`
    : null;
  /** What the next build reads; always the inputs of the current key. */
  const inputsRef = useRef({ workingFile, plan, mode });
  inputsRef.current = { workingFile, plan, mode };
  const prepared = usePreparedOutput({
    cacheScope: loadId,
    key,
    quietPolicy,
    build: (signal, onProgress) => {
      const { workingFile: source, plan: current, mode: chosen } = inputsRef.current;
      return buildSplit(source as File, current, chosen, onProgress, signal);
    },
    onBuildError: (err) => reportError('pdf_tool_run', err, 'prepare_split'),
  });

  const downloadFlow = useDownloadFlow({
    prepared,
    fileName,
    blocked: prepared.status === 'error' ? 'error' : null,
    nothing: plan.length > 0 && outputCount === 0,
    announce: setAnnouncement,
    messages: { ready: t.readyAnnouncement, shared: t.sharedSuccessfully, canceled: t.sharingCanceled, shareError: t.shareError },
    navigate,
  });
  const {
    tap, downloadState, shareReady, handoffBusy, handoffFailed, requestHandoff,
    onDownloadTap, onRowPreparingTap, handleShare, reset: resetDownloadFlow,
  } = downloadFlow;
  resetDownloadFlowRef.current = resetDownloadFlow;

  const modeOptions: Option<SplitMode>[] = [{ value: 'combined', label: t.modeCombined }, { value: 'separate', label: t.modeSeparate }];
  const chooseMode = (next: SplitMode) => {
    if (next === mode) return;
    setMode(next);
    recordAction('change_setting');
    reportEdit('split');
    setAnnouncement(next === 'combined' ? t.announceCombined : t.announceSeparate);
  };

  // '' means the person emptied the name, which goes back to the source's own.
  const renameOutput = useCallback((next: string) => {
    setCustomName(next.length > 0 && next !== baseName ? next : null);
  }, [baseName]);

  const pdfsLabel = (n: number) => (n === 1 ? t.pdfOne : formatMessage(t.pdfOther, { count: n }));
  const detail = combined
    ? downloadDetail(prepared, outputCount, sm, t.dir)
    : prepared.status === 'ready'
      ? formatMessage(t.detailSeparate, { size: isolateLtr(formatFileSize(prepared.size), t.dir) })
      : pagesLabel(outputCount, sm);
  // The Download element reads its label from the catalogue; One PDF per page counts the files.
  const downloadMessages = combined
    ? t
    : { ...t, downloadLabel: formatMessage(t.downloadMany, { files: pdfsLabel(outputCount) }), savedLabel: formatMessage(t.savedMany, { files: pdfsLabel(outputCount) }) };
  const analyticsStatus = loadStatus === 'error' || prepared.status === 'error' ? 'error' : tap;
  const handoffs = combined
    ? [
      { tool: 'compress' as HandoffTool, label: t.handoffCompress, Icon: Shrink },
      { tool: 'sign' as HandoffTool, label: t.handoffSign, Icon: FileSignature },
    ]
    : [];

  const bulkRow = <SplitBulkRow onIncludeAll={onIncludeAll} onSkipAll={onSkipAll} onInvert={onInvert} messages={t} />;

  // The phone row shares its line with the bulk buttons, so it takes the shell's short label.
  const replaceRow = (requestReplace: () => void) => (
    <div class={workspaceStyles['quiet-row']}>
      <button type="button" class={workspaceStyles['quiet-button']} onClick={requestReplace} title={sm.replaceTitle}>{sm.replaceLabel}</button>
    </div>
  );

  const rangeField = (id?: string) => (
    <PageRangeField plan={plan} pageCount={pageCount} onSelect={onSelectPages} messages={t} id={id} />
  );

  const failure = (
    <ErrorMessage>
      {withSlot(t.splitFailedBody, '{unlock}', <a href="/unlock/">{t.unlockLink}</a>)}
    </ErrorMessage>
  );

  return (
    <BasePdfTool
      hasFiles={file !== null}
      onFilesAdded={handleFilesAdded}
      intake={{ multiple: false }}
      identity={{ file, label: file?.name, hidden: true }}
      empty={{ art: <SplitVerb /> }}
      // A protected file is the person's file, not a failed operation: it stays out of the failure count.
      analytics={{ tool: 'split', status: analyticsStatus }}
      shellMessages={shellMessages}
    >
      <SkippedFilesNote names={rejectedFiles} messages={t} dir={t.dir} />

      {file && loadStatus === 'loading-file' && (
        <div class={pdfToolStyles['status-block']}>
          <p class={pdfToolStyles['status-text-muted']}>{t.loadingPages}</p>
        </div>
      )}

      {file && loadStatus === 'error' && (
        <ToolShellBridge>
          {({ requestReplace }) => (
            <>
              {failure}
              {replaceRow(requestReplace)}
            </>
          )}
        </ToolShellBridge>
      )}

      {file && needsUnlock && (
        <NeedsUnlock
          kind={needsUnlock.kind}
          file={file}
          bytes={needsUnlock.bytes}
          from="split"
          toolName="Split PDF"
          verb="split"
          messages={{
            title: needsUnlock.kind === 'needs-password' ? t.protectedNeedsPasswordTitle : t.protectedOwnerOnlyTitle,
            body: needsUnlock.kind === 'needs-password' ? t.protectedNeedsPasswordBody : t.protectedOwnerOnlyBody,
            unlockIt: t.protectedUnlockIt,
            handoffFailed: t.protectedHandoffFailed,
          }}
        />
      )}

      {file && loadStatus === 'idle' && !needsUnlock && (
        <PageWorkspace
          phoneBar={(
            <div class={workspaceStyles['chip-bar']}>
              {/* The mode stays in view at every scroll position; the quiet Download sits at the bar's end. */}
              <OptionRow id="split-mode-bar" label={t.modeGroupLabel} showLabel={false} options={modeOptions} value={mode} onChange={chooseMode} dir={t.dir} compact />
              <PhoneFinish
                flow={downloadFlow}
                prepared={prepared}
                fileName={fileName}
                detail={detail}
                handoffs={handoffs}
                labels={{ download: t.downloadShort, ready: t.readyAnnouncement, closeStrip: t.closeStrip, handoffFailed: t.handoffFailed, nothing: t.allSkipped }}
              />
            </div>
          )}
          phoneControls={(
            <div class={workspaceStyles['mobile-file-controls']}>
              {/* The bulk row, then the range field on a line to itself. */}
              {bulkRow}
              {rangeField('page-selector-input-phone')}
            </div>
          )}
          heading={(
            <SplitHeading
              combined={combined}
              title={title}
              fileName={fileName}
              outputCount={outputCount}
              skippedCount={skippedCount}
              pdfsLabel={pdfsLabel}
              onRename={renameOutput}
              onEditingChange={setIsRenamingOutputName}
              messages={t}
              shellMessages={sm}
            />
          )}
          headerStatus={<HistoryButtons canUndo={canUndo} canRedo={canRedo} onUndo={handleUndo} onRedo={handleRedo} labels={t} />}
          railContent={(
            <>
              {/* In order of consequence (UX guideline 20): what the output is, then which pages. */}
              <OptionRow id="split-mode" label={t.modeGroupLabel} showLabel={false} options={modeOptions} value={mode} onChange={chooseMode} dir={t.dir} note={combined ? t.modeNoteCombined : t.modeNoteSeparate} />
              {rangeField()}
              {bulkRow}
            </>
          )}
          railPinned={(
            <>
              <DownloadElement
                state={downloadState}
                href={prepared.status === 'ready' ? prepared.url : null}
                fileName={fileName}
                detail={detail}
                renderedCount={renderedCount}
                totalCount={plan.length}
                pageCount={outputCount}
                progress={prepared.progress}
                errorMessage={t.buildFailed}
                messages={downloadMessages}
                onPreparingTap={onRowPreparingTap}
                onWarm={prepared.prepareNow}
                onDownloadClick={onDownloadTap}
                isOutputNameBeingRenamed={isRenamingOutputName}
              />

              <FinishRow
                ready={prepared.status === 'ready'}
                shareReady={shareReady}
                onShare={handleShare}
                busy={handoffBusy}
                onHandoff={(tool) => { void requestHandoff(tool); /* reason: requestHandoff catches its own failure and shows the hand-off error */ }}
                onWarm={prepared.prepareNow}
                labels={{ share: t.shareLabel, compress: t.handoffCompress, sign: t.handoffSign }}
                tools={combined ? ['compress', 'sign'] : []}
              />

              {handoffFailed && (
                <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">{t.handoffFailed}</p>
              )}

              {/* Starting over with another file ends the rail, at every width (UX guideline 20). */}
              <ReplaceFileLine />
            </>
          )}
        >
          {prepared.status === 'error' && failure}

          {PageGrid && plan.length > 0 && (
            <PageGrid
              sources={sources}
              plan={plan}
              onPlanChange={onPlanChange}
              announce={setAnnouncement}
              messages={t}
              labelledBy="page-grid-heading"
              reorderable={false}
              grouped
              labelSources={false}
              gridRef={gridRef}
              onRenderedCountChange={setRenderedCount}
            />
          )}
        </PageWorkspace>
      )}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
});
