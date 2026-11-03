import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Eraser, FileSignature, ImagePlus, Trash2 } from 'lucide-preact';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { PreparedOutput } from '#lib/output/usePreparedOutput.ts';
import QuietDownload from '#shell/pageWorkspace/QuietDownload.tsx';
import OptionRow from '#shell/pageWorkspace/OptionRow.tsx';
import { workspaceStyles } from '#shell/pageWorkspace/PageWorkspace.tsx';
import type { useDownloadFlow } from '#shell/pageWorkspace/useDownloadFlow.ts';
import { sizeOptions } from '../lib/scanOptions.ts';
import type { SizeLimitId } from '../lib/scanBudget.ts';
import type { PageSize } from '../lib/scanPipeline.ts';
import { pageSizeQuietLabel, sizeValueText } from '../lib/tableText.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { PageResult, ScanPage } from '../state/scanWork.ts';
import ScanSizeRow from './ScanSizeRow.tsx';
import TakePhotoButton from './TakePhotoButton.tsx';
import styles from './ScanTable.module.css';

interface ScanTableProps {
  pages: ScanPage[];
  results: Record<number, PageResult>;
  resultKeyOf: (page: ScanPage) => string;
  failedIds: number[];
  onOpen: (id: number) => void;
  onFiles: (files: File[]) => void;
  onPickMore: () => void;
  onClear: () => void;
  flow: Pick<ReturnType<typeof useDownloadFlow>, 'downloadState' | 'downloadLinkReady' | 'shareReady' | 'handoffBusy' | 'onQuietDownloadTap' | 'onQuietPreparingTap' | 'handleShare' | 'requestHandoff'>;
  prepared: Pick<PreparedOutput, 'status' | 'url' | 'size' | 'prepareNow'>;
  fileName: string;
  pageSize: PageSize;
  onPageSize: (next: PageSize) => void;
  limit: SizeLimitId;
  onLimit: (next: SizeLimitId) => void;
  limitNote: string | undefined;
  /** The filled Download for a phone that cannot share files (the same Download element the rail has). */
  fallbackDownload: ComponentChildren;
}

/** The loaded state: the pages as a numbered grid ending in Add pages, then (phone) the size and the one filled button. */
export default function ScanTable({
  pages, results, resultKeyOf, failedIds, onOpen, onFiles, onPickMore, onClear,
  flow, prepared, fileName, pageSize, onPageSize, limit, onLimit, limitNote, fallbackDownload,
}: ScanTableProps) {
  const [paperOpen, setPaperOpen] = useState(false);
  const ready = prepared.status === 'ready';
  const warm = prepared.prepareNow;
  return (
    <div class={styles.table}>
      <ul class={styles.grid} aria-label={t.pagesLabel}>
        {pages.map((page, index) => {
          const result = results[page.id];
          const current = result?.key === resultKeyOf(page);
          return (
            <li key={page.id} class={styles.cell}>
              <button
                type="button"
                class={styles.tile}
                data-table-page
                aria-label={formatMessage(t.tileLabel, { position: index + 1, total: pages.length })}
                onClick={() => onOpen(page.id)}
              >
                {result
                  ? <img src={result.thumbUrl} alt="" draggable={false} data-stale={!current || undefined} />
                  : <span class={styles.pending}>{failedIds.includes(page.id) ? t.pageFailed : t.processing}</span>}
                <span class={styles.badge} data-badge aria-hidden="true">{index + 1}</span>
              </button>
            </li>
          );
        })}
        <li class={styles.cell}>
          <div class={styles.add} data-add-pages>
            {/* A phone opens the camera, a mouse the picker (the pointer media queries in the sheet). */}
            <TakePhotoButton onFiles={onFiles} label={t.addPages} buttonClass={styles['add-button']} />
            <button type="button" class={`${styles['add-button']} ${styles['add-pick']}`} data-add-pick onClick={onPickMore}>
              <ImagePlus size={20} aria-hidden="true" />
              {t.addPages}
            </button>
          </div>
        </li>
      </ul>

      <p class={styles.hint}>{t.tableHint}</p>

      {/* Phone only: from 1024px the rail carries the size, Download and the rest. */}
      <div class={styles.phone}>
        <ScanSizeRow sizeText={sizeValueText(prepared.status, prepared.size, t.dir)} limit={limit} onLimit={onLimit} limitNote={limitNote} />

        {flow.shareReady ? (
          <button
            type="button"
            class={styles.primary}
            data-share
            aria-disabled={!ready || undefined}
            onClick={ready ? flow.handleShare : undefined}
            onPointerEnter={warm}
            onFocus={warm}
            onPointerDown={warm}
          >
            {t.shareLabel}
          </button>
        ) : fallbackDownload}

        <div class={workspaceStyles['quiet-row']} data-quiet-row>
          {flow.shareReady && (
            <QuietDownload
              state={flow.downloadState}
              linkReady={flow.downloadLinkReady}
              href={prepared.url}
              fileName={fileName}
              label={t.downloadShort}
              onDownloadTap={flow.onQuietDownloadTap}
              onPreparingTap={flow.onQuietPreparingTap}
              onWarm={warm}
            />
          )}
          <button type="button" class={workspaceStyles['quiet-button']} disabled={flow.handoffBusy || !ready} onClick={() => { void flow.requestHandoff('sign'); /* reason: requestHandoff catches its own failure */ }}>
            <FileSignature size={16} aria-hidden="true" />
            {t.handoffSign}
          </button>
          <button type="button" class={workspaceStyles['quiet-button']} disabled={flow.handoffBusy || !ready} onClick={() => { void flow.requestHandoff('redact'); /* reason: requestHandoff catches its own failure */ }}>
            <Eraser size={16} aria-hidden="true" />
            {t.handoffRedact}
          </button>
          <button type="button" class={workspaceStyles['quiet-button']} aria-expanded={paperOpen} aria-controls="scan-size-table" onClick={() => setPaperOpen(!paperOpen)}>
            {pageSizeQuietLabel(pageSize)}
          </button>
          <button type="button" class={workspaceStyles['quiet-button']} onClick={onClear}>
            <Trash2 size={16} aria-hidden="true" />
            {t.clearAll}
          </button>
        </div>
        {paperOpen && <div id="scan-size-table"><OptionRow id="scan-paper-table" label={t.pageSizeLabel} showLabel={false} options={sizeOptions()} value={pageSize} onChange={onPageSize} dir={t.dir} /></div>}
      </div>
    </div>
  );
}
