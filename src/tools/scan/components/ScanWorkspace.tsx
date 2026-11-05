import { Trash2 } from 'lucide-preact';
import type { ComponentChildren, Ref } from 'preact';
import pdfToolStyles from '#shell/PdfTool.module.css';
import FinishRow from '#shell/pageWorkspace/FinishRow.tsx';
import OptionRow from '#shell/pageWorkspace/OptionRow.tsx';
import PageWorkspace, { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';
import type { HandoffTool } from '#shell/pageWorkspace/useDownloadFlow.ts';
import { englishShellMessages } from '#shell/shellMessages.ts';
import { limitOptions, sizeOptions } from '../lib/scanOptions.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanOptionsProps, ScanOutput } from '../state/scanOutput.ts';
import type { PageResult, ScanPage } from '../state/scanWork.ts';
import styles from '../PdfScanTool.module.css';
import { ScanDownloadElement, ScanDraftStatus, ScanErrors, ScanHeading } from './ScanOutputParts.tsx';
import ScanTable from './ScanTable.tsx';

const HANDOFF_TOOLS: HandoffTool[] = ['sign', 'highlight-pdf', 'redact', 'compress'];

/** The paper and the size limit, in the rail. */
function ScanOptions({ options }: { options: ScanOptionsProps }) {
  return (
    <>
      <OptionRow id="scan-size" label={t.pageSizeLabel} options={sizeOptions()} value={options.pageSize} onChange={options.onPageSize} dir={t.dir} />
      <OptionRow id="scan-limit" label={t.limitLabel} options={limitOptions()} value={options.limit} onChange={options.onLimit} dir={t.dir} note={options.limitNote} />
    </>
  );
}

/** The rail's pinned region: the Download element and what follows it. */
function ScanRailPinned({ pages, failedIds, output }: { pages: ScanPage[]; failedIds: number[]; output: ScanOutput }) {
  const { prepared, flow } = output;
  return (
    <>
      <ScanDownloadElement pages={pages} failedIds={failedIds} output={output} />
      <FinishRow
        ready={prepared.status === 'ready'}
        shareReady={flow.shareReady}
        onShare={flow.handleShare}
        busy={flow.handoffBusy}
        onHandoff={(tool) => { void flow.requestHandoff(tool); /* reason: requestHandoff catches its own failure and shows the hand-off error */ }}
        onWarm={prepared.prepareNow}
        labels={{ share: t.shareLabel, compress: t.handoffCompress, sign: t.handoffSign, 'highlight-pdf': t.handoffHighlight, redact: t.handoffRedact }}
        tools={HANDOFF_TOOLS}
      />
      {flow.handoffFailed && (
        <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">{t.handoffFailed}</p>
      )}
    </>
  );
}

interface ScanWorkspaceProps {
  /** A tile on the table opens that page in the viewer. */
  onOpen: (id: number) => void;
  results: Record<number, PageResult>;
  resultKeyOf: (page: ScanPage) => string;
  bridge: { requestReplace: () => void; requestClear: () => void };
  pages: ScanPage[];
  failedIds: number[];
  onFiles: (files: File[]) => void;
  /** Opens the live viewfinder, where the device has one. */
  onCamera?: () => void;
  output: ScanOutput;
  options: ScanOptionsProps;
  /** The rating ask, under the page inside the first screen. */
  rating: ComponentChildren;
  /** The table's reorder: the list the drag binds to, and the arrow keys. */
  listRef: Ref<HTMLUListElement>;
  onTileKeyDown: (event: KeyboardEvent, id: number) => void;
}

/** The desktop workspace around the pages: the heading, the rail and the errors. Phones render ScanPhoneTable. */
export default function ScanWorkspace({ onOpen, results, resultKeyOf, bridge, pages, failedIds, onFiles, onCamera, output, options, rating, listRef, onTileKeyDown }: ScanWorkspaceProps) {
  return (
    <PageWorkspace
      rootAttrs={{ 'data-scan-ready': output.prepared.status === 'ready' || undefined }}
      heading={<ScanHeading pageCount={pages.length} output={output} />}
      railContent={(
        <>
          <ScanOptions options={options} />
          <ScanDraftStatus output={output} />
          <div class={workspaceStyles['quiet-row']}>
            <button type="button" class={workspaceStyles['quiet-button']} onClick={bridge.requestClear}>
              <Trash2 size={16} aria-hidden="true" />
              {englishShellMessages.clearLabel ?? t.clearAll}
            </button>
          </div>
        </>
      )}
      railPinned={<ScanRailPinned pages={pages} failedIds={failedIds} output={output} />}
    >
      <ScanErrors pages={pages} failedIds={failedIds} buildFailed={output.prepared.status === 'error'} />
      <ScanTable
        pages={pages}
        results={results}
        resultKeyOf={resultKeyOf}
        failedIds={failedIds}
        pageSize={options.pageSize}
        listRef={listRef}
        onOpen={onOpen}
        onTileKeyDown={onTileKeyDown}
        onFiles={onFiles}
        onCamera={onCamera}
        onPickMore={bridge.requestReplace}
      />
      {/* Under the pages. */}
      <div class={styles['rating-slot']}>{rating}</div>
    </PageWorkspace>
  );
}
