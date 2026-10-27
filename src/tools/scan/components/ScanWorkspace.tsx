import { Eraser, FileSignature, ImagePlus, Shrink, Trash2 } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { formatMessage } from '../../../lib/formatMessage';
import type { PreparedOutput } from '../../../lib/usePreparedOutput.ts';
import DownloadElement from '../../../shell/DownloadElement.tsx';
import ErrorMessage from '../../../shell/ErrorMessage.tsx';
import OutputName from '../../../shell/OutputName.tsx';
import pdfToolStyles from '../../../shell/PdfTool.module.css';
import FinishRow from '../../../shell/pageWorkspace/FinishRow.tsx';
import OptionRow from '../../../shell/pageWorkspace/OptionRow.tsx';
import PageWorkspace, { workspaceStyles } from '../../../shell/pageWorkspace/PageWorkspace.tsx';
import PhoneFinish from '../../../shell/pageWorkspace/PhoneFinish.tsx';
import { pagesLabel } from '../../../shell/pageWorkspace/pageCounts.ts';
import type { HandoffTool, useDownloadFlow } from '../../../shell/pageWorkspace/useDownloadFlow.ts';
import { englishShellMessages } from '../../../shell/shellMessages';
import { failedPositions } from '../lib/scanPages.ts';
import { limitOptions, sizeOptions } from '../lib/scanOptions.ts';
import type { PageSize } from '../lib/scanPipeline.ts';
import type { SizeLimitId } from '../lib/scanBudget.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanPage } from '../state/scanWork.ts';
import styles from '../PdfScanTool.module.css';
import ScanWorkbench, { type ScanWorkbenchProps } from './ScanWorkbench.tsx';
import TakePhotoButton from './TakePhotoButton.tsx';

const HANDOFF_TOOLS: HandoffTool[] = ['sign', 'redact', 'compress'];
const HANDOFF_ITEMS = [
  { tool: 'sign' as HandoffTool, label: t.handoffSign, Icon: FileSignature },
  { tool: 'redact' as HandoffTool, label: t.handoffRedact, Icon: Eraser },
  { tool: 'compress' as HandoffTool, label: t.handoffCompress, Icon: Shrink },
];

type Flow = ReturnType<typeof useDownloadFlow>;

/** What the download row, the phone bar and the errors read about the PDF being made. */
interface ScanOutput {
  prepared: PreparedOutput;
  flow: Flow;
  fileName: string;
  /** The size-and-pages line under the Download button. */
  detail: string;
  outputName: string;
  isRenaming: boolean;
  onRename: (name: string) => void;
  onEditingChange: (editing: boolean) => void;
  onShowFailedPage: () => void;
}

interface ScanOptionsProps {
  pageSize: PageSize;
  limit: SizeLimitId;
  onPageSize: (next: PageSize) => void;
  onLimit: (next: SizeLimitId) => void;
  limitNote: string | undefined;
}

/** The paper and the size limit: one set for the rail, one for phones under the pages (the rail is hidden below 1024px). */
function ScanOptions({ suffix, options }: { suffix: string; options: ScanOptionsProps }) {
  return (
    <>
      <OptionRow id={`scan-size${suffix}`} label={t.pageSizeLabel} options={sizeOptions()} value={options.pageSize} onChange={options.onPageSize} dir={t.dir} />
      <OptionRow id={`scan-limit${suffix}`} label={t.limitLabel} options={limitOptions()} value={options.limit} onChange={options.onLimit} dir={t.dir} note={options.limitNote} />
    </>
  );
}

/** The next page is one tap away however far down the page is: the camera on a phone, the picker with a mouse.
 * The pages column carries these from 1024px. */
function ScanPhoneBar({ addFiles, requestReplace, output }: { addFiles: (files: File[]) => void; requestReplace: () => void; output: ScanOutput }) {
  return (
    <div class={workspaceStyles['chip-bar']}>
      <TakePhotoButton onFiles={addFiles} buttonClass={styles['bar-add']} />
      <button type="button" class={`${styles['bar-add']} ${styles['bar-pick']}`} onClick={requestReplace}>
        <ImagePlus size={18} aria-hidden="true" />
        {t.addPhotos}
      </button>
      <PhoneFinish
        flow={output.flow}
        prepared={output.prepared}
        fileName={output.fileName}
        detail={output.detail}
        handoffs={HANDOFF_ITEMS}
        labels={{ download: t.downloadShort, ready: t.readyAnnouncement, closeStrip: t.closeStrip, handoffFailed: t.handoffFailed }}
      />
    </div>
  );
}

function ScanHeading({ pageCount, output }: { pageCount: number; output: ScanOutput }) {
  return (
    <h2 class={workspaceStyles['doc-heading']}>
      <span class="sr-only">{t.documentHeading}</span>
      <OutputName name={output.outputName} label={t.fileNameLabel} onRename={output.onRename} onEditingChange={output.onEditingChange} wrapOnPhone>
        <span class={workspaceStyles['doc-heading-count']}>{' · '}{pagesLabel(pageCount, englishShellMessages)}</span>
      </OutputName>
    </h2>
  );
}

/** The rail's pinned region: the Download element, what follows it, and on a phone the rating ask. */
function ScanRailPinned({ pages, failedIds, output, rating }: { pages: ScanPage[]; failedIds: number[]; output: ScanOutput; rating: ComponentChildren }) {
  const { prepared, flow } = output;
  return (
    <>
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
      <FinishRow
        ready={prepared.status === 'ready'}
        shareReady={flow.shareReady}
        onShare={flow.handleShare}
        busy={flow.handoffBusy}
        onHandoff={(tool) => { void flow.requestHandoff(tool); /* reason: requestHandoff catches its own failure and shows the hand-off error */ }}
        onWarm={prepared.prepareNow}
        labels={{ share: t.shareLabel, compress: t.handoffCompress, sign: t.handoffSign, redact: t.handoffRedact }}
        tools={HANDOFF_TOOLS}
      />
      {flow.handoffFailed && (
        <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">{t.handoffFailed}</p>
      )}
      {rating}
    </>
  );
}

/** Under the header: why there is no PDF yet, when there is not. */
function ScanErrors({ pages, failedIds, buildFailed }: { pages: ScanPage[]; failedIds: number[]; buildFailed: boolean }) {
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

interface ScanWorkspaceProps {
  bridge: { requestReplace: () => void; requestClear: () => void };
  pages: ScanPage[];
  failedIds: number[];
  addFiles: (files: File[]) => void;
  output: ScanOutput;
  options: ScanOptionsProps;
  /** On a phone the rating ask follows the next steps; on desktop it sits under the page instead. */
  rating: ComponentChildren;
  wide: boolean;
  workbench: Omit<ScanWorkbenchProps, 'actions'> & { actions: Omit<ScanWorkbenchProps['actions'], 'onPickMore'> };
}

/** The workspace around the photo and the pages: the phone bar, the heading, the rail and the errors. */
export default function ScanWorkspace({ bridge, pages, failedIds, addFiles, output, options, rating, wide, workbench }: ScanWorkspaceProps) {
  return (
    <PageWorkspace
      rootAttrs={{ 'data-scan-ready': output.prepared.status === 'ready' || undefined }}
      phoneBar={<ScanPhoneBar addFiles={addFiles} requestReplace={bridge.requestReplace} output={output} />}
      heading={<ScanHeading pageCount={pages.length} output={output} />}
      railContent={(
        <>
          <ScanOptions suffix="" options={options} />
          <div class={workspaceStyles['quiet-row']}>
            <button type="button" class={workspaceStyles['quiet-button']} onClick={bridge.requestClear}>
              <Trash2 size={16} aria-hidden="true" />
              {englishShellMessages.clearLabel ?? t.clearAll}
            </button>
          </div>
        </>
      )}
      railPinned={<ScanRailPinned pages={pages} failedIds={failedIds} output={output} rating={!wide && rating} />}
    >
      <ScanErrors pages={pages} failedIds={failedIds} buildFailed={output.prepared.status === 'error'} />
      <ScanWorkbench {...workbench} actions={{ ...workbench.actions, onPickMore: bridge.requestReplace }} />

      {/* On a phone the corners come first; the choices follow the pages they apply to. */}
      <div class={styles['phone-options']}><ScanOptions suffix="-phone" options={options} /></div>
      {/* Desktop: under the page, inside the first screen (useFloorHeight leaves it the room). */}
      {wide && <div class={styles['rating-slot']}>{rating}</div>}
    </PageWorkspace>
  );
}
