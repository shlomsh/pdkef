import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren, ComponentType } from 'preact';
import { FileSignature, Shrink } from 'lucide-preact';
import { probeEncryption } from '../../lib/pdfEncryption.ts';
import { reportEdit } from '../../lib/productAnalytics.ts';
import { editPages } from './editPages.js';
import { editOptionsFromPlan, includeAll, invert, skipAll } from './editPlan.ts';
import { englishEditPagesMessages as t } from './messages.ts';
import { loadPdfWithPages } from './loadPdfPages.ts';
import { outputPageCount, planForFile, type PlanEntry } from '../../lib/pagePlan.ts';
import { useEditHistory } from '../../lib/history/useEditHistory.js';
import { useHistoryShortcuts } from '../../lib/history/useHistoryShortcuts.js';
import { usePreparedOutput } from '../../lib/usePreparedOutput.ts';
import { useHandoffIntake } from '../../lib/useHandoffIntake.ts';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { reportError } from '../../lib/errorReport.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import { formatFileSize, isolateLtr } from '../../lib/format.js';
import { englishShellMessages as sm, formatMessage } from '../../i18n/toolMessages';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import { useToolShell } from '../../shell/ToolShell.tsx';
import DoneStrip from '../../shell/DoneStrip.tsx';
import DownloadElement from '../../shell/DownloadElement.tsx';
import NeedsUnlock, { type NeedsUnlockKind } from '../../shell/NeedsUnlock.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import FileName from '../../shell/FileName.tsx';
import HistoryButtons from '../../shell/HistoryButtons.tsx';
import OutputName from '../../shell/OutputName.tsx';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import FinishRow from '../../shell/pageWorkspace/FinishRow.tsx';
import QuietDownload from '../../shell/pageWorkspace/QuietDownload.tsx';
import PageWorkspace, { workspaceStyles } from '../../shell/pageWorkspace/PageWorkspace.tsx';
import { useDownloadFlow, type HandoffTool } from '../../shell/pageWorkspace/useDownloadFlow.ts';
import type { PageGridProps } from '../../shell/pageGrid/PageGrid.tsx';
import ExportHandoffs from '../../editor-ui/ExportHandoffs.tsx';
import EditPagesVerb from './verb/EditPagesVerb.tsx';

const HANDOFF_HREFS: Record<HandoffTool, string> = { compress: '/compress/', sign: '/sign/' };

// The one file has one source in the shared plan.
const FILE_ID = 0;

interface EditDocument {
  plan: PlanEntry[];
}

const EMPTY_DOCUMENT: EditDocument = { plan: [] };

/** BasePdfTool's replace confirmation is reached through ToolShellContext,
 * which only reaches components rendered inside <BasePdfTool>'s children; this
 * is that one descendant (the same bridge Merge uses). */
function ToolShellBridge({ children }: { children: (shell: { requestReplace: () => void }) => ComponentChildren }) {
  const { requestReplace } = useToolShell();
  return <>{children({ requestReplace })}</>;
}

export default function PdfEditPagesTool() {
  const [file, setFile] = useState<File | null>(null);
  // The bytes everything after opening reads: the person's file, or its
  // repaired copy when the page list had to be rebuilt (DEBT-54). `file` stays
  // the original, so the name, memory and hand-off never change identity.
  const [workingFile, setWorkingFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  // The file picked last. A load that finishes after a newer pick is stale and
  // must not touch the page list or the working file.
  const pickedFileRef = useRef<File | null>(null);
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
  const { present, canUndo, canRedo, commit, undo, redo, reset } = useEditHistory(EMPTY_DOCUMENT);
  const { plan } = present as EditDocument;

  const onPlanChange = useCallback((update: (current: PlanEntry[]) => PlanEntry[]) => {
    // Every call is one undo step; an update that changes nothing is none.
    commit((current: EditDocument) => {
      const next = update(current.plan);
      return next === current.plan ? current : { plan: next };
    });
    reportEdit('edit-pdf');
  }, [commit]);

  const handleFilesAdded = useCallback(async (fileList: FileList | File[]) => {
    const pdfs = Array.from(fileList).filter((f) => f.type === 'application/pdf');
    if (pdfs.length === 0) return;
    const selectedFile = pdfs[0];
    recordAction(file ? 'replace_file' : 'add_files');

    setFile(selectedFile);
    setWorkingFile(selectedFile);
    pickedFileRef.current = selectedFile;
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

  const planKey = plan.map((e) => `${e.fileId}.${e.pageIndex}.${e.rotation}.${e.skipped ? 1 : 0}`).join(',');
  const key = file && workingFile && loadStatus === 'idle' && outputCount > 0
    ? `${file.name}:${file.size}:${file.lastModified}|${planKey}|${addPageNumbers ? 1 : 0}|${title}`
    : null;
  /** What the next build reads; always the inputs of the current key. */
  const inputsRef = useRef({ workingFile, plan, addPageNumbers });
  inputsRef.current = { workingFile, plan, addPageNumbers };
  const prepared = usePreparedOutput({
    key,
    build: async (_signal, onProgress) => {
      const { workingFile: source, plan: current, addPageNumbers: numbers } = inputsRef.current;
      const blob = await editPages(source as File, { ...editOptionsFromPlan(current), addPageNumbers: numbers }, onProgress);
      return { blob, pageCount: outputPageCount(current) };
    },
    onBuildError: (err) => reportError('pdf_tool_run', err, 'apply_page_edits'),
  });

  const {
    tap, downloadState, downloadLinkReady, showStrip, shareReady, handoffBusy, handoffFailed,
    requestHandoff, onDownloadTap, onQuietDownloadTap, onQuietPreparingTap, onRowPreparingTap, handleShare, closeStrip,
  } = useDownloadFlow({
    prepared,
    fileName,
    hrefs: HANDOFF_HREFS,
    blocked: prepared.status === 'error' ? 'error' : null,
    nothing: plan.length > 0 && outputCount === 0,
    announce: setAnnouncement,
    messages: { ready: t.editedReady, shared: t.sharedSuccessfully, canceled: t.sharingCanceled, shareError: t.shareError },
  });

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    undo();
    recordAction('undo');
    setAnnouncement(t.undoneAnnouncement);
  }, [undo, canUndo]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    redo();
    recordAction('redo');
    setAnnouncement(t.redoneAnnouncement);
  }, [redo, canRedo]);

  // Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z; the hook stands down while focus is in an
  // input (the page-numbers checkbox, the rename field).
  useHistoryShortcuts(handleUndo, handleRedo);

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

  const pagesLabel = (count: number) => (count === 1 ? sm.pageCountOne : formatMessage(sm.pageCountOther, { count }));
  const downloadDetail = prepared.status === 'ready'
    ? `${pagesLabel(prepared.pageCount)} · ${isolateLtr(formatFileSize(prepared.size), 'ltr')}`
    : pagesLabel(outputCount);
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
      emptyArt={<EditPagesVerb />}
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

      {file && loadStatus === 'error' && failure}

      {file && needsUnlock && (
        <NeedsUnlock
          kind={needsUnlock.kind}
          file={file}
          bytes={needsUnlock.bytes}
          from="edit-pdf"
          toolName="Edit PDF"
          verb="edit"
        />
      )}

      {file && loadStatus === 'idle' && !needsUnlock && (
        <ToolShellBridge>
          {({ requestReplace }) => (
            <PageWorkspace
              phoneBar={(
                <div class={workspaceStyles['chip-bar']}>
                  {/* Replace file at the bar's start, the quiet Download at its end, like Merge's chip row. */}
                  <button type="button" class={workspaceStyles['quiet-button']} onClick={requestReplace}>{sm.replaceLabel}</button>
                  <QuietDownload
                    state={downloadState}
                    linkReady={downloadLinkReady}
                    href={prepared.url}
                    fileName={fileName}
                    label={t.downloadShort}
                    onDownloadTap={onQuietDownloadTap}
                    onPreparingTap={onQuietPreparingTap}
                    onWarm={prepared.prepareNow}
                  />
                  {showStrip && (
                    <DoneStrip
                      label={t.editedReady}
                      closeLabel={t.closeStrip}
                      onClose={closeStrip}
                      className={workspaceStyles['done-strip']}
                    >
                      <p class={workspaceStyles['done-strip-result']}>
                        <FileName name={fileName} className={workspaceStyles['done-strip-name']} />
                        <span class={workspaceStyles['done-strip-detail']}>{downloadDetail}</span>
                      </p>
                      <ExportHandoffs
                        items={handoffs}
                        busy={handoffBusy || prepared.status !== 'ready'}
                        onHandoff={(tool) => { void requestHandoff(tool as HandoffTool); }}
                      />
                      {handoffFailed && (
                        <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">{t.handoffFailed}</p>
                      )}
                    </DoneStrip>
                  )}
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
                      {' · '}{pagesLabel(outputCount)}
                      {skippedCount > 0 ? ` · ${pagesLabel(skippedCount)} ${t.skippedBadge.toLowerCase()}` : ''}
                    </span>
                  </OutputName>
                </h2>
              )}
              headerStatus={<HistoryButtons canUndo={canUndo} canRedo={canRedo} onUndo={handleUndo} onRedo={handleRedo} labels={t} />}
              railContent={(
                <>
                  {bulkRow}
                  {replaceRow(requestReplace)}
                </>
              )}
              railPinned={(
                <>
                  <label class={workspaceStyles['page-numbers-row']}>
                    <input type="checkbox" checked={addPageNumbers} onChange={onPageNumbersChange} />
                    <span>{t.addPageNumbers}</span>
                  </label>

                  <DownloadElement
                    state={downloadState}
                    href={prepared.status === 'ready' ? prepared.url : null}
                    fileName={fileName}
                    detail={downloadDetail}
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
        </ToolShellBridge>
      )}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
}
