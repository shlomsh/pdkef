import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import { FileSignature, Shrink } from 'lucide-preact';
import { isPdfFile } from '../../lib/fileKind.js';
import { editPages } from './editPages.js';
import { editOptionsFromPlan } from './editPlan.ts';
import { englishEditPagesMessages as t } from './messages.ts';
import { includeAll, invert, outputPageCount, skipAll, planForFile, planKey, type PlanEntry } from '../../lib/pagePlan.ts';
import { useDocumentHistory } from '../../lib/history/useDocumentHistory.ts';
import { usePreparedOutput } from '../../lib/usePreparedOutput.ts';
import { useHandoffIntake } from '../../lib/useHandoffIntake.ts';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { reportError } from '../../lib/errorReport.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import { englishShellMessages as sm } from '../../i18n/toolMessages';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import ToolShellBridge from '../../shell/ToolShellBridge.tsx';
import DownloadElement from '../../shell/DownloadElement.tsx';
import NeedsUnlock from '../../shell/NeedsUnlock.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import HistoryButtons from '../../shell/HistoryButtons.tsx';
import OutputName from '../../shell/OutputName.tsx';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import FinishRow from '../../shell/pageWorkspace/FinishRow.tsx';
import ReplaceFileLine from '../../shell/pageWorkspace/ReplaceFileLine.tsx';
import PhoneFinish from '../../shell/pageWorkspace/PhoneFinish.tsx';
import PageNumbersRow from '../../shell/pageWorkspace/PageNumbersRow.tsx';
import { downloadDetail, pagesLabel, skippedLabel } from '../../shell/pageWorkspace/pageCounts.ts';
import PageWorkspace, { workspaceStyles } from '../../shell/pageWorkspace/PageWorkspace.tsx';
import { useDownloadFlow, type HandoffTool, type HandoffHrefs } from '../../shell/pageWorkspace/useDownloadFlow.ts';
import { repairedPdfLoader, useOpenPageDocument } from '../../shell/pageWorkspace/useOpenPageDocument.ts';
import { useLazyPageGrid } from '../../shell/pageWorkspace/useLazyPageGrid.ts';
import EditPagesVerb from './verb/EditPagesVerb.tsx';
import PageNumbersVerb from './verb/PageNumbersVerb.tsx';
import RemovePagesVerb from './verb/RemovePagesVerb.tsx';
import RotatePagesVerb from './verb/RotatePagesVerb.tsx';

/** The page's one job (SEO-47): each landing page over this island shows that job in its empty state. */
type PageJob = 'organize' | 'rotate' | 'remove' | 'numbers';
const VERBS = { organize: EditPagesVerb, rotate: RotatePagesVerb, remove: RemovePagesVerb, numbers: PageNumbersVerb };

const HANDOFF_HREFS: HandoffHrefs = { compress: '/compress/', sign: '/sign/' };

// The one file has one source in the shared plan.
const FILE_ID = 0;

interface EditDocument {
  plan: PlanEntry[];
}

const EMPTY_DOCUMENT: EditDocument = { plan: [] };

export default function PdfEditPagesTool({ job = 'organize' }: { job?: PageJob }) {
  const Verb = VERBS[job];
  // The download flow is made after this callback, so it reaches its reset through a ref.
  const resetDownloadFlowRef = useRef<() => void>(() => {});
  const [addPageNumbers, setAddPageNumbers] = useState(false);
  // null means "still the automatic name"; a string is the person's own.
  const [customOutputName, setCustomOutputName] = useState<string | null>(null);
  const [isRenamingOutputName, setIsRenamingOutputName] = useState(false);
  const [renderedCount, setRenderedCount] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const gridRef = useRef<HTMLUListElement | null>(null);
  // One Undo/Redo stack over the plan. A deliberate change is a `commit`
  // (rotate, skip, move, a bulk action); opening a file is a `reset`.
  const { present, canUndo, canRedo, reset, onPlanChange, handleUndo, handleRedo } = useDocumentHistory<EditDocument>(
    EMPTY_DOCUMENT,
    { tool: 'edit-pdf', announce: setAnnouncement, messages: { undone: t.undoneAnnouncement, redone: t.redoneAnnouncement } },
  );
  const { plan } = present;

  // The one open path (src/shell/pageWorkspace/useOpenPageDocument.ts): stale-pick guard,
  // protection check, repaired copy. pdf-lib stays lazy: the loader imports it on the first pick.
  const { file, workingFile, pageCount, loadId, loadStatus, needsUnlock, open } = useOpenPageDocument({
    loader: repairedPdfLoader,
    unlockKinds: ['needs-password', 'owner-restricted'],
    messages: { needsPassword: t.announceNeedsPassword, restricted: t.announceRestricted, loaded: t.loaded, loadFailed: t.loadFailed },
    announce: setAnnouncement,
    onPick: () => {
      resetDownloadFlowRef.current();
      setRenderedCount(0);
      setAddPageNumbers(false);
      setCustomOutputName(null);
      // A new file starts a fresh document: reset (not commit) so the previous
      // file's undo/redo stacks don't leak across files.
      reset(EMPTY_DOCUMENT);
    },
    onLoaded: ({ pageCount: count }) => reset({ plan: planForFile(FILE_ID, count) }),
  });
  useHoldUpdate(file !== null, 'open');
  const PageGrid = useLazyPageGrid(file !== null);

  const handleFilesAdded = useCallback(async (fileList: FileList | File[]) => {
    const pdfs = Array.from(fileList).filter((f) => isPdfFile(f));
    if (pdfs.length === 0) return;
    await open(pdfs[0]);
  }, [open]);

  // SITE-42: files picked on the home page arrive as a hand-off, collected on
  // mount and sent down the same path a manual pick takes. This tool restores
  // nothing on mount, so there is no restore to race - see useHandoffIntake.ts.
  useHandoffIntake('edit-pdf', (f) => handleFilesAdded([f]));

  const sources = useMemo(
    () => (workingFile ? [{ id: FILE_ID, file: workingFile, pageCount, error: null }] : []),
    [workingFile, pageCount],
  );

  const outputCount = outputPageCount(plan);
  const skippedCount = plan.length - outputCount;
  const title = customOutputName ?? (file ? `${file.name.replace(/\.pdf$/i, '')}_modified` : '');
  const fileName = title ? `${title}.pdf` : 'edited.pdf';

  const key = file && workingFile && loadStatus === 'idle' && outputCount > 0
    ? `${loadId}|${planKey(plan)}|${addPageNumbers ? 1 : 0}`
    : null;
  /** What the next build reads; always the inputs of the current key. */
  const inputsRef = useRef({ workingFile, plan, addPageNumbers });
  inputsRef.current = { workingFile, plan, addPageNumbers };
  const prepared = usePreparedOutput({
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
    hrefs: HANDOFF_HREFS,
    blocked: prepared.status === 'error' ? 'error' : null,
    nothing: plan.length > 0 && outputCount === 0,
    announce: setAnnouncement,
    messages: { ready: t.editedReady, shared: t.sharedSuccessfully, canceled: t.sharingCanceled, shareError: t.shareError },
  });
  const {
    tap, downloadState, shareReady, handoffBusy, handoffFailed, requestHandoff,
    onDownloadTap, onRowPreparingTap, handleShare, reset: resetDownloadFlow,
  } = downloadFlow;

  resetDownloadFlowRef.current = resetDownloadFlow;

  // A bulk action is one step, and none at all when it changes nothing.
  const bulk = (update: (current: PlanEntry[]) => PlanEntry[], message: string) => () => {
    if (update(plan) === plan) return;
    onPlanChange(update);
    recordAction('select_pages');
    setAnnouncement(message);
  };
  const onIncludeAll = bulk(includeAll, t.allIncluded);
  const onSkipAll = bulk(skipAll, t.allSkipped);
  const onInvert = bulk(invert, t.inverted);

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
      <button type="button" class={workspaceStyles['quiet-button']} onClick={onInvert}>{t.invert}</button>
    </div>
  );

  const replaceRow = (requestReplace: () => void) => (
    <div class={workspaceStyles['quiet-row']}>
      <button type="button" class={workspaceStyles['quiet-button']} onClick={requestReplace}>{sm.replaceLabel}</button>
    </div>
  );

  const failure = (
    <ErrorMessage>
      A protected PDF opens in <a href="/unlock/">Unlock</a> first. Otherwise the file may be damaged - try another PDF.
    </ErrorMessage>
  );

  return (
    <BasePdfTool
      hasFiles={file !== null}
      emptyArt={<Verb />}
      analyticsTool="edit-pdf"
      analyticsStatus={analyticsStatus}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      file={file}
      fileLabel={file?.name}
      hideIdentity
    >
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
                labels={{ download: t.downloadShort, ready: t.editedReady, closeStrip: t.closeStrip, handoffFailed: t.handoffFailed, nothing: t.allSkipped }}
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
                onHandoff={(tool) => { void requestHandoff(tool); }}
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
}
