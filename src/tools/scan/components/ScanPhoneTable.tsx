import { useState } from 'preact/hooks';
import type { ComponentChildren, Ref } from 'preact';
import { ChevronDown, Eraser, FileSignature, Share, Trash2 } from 'lucide-preact';
import QuietDownload from '#shell/pageWorkspace/QuietDownload.tsx';
import OptionRow from '#shell/pageWorkspace/OptionRow.tsx';
import pdfToolStyles from '#shell/PdfTool.module.css';
import { sizeOptions } from '../lib/scanOptions.ts';
import { pageSizeQuietLabel, sizeValueText } from '../lib/tableText.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { ScanOptionsProps, ScanOutput } from '../state/scanOutput.ts';
import type { PageResult, ScanPage } from '../state/scanWork.ts';
import { ScanDownloadElement, ScanErrors, ScanHeading } from './ScanOutputParts.tsx';
import ScanPageGrid from './ScanPageGrid.tsx';
import ScanSizeRow from './ScanSizeRow.tsx';
import styles from './ScanPhoneTable.module.css';

interface ScanPhoneTableProps {
  pages: ScanPage[];
  results: Record<number, PageResult>;
  resultKeyOf: (page: ScanPage) => string;
  failedIds: number[];
  listRef: Ref<HTMLUListElement>;
  onOpen: (id: number) => void;
  onTileKeyDown: (event: KeyboardEvent, id: number) => void;
  onFiles: (files: File[]) => void;
  onCamera: () => void;
  onPickMore: () => void;
  onClear: () => void;
  output: ScanOutput;
  options: ScanOptionsProps;
  /** The rating ask, when it is time to show one. */
  rating: ComponentChildren;
}

/** The card: the PDF's real size, the limits that shape it, and the paper it is laid on. */
function SizeCard({ output, options, held }: { output: ScanOutput; options: ScanOptionsProps; held: boolean }) {
  const [paperOpen, setPaperOpen] = useState(false);
  const { prepared } = output;
  return (
    <div class={styles.card} data-card>
      <ScanSizeRow sizeText={held ? '' : sizeValueText(prepared.status, prepared.size, t.dir)} limit={options.limit} onLimit={options.onLimit} limitNote={options.limitNote} />
      <button type="button" class={styles['page-size']} data-page-size aria-expanded={paperOpen} aria-controls="scan-size-table" onClick={() => setPaperOpen(!paperOpen)}>
        {pageSizeQuietLabel(options.pageSize)}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {paperOpen && (
        <div id="scan-size-table">
          <OptionRow id="scan-paper-table" label={t.pageSizeLabel} showLabel={false} options={sizeOptions()} value={options.pageSize} onChange={options.onPageSize} dir={t.dir} />
        </div>
      )}
    </div>
  );
}

/** Share, the one filled button; where the phone cannot share, or a page holds the PDF back, the Download element takes its place. */
function ShareOrDownload({ pages, failedIds, output, canShare }: { pages: ScanPage[]; failedIds: number[]; output: ScanOutput; canShare: boolean }) {
  const { prepared, flow } = output;
  const ready = prepared.status === 'ready';
  const warm = prepared.prepareNow;
  if (!canShare) return <ScanDownloadElement pages={pages} failedIds={failedIds} output={output} />;
  return (
    <button
      type="button"
      class={styles.share}
      data-share
      aria-disabled={!ready || undefined}
      onClick={ready ? flow.handleShare : undefined}
      onPointerEnter={warm}
      onFocus={warm}
      onPointerDown={warm}
    >
      <Share size={22} aria-hidden="true" />
      {t.shareLabel}
    </button>
  );
}

/** The loaded state on a phone: the name with a small Clear all beside it, the numbered pages, the size card, Share and the quiet next steps. */
export default function ScanPhoneTable({ pages, results, resultKeyOf, failedIds, listRef, onOpen, onTileKeyDown, onFiles, onCamera, onPickMore, onClear, output, options, rating }: ScanPhoneTableProps) {
  const { prepared, flow } = output;
  const ready = prepared.status === 'ready';
  // A page that could not be read, or a failed build: there is no PDF to size or share until it is dealt with.
  const held = failedIds.length > 0 || prepared.status === 'error';
  const canShare = flow.canSharePdf && !held;
  const handoff = (tool: 'sign' | 'redact') => { void flow.requestHandoff(tool); /* reason: requestHandoff catches its own failure */ };
  return (
    <div class={styles.table} data-scan-ready={ready || undefined}>
      <ScanErrors pages={pages} failedIds={failedIds} buildFailed={prepared.status === 'error'} />
      <div class={styles.top}>
        <ScanHeading pageCount={pages.length} output={output} />
        <button type="button" class={styles.clear} data-clear-all onClick={onClear}>
          <Trash2 size={14} aria-hidden="true" />
          {t.clearAll}
        </button>
      </div>
      <ScanPageGrid
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
        onPickMore={onPickMore}
      />
      <div class={styles['hint-row']}>
        <p class={styles.hint} data-hint>{t.tableHint}</p>
        <button type="button" class={styles.choose} onClick={onPickMore}>{t.choosePhotos}</button>
      </div>
      <SizeCard output={output} options={options} held={held} />
      <ShareOrDownload pages={pages} failedIds={failedIds} output={output} canShare={canShare} />
      <div class={styles.steps} data-quiet-row>
        {canShare && (
          <QuietDownload
            state={flow.downloadState}
            linkReady={flow.downloadLinkReady}
            href={prepared.url}
            fileName={output.fileName}
            label={t.downloadShort}
            onDownloadTap={flow.onQuietDownloadTap}
            onPreparingTap={flow.onQuietPreparingTap}
            onWarm={prepared.prepareNow}
          />
        )}
        <button type="button" disabled={flow.handoffBusy || !ready} onClick={() => handoff('sign')}>
          <FileSignature size={18} aria-hidden="true" />
          {t.handoffSign}
        </button>
        <button type="button" disabled={flow.handoffBusy || !ready} onClick={() => handoff('redact')}>
          <Eraser size={18} aria-hidden="true" />
          {t.handoffRedact}
        </button>
      </div>
      {flow.handoffFailed && (
        <p class={`${pdfToolStyles['hint-message']} ${pdfToolStyles.danger}`} role="status">{t.handoffFailed}</p>
      )}
      {rating}
    </div>
  );
}
