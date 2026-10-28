import type { Ref } from 'preact';
import { ImagePlus } from 'lucide-preact';
import { formatMessage } from '../../../lib/text/formatMessage';
import { englishScanMessages as t } from '../messages.ts';
import type { PageResult, ScanPage } from '../state/scanWork.ts';
import styles from '../PdfScanTool.module.css';
import TakePhotoButton from './TakePhotoButton.tsx';

interface ScanPageStripProps {
  pages: ScanPage[];
  results: Record<number, PageResult>;
  selectedId: number;
  failedIds: number[];
  listRef: Ref<HTMLUListElement>;
  /** The key a page's result must carry to be current (the island's resultKey). */
  resultKeyOf: (page: ScanPage) => string;
  onSelect: (id: number) => void;
  onTileKeyDown: (event: KeyboardEvent, id: number) => void;
  onRemove: (id: number) => void;
  onFiles: (files: File[]) => void;
  onPickMore: () => void;
}

/** The pages column: the strip of tiles, then the add tiles outside the list so a long scan scrolls its pages alone. */
export default function ScanPageStrip({ pages, results, selectedId, failedIds, listRef, resultKeyOf, onSelect, onTileKeyDown, onRemove, onFiles, onPickMore }: ScanPageStripProps) {
  return (
    <div class={styles.pages}>
      <p class="sr-only" id="scan-reorder-hint">{t.reorderHint}</p>
      <ul class={styles.strip} ref={listRef} aria-label={t.pagesLabel} aria-describedby="scan-reorder-hint">
        {pages.map((page, index) => {
          const result = results[page.id];
          const current = result?.key === resultKeyOf(page);
          return (
            <li key={page.id} class={styles.tile} data-id={page.id} data-selected={page.id === selectedId || undefined}>
              <div
                class={styles.page}
                data-page
                tabIndex={0}
                role="button"
                aria-pressed={page.id === selectedId}
                aria-label={formatMessage(t.tileLabel, { position: index + 1, total: pages.length })}
                onClick={() => onSelect(page.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(page.id); return; }
                  onTileKeyDown(e, page.id);
                }}
              >
                {result ? <img src={result.thumbUrl} alt="" draggable={false} data-stale={!current || undefined} /> : <span class={styles.pending}>{failedIds.includes(page.id) ? t.pageFailed : t.processing}</span>}
                <span class={styles.badge} aria-hidden="true">{index + 1}</span>
              </div>
              <button type="button" class={styles.remove} aria-label={formatMessage(t.removeLabel, { position: index + 1 })} onClick={() => onRemove(page.id)}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
      {/* Outside the list, so a long scan scrolls its pages and these stay at the end, in view. */}
      <div class={styles['add-tile']}>
        <TakePhotoButton onFiles={onFiles} />
        <button type="button" class={styles['add-button']} onClick={onPickMore}>
          <ImagePlus size={20} aria-hidden="true" />
          {t.addPhotos}
        </button>
      </div>
    </div>
  );
}
