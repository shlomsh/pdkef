import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import { FileSignature, Shrink } from 'lucide-preact';
import { editPages } from './lib/editPages.js';
import { editOptionsFromPlan } from './lib/editPlan.ts';
import { englishEditPagesMessages as t } from './messages.ts';
import { outputPageCount, planKey } from '../../lib/pagePlan.ts';
import { usePreparedOutput } from '../../lib/usePreparedOutput.ts';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { reportError } from '../../lib/errorReport.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import { englishShellMessages as sm } from '../../shell/shellMessages';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import { withIslandBoundary } from '../../lib/IslandErrorBoundary.tsx';
import ToolShellBridge from '../../shell/ToolShellBridge.tsx';
import DownloadElement from '../../shell/DownloadElement.tsx';
import NeedsUnlock from '../../shell/NeedsUnlock.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import HistoryButtons from '../../shell/HistoryButtons.tsx';
import OutputName from '../../shell/OutputName.tsx';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import FinishRow from '../../shell/pageWorkspace/FinishRow.tsx';
import SkippedFilesNote from '../../shell/pageWorkspace/SkippedFilesNote.tsx';
import ReplaceFileLine from '../../shell/pageWorkspace/ReplaceFileLine.tsx';
import PhoneFinish from '../../shell/pageWorkspace/PhoneFinish.tsx';
import PageNumbersRow from '../../shell/pageWorkspace/PageNumbersRow.tsx';
import { downloadDetail, pagesLabel, skippedLabel } from '../../shell/pageWorkspace/pageCounts.ts';
import PageWorkspace, { workspaceStyles } from '../../shell/pageWorkspace/PageWorkspace.tsx';
import { useDownloadFlow, type HandoffTool } from '../../shell/pageWorkspace/useDownloadFlow.ts';
import { repairedPdfLoader } from '../../shell/pageWorkspace/useOpenPageDocument.ts';
import { usePageToolSession } from '../../shell/pageWorkspace/usePageToolSession.ts';
import { useLazyPageGrid } from '../../shell/pageWorkspace/useLazyPageGrid.ts';
import EditPagesVerb from './verb/EditPagesVerb.tsx';
import PageNumbersVerb from './verb/PageNumbersVerb.tsx';
import RemovePagesVerb from './verb/RemovePagesVerb.tsx';
import RotatePagesVerb from './verb/RotatePagesVerb.tsx';
import { modifiedTitle } from './lib/outputName.ts';

/** The page's one job (SEO-47): each landing page over this island shows that job in its empty state. */
type PageJob = 'organize' | 'rotate' | 'remove' | 'numbers';
const VERBS = { organize: EditPagesVerb, rotate: RotatePagesVerb, remove: RemovePagesVerb, numbers: PageNumbersVerb };


// The one file has one source in the shared plan.
const FILE_ID = 0;

export default withIslandBoundary(function PdfEditPagesTool({ job = 'organize' }: { job?: PageJob }) {
  const Verb = VERBS[job];
  // The download flow is made after this callback, so it reaches its reset through a ref.
  const resetDownloadFlowRef = useRef<() => void>(() => {});
  const [addPageNumbers, setAddPageNumbers] = useState(false);
  // null means "still the automatic name"; a string is the person's own.
  const [customOutputName, setCustomOutputName] = useState<string | null>(null);
  const [isRenamingOutputName, setIsRenamingOutputName] = useState(false);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [renderedCount, setRenderedCount] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const gridRef = useRef<HTMLUListElement | null>(null);
  // The shared page-tool session (src/shell/pageWorkspace/usePageToolSession.ts): one Undo/Redo
  // stack over the plan, the one open path, PDF filtering, hand-off intake and the bulk actions.
  // pdf-lib stays lazy: the loader imports it on the first pick.
  const {
    present, canUndo, canRedo, onPlanChange, handleUndo, handleRedo,
    file, workingFile, pageCount, loadId, loadStatus, needsUnlock,
    handleFilesAdded, onIncludeAll, onSkipAll, onInvert,
  } = usePageToolSession({
    tool: 'edit-pdf',
    loader: repairedPdfLoader,
    unlockKinds: ['needs-password', 'owner-restricted'],
    messages: t,
    announce: setAnnouncement,
    onPick: () => {
      resetDownloadFlowRef.current();
      setRenderedCount(0);
      setAddPageNumbers(false);
      setCustomOutputName(null);
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
  const title = customOutputName ?? (file ? modifiedTitle(file.name) : '');
  const fileName = title ? `${title}.pdf` : 'edited.pdf';

  const key = file && workingFile && loadStatus === 'idle' && outputCount > 0
    ? `${loadId}|${planKey(plan)}|${addPageNumbers ? 1 : 0}`
    : null;
  /** What the next build reads; always the inputs of the current key. */
  const inputsRef = useRef({ workingFile, plan, addPageNumbers });
  inputsRef.current = { workingFile, plan, addPageNumbers };
  const prepared = usePreparedOutput({
    cacheScope: loadId,
    key,
    build: async (signal, onProgress) => {
      const { workingFile: source, plan: current, addPageNumbers: numbers } = inputsRef.current;
      const blob = await editPages(source as File, { ...editOptionsFromPlan(current), addPageNumbers: numbers }, onProgress, signal);
      return { blob, pageCount: outputPageCount(current) };
    },
    onBuildError: (err) => reportError('pdf_tool_run', err, 'apply_page_edits'),
  });

  const downloadFlow = useDownloadFlow({
    prepared,
    fileName,
    blocked: prepared.status === 'error' ? 'error' : null,
    nothing: plan.length > 0 && outputCount === 0,
    announce: setAnnouncement,
    messages: { ready: t.readyAnnouncement, shared: t.sharedSuccessfully, canceled: t.sharingCanceled, shareError: t.shareError },
  });
  const {
    tap, downloadState, shareReady, handoffBusy, handoffFailed, requestHandoff,
    onDownloadTap, onRowPreparingTap, handleShare, reset: resetDownloadFlow,
  } = downloadFlow;

  resetDownloadFlowRef.current = resetDownloadFlow;

  const onPageNumbersChange = useCallback((event: Event) => {
    setAddPageNumbers((event.target as HTMLInputElement).checked);
    recordAction('change_setting');
  }, []);

  // '' means the person emptied the name, which goes back to the automatic one.
  const renameOutput = useCallback((next: string) => {
    setCustomOutputName(next.length > 0 ? next : null);
  }, []);

  const detail = downloadDetail(prepared, outputCount, sm, 'ltr');
  const analyticsStatus = loadStatus === 'error' || prepared.status === 'error' ? 'error' : tap;
  const handoffs = [
    { tool: 'compress' as HandoffTool, label: t.handoffCompress, Icon: Shrink },
    { tool: 'sign' as HandoffTool, label: t.handoffSign, Icon: FileSignature },
  ];

  const bulkRow = (
    <div class={workspaceStyles['quiet-row']}>
      <button type="button" class={workspaceStyles['quiet-button']} onClick={onIncludeAll}>{t.includeAll}</button>
      <button type="button" class={workspaceStyles['quiet-button']} onClick={onSkipAll}>{t.skipAll}</button>
      <button type="button" class={workspaceStyles['quiet-button']} onClick={onInvert}>{t.invertPages}</button>
    </div>
  );

  const replaceRow = (requestReplace: () => void) => (
    <div class={workspaceStyles['quiet-row']}>
      <button type="button" class={workspaceStyles['quiet-button']} onClick={requestReplace}>{sm.replaceLabel}</button>
    </div>
  );

  const failure = (
    <ErrorMessage>
      {t.failureLead} <a href="/unlock/">{t.failureUnlock}</a> {t.failureTail}
    </ErrorMessage>
  );

  return (
    <BasePdfTool
      hasFiles={file !== null}
      onFilesAdded={handleFilesAdded}
      intake={{ multiple: false }}
      identity={{ file, label: file?.name, hidden: true }}
      empty={{ art: <Verb /> }}
      analytics={{ tool: 'edit-pdf', status: analyticsStatus }}
    >
      <SkippedFilesNote names={rejectedFiles} messages={t} dir="ltr" />

      {file && loadStatus === 'loading-file' && (
        <div class={pdfToolStyles['status-block']}>
          <p class={pdfToolStyles['status-text-muted']}>{t.loadingStructure}</p>
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
          from="edit-pdf"
          toolName="Organize PDF"
          verb="edit"
        />
      )}

      {file && loadStatus === 'idle' && !needsUnlock && (
        <PageWorkspace
          phoneBar={(
            <div class={workspaceStyles['chip-bar']}>
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
              {bulkRow}
            </div>
          )}
          touchHint={plan.length > 1 && t.touchDragHint}
          heading={(
            <h2 class={workspaceStyles['doc-heading']} id="page-grid-heading">
              <span class="sr-only">{t.documentHeading}</span>
              <OutputName
                name={title}
                label={t.fileNameEditableLabel}
                onRename={renameOutput}
                onEditingChange={setIsRenamingOutputName}
                wrapOnPhone
              >
                <span class={workspaceStyles['doc-heading-count']}>
                  {' · '}{pagesLabel(outputCount, sm)}
                  {skippedCount > 0 ? ` · ${skippedLabel(skippedCount, t)}` : ''}
                </span>
              </OutputName>
            </h2>
          )}
          headerStatus={<HistoryButtons canUndo={canUndo} canRedo={canRedo} onUndo={handleUndo} onRedo={handleRedo} labels={t} />}
          railContent={(
            <>
              {/* In order of consequence (UX guideline 20): what the output is, then which pages. */}
              <PageNumbersRow checked={addPageNumbers} onChange={onPageNumbersChange} label={t.addPageNumbers} />
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
                messages={t}
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
