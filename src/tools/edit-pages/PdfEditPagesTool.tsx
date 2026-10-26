import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { FileSignature, Shrink } from 'lucide-preact';
import { isPdfFile } from '../../lib/fileKind.js';
import { probeEncryption } from '../../lib/pdfEncryption.ts';
import { editPages } from './editPages.js';
import { editOptionsFromPlan } from './editPlan.ts';
import { englishEditPagesMessages as t } from './messages.ts';
import { loadPdfWithPages } from '../../lib/loadPdfPages.ts';
import { includeAll, invert, outputPageCount, skipAll, planForFile, planKey, type PlanEntry } from '../../lib/pagePlan.ts';
import { useDocumentHistory } from '../../lib/history/useDocumentHistory.ts';
import { usePreparedOutput } from '../../lib/usePreparedOutput.ts';
import { useHandoffIntake } from '../../lib/useHandoffIntake.ts';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { reportError } from '../../lib/errorReport.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import { englishShellMessages as sm, formatMessage } from '../../i18n/toolMessages';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import ToolShellBridge from '../../shell/ToolShellBridge.tsx';
import DownloadElement from '../../shell/DownloadElement.tsx';
import NeedsUnlock, { type NeedsUnlockKind } from '../../shell/NeedsUnlock.tsx';
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
import type { PageGridProps } from '../../shell/pageGrid/PageGrid.tsx';
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
  const [file, setFile] = useState<File | null>(null);
  // The bytes everything after opening reads: the person's file, or its
  // repaired copy when the page list had to be rebuilt (DEBT-54). `file` stays
  // the original, so the name, memory and hand-off never change identity.
  const [workingFile, setWorkingFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  // The file picked last. A load that finishes after a newer pick is stale and
  // must not touch the page list or the working file.
  const pickedFileRef = useRef<File | null>(null);
  // Bumped on every pick: the prepared key's file identity, since two different
  // PDFs can share a name, size and date while the result cache outlives a replacement.
  const [loadId, setLoadId] = useState(0);
  // The download flow is made after this callback, so it reaches its reset through a ref.
  const resetDownloadFlowRef = useRef<() => void>(() => {});
  // A protected PDF is a precondition, not a failure: set, the workspace gives way to NeedsUnlock
  // (src/shell/NeedsUnlock.tsx). Every new pick clears it before the check runs again.
  const [needsUnlock, setNeedsUnlock] = useState<{ kind: NeedsUnlockKind; bytes: ArrayBuffer } | null>(null);
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading-file' | 'error'>('idle');
  const [addPageNumbers, setAddPageNumbers] = useState(false);
  // null means "still the automatic name"; a string is the person's own.
  const [customOutputName, setCustomOutputName] = useState<string | null>(null);
  const [isRenamingOutputName, setIsRenamingOutputName] = useState(false);
  const [renderedCount, setRenderedCount] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const gridRef = useRef<HTMLUListElement | null>(null);
  // Loaded through a dynamic import() so the grid, its preview dialog and
  // Sortable stay off the eager graph check-page-weight.js measures.
  const [PageGrid, setPageGrid] = useState<ComponentType<PageGridProps> | null>(null);
  useHoldUpdate(file !== null, 'open');

  // One Undo/Redo stack over the plan. A deliberate change is a `commit`
  // (rotate, skip, move, a bulk action); opening a file is a `reset`.
  const { present, canUndo, canRedo, reset, onPlanChange, handleUndo, handleRedo } = useDocumentHistory<EditDocument>(
    EMPTY_DOCUMENT,
    { tool: 'edit-pdf', announce: setAnnouncement, messages: { undone: t.undoneAnnouncement, redone: t.redoneAnnouncement } },
  );
  const { plan } = present;

  const handleFilesAdded = useCallback(async (fileList: FileList | File[]) => {
    const pdfs = Array.from(fileList).filter((f) => isPdfFile(f));
    if (pdfs.length === 0) return;
    const selectedFile = pdfs[0];
    recordAction(file ? 'replace_file' : 'add_files');

    setFile(selectedFile);
    setWorkingFile(selectedFile);
    pickedFileRef.current = selectedFile;
    setLoadId((n) => n + 1);
    resetDownloadFlowRef.current();
    setLoadStatus('loading-file');
    setNeedsUnlock(null);
    setPageCount(0);
    setRenderedCount(0);
    setAddPageNumbers(false);
    setCustomOutputName(null);
    // A new file starts a fresh document: reset (not commit) so the previous
    // file's undo/redo stacks don't leak across files.
    reset(EMPTY_DOCUMENT);

    try {
      // Loaded here, not at module scope: pdf-lib is 628 KiB and this is the
      // first moment the page needs it, so /edit-pdf/ ships without it until a
      // file is picked (the loader imports it lazily). The catch below already
      // covers a failure.
      const bytes = await selectedFile.arrayBuffer();
      // pdf-lib cannot read either kind of protection (an owner-only file loads as blank pages), so both go to Unlock.
      let protection = 'open';
      try {
        protection = await probeEncryption(bytes);
      } catch (err) {
        // The probe itself failing says nothing about the file; load as today.
        reportError('pdf_tool_run', err, 'check_encryption');
      }
      if (pickedFileRef.current !== selectedFile) return;
      if (protection === 'needs-password' || protection === 'owner-restricted') {
        setNeedsUnlock({ kind: protection, bytes });
        setLoadStatus('idle');
        setAnnouncement(protection === 'needs-password' ? t.announceNeedsPassword : t.announceRestricted);
        return;
      }
      const loaded = await loadPdfWithPages(bytes);
      if (pickedFileRef.current !== selectedFile) return;
      // The grid (pdf.js) and the export need the repaired bytes: pdf.js
      // rejects the unrepaired file. Handing them the same working file means
      // the repair runs, and is counted, once.
      setWorkingFile(loaded.repaired
        ? new File([loaded.bytes as BlobPart], selectedFile.name, {
          type: 'application/pdf',
          lastModified: selectedFile.lastModified,
        })
        : selectedFile);
      setPageCount(loaded.pageCount);
      reset({ plan: planForFile(FILE_ID, loaded.pageCount) });
      setLoadStatus('idle');
      setAnnouncement(formatMessage(t.loaded, { name: selectedFile.name, count: loaded.pageCount }));
    } catch (err) {
      reportError('pdf_tool_run', err, 'load_document');
      console.error(err);
      if (pickedFileRef.current !== selectedFile) return;
      setLoadStatus('error');
      setAnnouncement(t.loadFailed);
    }
  }, [reset, file]);

  // SITE-42: files picked on the home page arrive as a hand-off, collected on
  // mount and sent down the same path a manual pick takes. This tool restores
  // nothing on mount, so there is no restore to race - see useHandoffIntake.ts.
  useHandoffIntake('edit-pdf', (f) => handleFilesAdded([f]));

  useEffect(() => {
    if (!file || PageGrid) return undefined;
    let cancelled = false;
    import('../../shell/pageGrid/PageGrid.tsx')
      .then((module) => { if (!cancelled) setPageGrid(() => module.default); })
      .catch((err) => reportError('pdf_render', err, 'load_page_grid'));
    return () => { cancelled = true; };
  }, [file !== null, PageGrid]);

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
