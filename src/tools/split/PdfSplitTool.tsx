import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { FileSignature, Shrink } from 'lucide-preact';
import { probeEncryption } from '../../lib/pdfEncryption.ts';
import { loadPdfWithPages } from '../../lib/loadPdfPages.ts';
import { includeAll, invert, outputPageCount, planForFile, planKey, skipAll, withIncludedPages, type PlanEntry } from '../../lib/pagePlan.ts';
import { useDocumentHistory } from '../../lib/history/useDocumentHistory.ts';
import { usePreparedOutput } from '../../lib/usePreparedOutput.ts';
import type { QuietPolicy } from '../../lib/quietPrepare.ts';
import { useHandoffIntake } from '../../lib/useHandoffIntake.ts';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { reportError } from '../../lib/errorReport.ts';
import { reportEdit } from '../../lib/productAnalytics.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import { formatFileSize, isolateLtr, isolateName } from '../../lib/format.js';
import {
  englishShellMessages,
  englishSplitMessages,
  formatMessage,
  type ShellMessages,
  type SplitMessages,
} from '../../i18n/toolMessages';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import ToolShellBridge from '../../shell/ToolShellBridge.tsx';
import DownloadElement from '../../shell/DownloadElement.tsx';
import NeedsUnlock, { type NeedsUnlockKind } from '../../shell/NeedsUnlock.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import HistoryButtons from '../../shell/HistoryButtons.tsx';
import OutputName from '../../shell/OutputName.tsx';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import FinishRow from '../../shell/pageWorkspace/FinishRow.tsx';
import PhoneFinish from '../../shell/pageWorkspace/PhoneFinish.tsx';
import { downloadDetail, pagesLabel, skippedLabel } from '../../shell/pageWorkspace/pageCounts.ts';
import PageWorkspace, { workspaceStyles } from '../../shell/pageWorkspace/PageWorkspace.tsx';
import { useDownloadFlow, type HandoffTool } from '../../shell/pageWorkspace/useDownloadFlow.ts';
import type { PageGridProps } from '../../shell/pageGrid/PageGrid.tsx';
import SplitVerb from './verb/SplitVerb.tsx';
import OptionRow, { type Option } from '../../shell/pageWorkspace/OptionRow.tsx';
import PageRangeField from '../../shell/pageWorkspace/PageRangeField.tsx';
import { buildSplit, type SplitMode } from './splitOutput.ts';
import { outputBaseName, extractedFileName } from './split.js';

const HANDOFF_HREFS: Record<HandoffTool, string> = { compress: '/compress/', sign: '/sign/' };

// The one file has one source in the shared plan.
const FILE_ID = 0;

interface SplitDocument {
  plan: PlanEntry[];
}

const EMPTY_DOCUMENT: SplitDocument = { plan: [] };

/** Fills a sentence that holds one non-text node (a link) at `{slot}`. */
function withSlot(template: string, slot: string, node: any) {
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

export default function PdfSplitTool({
  messages: messagesProp,
  shellMessages,
  navigate,
  quietPolicy,
}: PdfSplitToolProps = {}) {
  const t: SplitMessages = { ...englishSplitMessages, ...messagesProp };
  const sm: ShellMessages = { ...englishShellMessages, ...shellMessages };
  const [file, setFile] = useState<File | null>(null);
  // The bytes everything after opening reads: the person's file, or its
  // repaired copy when the page list had to be rebuilt. `file` stays the
  // original, so the name, memory and hand-off never change identity.
  const [workingFile, setWorkingFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  // The file picked last. A load that finishes after a newer pick is stale.
  const pickedFileRef = useRef<File | null>(null);
  // Bumped on every pick: the prepared key's file identity, since two different
  // PDFs can share a name, size and date while the result cache outlives a replacement.
  const [loadId, setLoadId] = useState(0);
  const resetDownloadFlowRef = useRef<() => void>(() => {});
  // A protected PDF is a precondition, not a failure (src/shell/NeedsUnlock.tsx).
  const [needsUnlock, setNeedsUnlock] = useState<{ kind: NeedsUnlockKind; bytes: ArrayBuffer } | null>(null);
  const [loadStatus, setLoadStatus] = useState<'idle' | 'loading-file' | 'error'>('idle');
  // What to save and the output name are outside the Undo stack, like Edit PDF's page numbers.
  const [mode, setMode] = useState<SplitMode>('combined');
  // null means "still the source's own name"; a string is the person's own.
  const [customName, setCustomName] = useState<string | null>(null);
  const [isRenamingOutputName, setIsRenamingOutputName] = useState(false);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [renderedCount, setRenderedCount] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const gridRef = useRef<HTMLUListElement | null>(null);
  // Loaded through a dynamic import() so the grid, its preview dialog and
  // Sortable stay off the eager graph check-page-weight.js measures.
  const [PageGrid, setPageGrid] = useState<ComponentType<PageGridProps> | null>(null);
  useHoldUpdate(file !== null, 'open');

  const { present, canUndo, canRedo, reset, onPlanChange, handleUndo, handleRedo } = useDocumentHistory<SplitDocument>(
    EMPTY_DOCUMENT,
    { tool: 'split', announce: setAnnouncement, messages: { undone: t.undoneAnnouncement, redone: t.redoneAnnouncement } },
  );
  const { plan } = present;

  const handleFilesAdded = useCallback(async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    const pdfs = incoming.filter((f) => f.type === 'application/pdf');
    setRejectedFiles(incoming.filter((f) => f.type !== 'application/pdf').map((f) => f.name));
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
    setMode('combined');
    setCustomName(null);
    // A new file starts a fresh document: reset (not commit) so the previous
    // file's undo/redo stacks don't leak across files.
    reset(EMPTY_DOCUMENT);

    try {
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
      // The grid (pdf.js) and the export read the repaired bytes, so the repair runs once.
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
  }, [reset, file, t.announceNeedsPassword, t.announceRestricted, t.loaded, t.loadFailed]);

  // MERGE-14: a PDF handed off from another tool (or the home page) is collected
  // on mount and dropped into the same path a manual pick takes.
  useHandoffIntake('split', (f) => handleFilesAdded([f]));

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
    hrefs: HANDOFF_HREFS,
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

  const onSelectPages = useCallback((numbers: number[], options: { merge: boolean }) => {
    onPlanChange((current) => withIncludedPages(current, numbers), options);
  }, [onPlanChange]);

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

  const bulkRow = (
    <div class={workspaceStyles['quiet-row']}>
      <button type="button" class={workspaceStyles['quiet-button']} onClick={onIncludeAll}>{t.includeAll}</button>
      <button type="button" class={workspaceStyles['quiet-button']} onClick={onSkipAll}>{t.skipAll}</button>
      <button type="button" class={workspaceStyles['quiet-button']} onClick={onInvert}>{t.invertPages}</button>
    </div>
  );

  // The phone row shares its line with the bulk buttons, so it takes the shell's short label.
  const replaceRow = (requestReplace: () => void, label = sm.replaceLabel) => (
    <div class={workspaceStyles['quiet-row']}>
      <button type="button" class={workspaceStyles['quiet-button']} onClick={requestReplace} title={sm.replaceLabel}>{label}</button>
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
      emptyArt={<SplitVerb />}
      hasFiles={file !== null}
      analyticsTool="split"
      // A protected file is the person's file, not a failed operation: it stays out of the failure count.
      analyticsStatus={analyticsStatus}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      file={file}
      fileLabel={file?.name}
      shellMessages={shellMessages}
      hideIdentity
    >
      {rejectedFiles.length > 0 && (
        <p class={pdfToolStyles['hint-message']} role="status">
          {rejectedFiles.length === 1
            ? formatMessage(t.skippedOne, { name: isolateName(rejectedFiles[0], t.dir) })
            : formatMessage(t.skippedMany, { count: rejectedFiles.length })}
        </p>
      )}

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
        <ToolShellBridge>
          {({ requestReplace }) => (
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
                  {/* The bulk row starts the line and Replace file takes its end, as Merge's file
                      controls do; the range field gets the next line to itself. */}
                  {bulkRow}
                  {replaceRow(requestReplace, sm.replaceShort)}
                  {rangeField('page-selector-input-phone')}
                </div>
              )}
              heading={(
                <h2 class={workspaceStyles['doc-heading']} id="page-grid-heading">
                  <span class="sr-only">{t.documentHeading}</span>
                  {combined ? (
                    <OutputName
                      prefix="extracted_"
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
                  ) : (
                    <>
                      <bdi dir="ltr">{fileName}</bdi>
                      <span class={workspaceStyles['doc-heading-count']}>
                        {' · '}{pdfsLabel(outputCount)}
                        {skippedCount > 0 ? ` · ${skippedLabel(skippedCount, t)}` : ''}
                      </span>
                    </>
                  )}
                </h2>
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
                    onHandoff={(tool) => { void requestHandoff(tool); }}
                    onWarm={prepared.prepareNow}
                    labels={{ share: t.shareLabel, compress: t.handoffCompress, sign: t.handoffSign }}
                    tools={combined ? ['compress', 'sign'] : []}
                  />

                  {handoffFailed && (
                    <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">{t.handoffFailed}</p>
                  )}

                  {/* Starting over with another file ends the rail. */}
                  {replaceRow(requestReplace)}
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
        </ToolShellBridge>
      )}

      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </BasePdfTool>
  );
}
