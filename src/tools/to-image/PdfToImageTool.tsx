import { useMemo, useRef, useState } from 'preact/hooks';
import { includedPageNumbers, planKey, type PlanEntry } from '../../lib/pagePlan.ts';
import { usePreparedOutput } from '../../lib/usePreparedOutput.ts';
import type { QuietPolicy } from '../../lib/quietPrepare.ts';
import { useHoldUpdate } from '../../lib/useHoldUpdate.ts';
import { reportError } from '../../lib/errorReport.ts';
import { reportEdit } from '../../lib/productAnalytics.ts';
import { recordAction } from '../../lib/actionTrail.ts';
import { formatFileSize, isolateLtr } from '../../lib/format.js';
import { englishToImageMessages, type ToImageMessages } from './messages';
import { englishShellMessages, type ShellMessages } from '../../shell/shellMessages';
import { formatMessage } from '../../lib/formatMessage';
import BasePdfTool from '../../shell/BasePdfTool.tsx';
import { withIslandBoundary } from '../../lib/IslandErrorBoundary.tsx';
import ToolShellBridge from '../../shell/ToolShellBridge.tsx';
import DownloadElement from '../../shell/DownloadElement.tsx';
import NeedsUnlock from '../../shell/NeedsUnlock.tsx';
import ErrorMessage from '../../shell/ErrorMessage.tsx';
import HistoryButtons from '../../shell/HistoryButtons.tsx';
import pdfToolStyles from '../../shell/PdfTool.module.css';
import FinishRow from '../../shell/pageWorkspace/FinishRow.tsx';
import ReplaceFileLine from '../../shell/pageWorkspace/ReplaceFileLine.tsx';
import PhoneFinish from '../../shell/pageWorkspace/PhoneFinish.tsx';
import { skippedLabel } from '../../shell/pageWorkspace/pageCounts.ts';
import PageWorkspace, { workspaceStyles } from '../../shell/pageWorkspace/PageWorkspace.tsx';
import { useDownloadFlow, type HandoffTool } from '../../shell/pageWorkspace/useDownloadFlow.ts';
import OptionRow, { type Option } from '../../shell/pageWorkspace/OptionRow.tsx';
import PageRangeField from '../../shell/pageWorkspace/PageRangeField.tsx';
import type { CellAction } from '../../shell/pageGrid/PageGrid.tsx';
import { thumbnailPdfLoader } from '../../shell/pageWorkspace/useOpenPageDocument.ts';
import { usePageToolSession } from '../../shell/pageWorkspace/usePageToolSession.ts';
import { useLazyPageGrid } from '../../shell/pageWorkspace/useLazyPageGrid.ts';
import PdfToImageVerb from './verb/PdfToImageVerb.tsx';
import { imageBaseName, imageExtension, imageFileName } from './lib/toImage.js';
import {
  autoBuilds, buildImages, formatName, imageLabels, imagesMade, AUTO_BUILD_PAGE_LIMIT,
  type ImageFormat, type ImageLayout,
} from './lib/toImageOutput.ts';
import styles from './PdfToImageTool.module.css';

// Nothing is handed off from here (Share only), but the shared flow's contract names the targets.

// The one file has one source in the shared plan.
const FILE_ID = 0;

export interface PdfToImageToolProps {
  /** Server-rendered by its src/pages/[locale]/<tool>.astro route for a localized
   * edition; every key not overridden keeps the English default. */
  messages?: Partial<ToImageMessages>;
  shellMessages?: Partial<ShellMessages>;
  /** Tests only: shortens the quiet wait before the background build. */
  quietPolicy?: QuietPolicy;
}

export default withIslandBoundary(function PdfToImageTool({ messages: messagesProp, shellMessages, quietPolicy }: PdfToImageToolProps = {}) {
  const t: ToImageMessages = { ...englishToImageMessages, ...messagesProp };
  const sm: ShellMessages = { ...englishShellMessages, ...shellMessages };
  const resetDownloadFlowRef = useRef<() => void>(() => {});
  // What the images are made as sits outside the Undo stack, like Split's mode.
  const [format, setFormat] = useState<ImageFormat>('image/png');
  const [scale, setScale] = useState(2);
  const [layout, setLayout] = useState<ImageLayout>('separate');
  const [renderedCount, setRenderedCount] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const gridRef = useRef<HTMLUListElement | null>(null);

  // The shared page-tool session (src/shell/pageWorkspace/usePageToolSession.ts): history, the one
  // open path, PDF filtering, hand-off intake and the bulk actions. Only a password stops pdf.js;
  // an owner-restricted file renders and converts as it is.
  const {
    present, canUndo, canRedo, onPlanChange, handleUndo, handleRedo,
    file, pageCount, loadId, loadStatus, needsUnlock,
    handleFilesAdded, onIncludeAll, onSkipAll, onInvert, onSelectPages,
  } = usePageToolSession({
    tool: 'pdf-to-image',
    loader: thumbnailPdfLoader,
    unlockKinds: ['needs-password'],
    messages: t,
    announce: setAnnouncement,
    onPick: () => {
      resetDownloadFlowRef.current();
      setRenderedCount(0);
      // Format, quality and output are the person's choices and outlast a replaced file.
    },
  });
  const { plan } = present;
  useHoldUpdate(file !== null, 'open');
  const PageGrid = useLazyPageGrid(file !== null);

  const sources = useMemo(
    () => (file ? [{ id: FILE_ID, file, pageCount, error: null }] : []),
    [file, pageCount],
  );

  const included = includedPageNumbers(plan);
  const includedCount = included.length;
  const skippedCount = plan.length - includedCount;
  const imageCount = imagesMade(includedCount, layout);
  const baseName = file ? imageBaseName(file.name) : '';
  const extension = imageExtension(format);
  const formatLabel = formatName(format);
  const singleImage = imageCount <= 1;
  const fileName = imageFileName(baseName, extension);
  // What the output is called to the person: the pattern when it is several images.
  const outputName = singleImage ? fileName : imageFileName(baseName, extension, 'N');
  const singlePage = pageCount === 1;

  const key = file && loadStatus === 'idle' && !needsUnlock && includedCount > 0
    ? `${loadId}|${planKey(plan)}|${format}|${scale}|${layout}`
    : null;
  /** What the next build reads; always the inputs of the current key. */
  const inputsRef = useRef({ file, plan, format, scale, layout });
  inputsRef.current = { file, plan, format, scale, layout };
  const prepared = usePreparedOutput({
    cacheScope: loadId,
    key,
    quietPolicy,
    autoBuild: autoBuilds(includedCount),
    build: (signal, onProgress) => {
      const { file: source, plan: current, ...options } = inputsRef.current;
      return buildImages(source as File, current, options, onProgress, signal);
    },
    onBuildError: (err) => reportError('pdf_tool_run', err, 'convert'),
  });

  const downloadFlow = useDownloadFlow({
    prepared,
    fileName,
    blocked: prepared.status === 'error' ? 'error' : null,
    nothing: plan.length > 0 && includedCount === 0,
    announce: setAnnouncement,
    messages: { ready: t.readyAnnouncement, shared: t.sharedSuccessfully, canceled: t.sharingCanceled, shareError: t.shareError },
  });
  const {
    tap, downloadState, shareReady, onDownloadTap, onPartSaved, onRowPreparingTap, handleShare, reset: resetDownloadFlow,
  } = downloadFlow;
  resetDownloadFlowRef.current = resetDownloadFlow;

  const changeSetting = <T,>(current: T, next: T, set: (value: T) => void) => {
    if (next === current) return;
    set(next);
    recordAction('change_setting');
    reportEdit('pdf-to-image');
  };
  const formatRow = (id: string, compact = false) => (
    <OptionRow
      id={id}
      label={t.formatLabel}
      showLabel={!compact}
      options={[
        { value: 'image/png', label: 'PNG', hint: t.formatPngHint },
        { value: 'image/jpeg', label: 'JPG', hint: t.formatJpgHint },
      ] as Option<ImageFormat>[]}
      value={format}
      onChange={(next) => changeSetting(format, next, setFormat)}
      dir={t.dir}
      compact={compact}
    />
  );
  const qualityRow = (id: string) => (
    <OptionRow
      id={id}
      label={t.qualityLabel}
      options={[
        { value: 1, label: t.qualityStandard, hint: t.qualityStandardHint },
        { value: 2, label: t.qualityHigh, hint: t.qualityHighHint },
        { value: 3, label: t.qualityMaximum, hint: t.qualityMaximumHint },
      ]}
      value={scale}
      onChange={(next) => changeSetting(scale, next, setScale)}
      dir={t.dir}
    />
  );
  const layoutRow = (id: string) => (
    <OptionRow
      id={id}
      label={t.layoutLabel}
      options={[
        { value: 'separate', label: t.layoutSeparate, hint: t.layoutSeparateHint },
        { value: 'concatenated', label: t.layoutCombined, hint: t.layoutCombinedHint },
      ] as Option<ImageLayout>[]}
      value={layout}
      onChange={(next) => changeSetting(layout, next, setLayout)}
      dir={t.dir}
    />
  );

  const imagesLabel = (n: number) => (n === 1 ? t.imageCountOne : formatMessage(t.imageCountOther, { count: n }));
  // Above the auto-build limit nothing builds until the tap: say so where the size goes.
  const detail = prepared.status === 'ready'
    ? isolateLtr(formatFileSize(prepared.size), t.dir)
    : includedCount > AUTO_BUILD_PAGE_LIMIT ? t.madeOnTap : '';
  // The Download element reads its label from the catalogue; here it counts the images.
  const downloadMessages = { ...t, ...imageLabels(imageCount, formatLabel, t) };
  const analyticsStatus = loadStatus === 'error' || prepared.status === 'error' ? 'error' : tap;

  // The save link on a page whose image is built, in one-per-page output only.
  const cellAction = (entry: PlanEntry): CellAction | null => {
    if (layout !== 'separate' || entry.skipped || !prepared.parts) return null;
    const pageNumber = entry.pageIndex + 1;
    const part = prepared.parts.find((candidate) => candidate.pageNumber === pageNumber);
    if (!part) return null;
    return {
      href: part.url,
      download: part.filename,
      label: formatMessage(t.downloadPageAria, { number: included.indexOf(pageNumber) + 1 }),
      tip: t.tipSave,
      onActivate: onPartSaved,
    };
  };

  const bulkRow = singlePage ? null : (
    <div class={workspaceStyles['quiet-row']}>
      <button type="button" class={workspaceStyles['quiet-button']} onClick={onIncludeAll}>{t.includeAll}</button>
      <button type="button" class={workspaceStyles['quiet-button']} onClick={onSkipAll}>{t.skipAll}</button>
      <button type="button" class={workspaceStyles['quiet-button']} onClick={onInvert}>{t.invertPages}</button>
    </div>
  );

  // The phone row shares its line with the bulk buttons, so it takes the shell's short label.
  const replaceRow = (requestReplace: () => void) => (
    <div class={workspaceStyles['quiet-row']}>
      <button type="button" class={workspaceStyles['quiet-button']} onClick={requestReplace} title={sm.replaceTitle}>{sm.replaceLabel}</button>
    </div>
  );

  const rangeField = (id?: string) => (singlePage ? null : (
    <PageRangeField plan={plan} pageCount={pageCount} onSelect={onSelectPages} messages={t} id={id} />
  ));

  return (
    <BasePdfTool
      emptyArt={<PdfToImageVerb />}
      hasFiles={file !== null}
      analyticsTool="pdf-to-image"
      // A password-locked file is the person's file, not a failed operation: it stays out of the failure count.
      analyticsStatus={analyticsStatus}
      onFilesAdded={handleFilesAdded}
      multiple={false}
      file={file}
      fileLabel={file?.name}
      shellMessages={shellMessages}
      hideIdentity
    >
      {file && loadStatus === 'loading-file' && (
        <div class={pdfToolStyles['status-block']}>
          <p class={pdfToolStyles['status-text-muted']}>{t.loadingPages}</p>
        </div>
      )}

      {file && loadStatus === 'error' && (
        <ToolShellBridge>
          {({ requestReplace }) => (
            <>
              <ErrorMessage>{t.convertFailed}</ErrorMessage>
              {replaceRow(requestReplace)}
            </>
          )}
        </ToolShellBridge>
      )}

      {file && needsUnlock && (
        <NeedsUnlock
          kind="needs-password"
          file={file}
          bytes={needsUnlock.bytes}
          from="pdf-to-image"
          toolName="PDF to Image"
          verb="turn it into images"
          messages={{
            title: t.protectedNeedsPasswordTitle,
            body: t.protectedNeedsPasswordBody,
            unlockIt: t.protectedUnlockIt,
            handoffFailed: t.protectedHandoffFailed,
          }}
        />
      )}

      {file && loadStatus === 'idle' && !needsUnlock && (
        <PageWorkspace
          phoneBar={(
            <div class={workspaceStyles['chip-bar']}>
              {/* The format defines the output, so it stays in view; the quiet Download sits at the bar's end. */}
              {formatRow('format-bar', true)}
              <PhoneFinish
                flow={downloadFlow}
                prepared={prepared}
                fileName={outputName}
                detail={detail}
                handoffs={[]}
                labels={{ download: t.downloadShort, ready: t.readyAnnouncement, closeStrip: t.closeStrip, handoffFailed: '', nothing: t.allSkipped }}
              />
            </div>
          )}
          phoneControls={(
            <div class={workspaceStyles['mobile-file-controls']}>
              {/* The bulk row, then the range field, then the quality and output choices. */}
              {bulkRow}
              {rangeField('page-selector-input-phone')}
              <div class={styles['phone-options']}>
                {qualityRow('quality-phone')}
                {layoutRow('layout-phone')}
              </div>
            </div>
          )}
          heading={(
            <h2 class={workspaceStyles['doc-heading']} id="page-grid-heading">
              <span class="sr-only">{t.documentHeading}</span>
              <bdi dir="ltr">{outputName}</bdi>
              <span class={workspaceStyles['doc-heading-count']}>
                {' · '}{imagesLabel(imageCount)}
                {skippedCount > 0 ? ` · ${skippedLabel(skippedCount, t)}` : ''}
              </span>
            </h2>
          )}
          headerStatus={<HistoryButtons canUndo={canUndo} canRedo={canRedo} onUndo={handleUndo} onRedo={handleRedo} labels={t} />}
          railContent={(
            <>
              {/* In order of consequence (UX guideline 20): what the images are, then which pages. */}
              {formatRow('format')}
              {qualityRow('quality')}
              {layoutRow('layout')}
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
                pageCount={includedCount}
                progress={prepared.progress}
                errorMessage={t.buildFailed}
                messages={downloadMessages}
                onPreparingTap={onRowPreparingTap}
                onWarm={prepared.prepareNow}
                onDownloadClick={onDownloadTap}
              />

              <FinishRow
                ready={prepared.status === 'ready'}
                shareReady={shareReady}
                onShare={handleShare}
                onWarm={prepared.prepareNow}
                labels={{ share: t.shareLabel }}
              />

              {/* Starting over with another file ends the rail, at every width (UX guideline 20). */}
              <ReplaceFileLine />
            </>
          )}
        >
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
              cellAction={cellAction}
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
