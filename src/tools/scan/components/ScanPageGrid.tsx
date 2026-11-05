import type { Ref } from 'preact';
import { ImagePlus, Maximize2, RotateCw, Trash2 } from 'lucide-preact';
import { cellActionStyles, PageCellActions, PageCellButton } from '#shell/pageGrid/PageCellActions.tsx';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { paperFit, tilePaper } from '../lib/resultView.ts';
import type { PageSize } from '../lib/scanPipeline.ts';
import { englishScanMessages as t } from '../messages.ts';
import type { PageResult, ScanPage } from '../state/scanWork.ts';
import TakePhotoButton from './TakePhotoButton.tsx';
import styles from './ScanPageGrid.module.css';

interface ScanPageGridProps {
  pages: ScanPage[];
  results: Record<number, PageResult>;
  resultKeyOf: (page: ScanPage) => string;
  failedIds: number[];
  /** The paper each page is drawn on. */
  pageSize: PageSize;
  /** The `<ul>` the reorder handler binds to. */
  listRef?: Ref<HTMLUListElement>;
  onOpen: (id: number) => void;
  onTileKeyDown?: (event: KeyboardEvent, id: number) => void;
  /** The hover cluster: turn a page, take it out. */
  onRotate: (id: number) => void;
  onRemove: (id: number) => void;
  onFiles: (files: File[]) => void;
  onCamera?: () => void;
  onPickMore: () => void;
}

/** One page on its paper: the paper keeps its own shape inside the 3:4 tile, the photo sits where the build will put it. */
function PagePaper({ page, results, pageSize, stale }: { page: ScanPage; results: Record<number, PageResult>; pageSize: PageSize; stale: boolean }) {
  const paper = tilePaper(page, results, pageSize);
  if (!paper) return null;
  const { place } = paper;
  const box = paperFit(place);
  return (
    <span class={styles.paper} data-paper style={{ width: `${box.widthPct}%`, height: `${box.heightPct}%` }}>
      <img
        class={styles.photo}
        src={paper.src}
        alt=""
        draggable={false}
        data-paper-image
        data-stale={stale || undefined}
        style={{
          left: `${(place.x / place.pageWidth) * 100}%`,
          bottom: `${(place.y / place.pageHeight) * 100}%`,
          width: `${(place.width / place.pageWidth) * 100}%`,
          height: `${(place.height / place.pageHeight) * 100}%`,
        }}
      />
    </span>
  );
}

/** The pages as a numbered grid of reorderable tiles ending in Add pages. Shared by the phone's table and the desktop's. */
export default function ScanPageGrid({ pages, results, resultKeyOf, failedIds, pageSize, listRef, onOpen, onTileKeyDown, onRotate, onRemove, onFiles, onCamera, onPickMore }: ScanPageGridProps) {
  return (
    <>
    <p class="sr-only" id="scan-grid-reorder-hint">{t.reorderHint}</p>
    <ul class={styles.grid} ref={listRef} aria-label={t.pagesLabel} aria-describedby="scan-grid-reorder-hint">
      {pages.map((page, index) => {
        const result = results[page.id];
        return (
          <li key={page.id} class={`${styles.cell} ${cellActionStyles.host}`} data-id={page.id}>
            <div
              class={styles.tile}
              data-page
              data-table-page
              tabIndex={0}
              role="button"
              aria-label={`${formatMessage(t.tileLabel, { position: index + 1, total: pages.length })}${page.question ? `. ${t.splitAsk}` : ''}`}
              onClick={() => onOpen(page.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(page.id); return; }
                onTileKeyDown?.(e, page.id);
              }}
            >
              {result
                ? <PagePaper page={page} results={results} pageSize={pageSize} stale={result.key !== resultKeyOf(page)} />
                : <span class={styles.pending}>{failedIds.includes(page.id) ? t.pageFailed : t.processing}</span>}
              {page.question && <span class={styles['split-ask']} data-split-ask>{t.splitAsk}</span>}
              <span class={styles.badge} data-badge aria-hidden="true">{index + 1}</span>
            </div>
            {/* After the tile, never inside it: the tile is a button and clips what overflows. */}
            <PageCellActions>
              <PageCellButton label={formatMessage(t.rotatePageLabel, { position: index + 1 })} tip={t.tipRotate} onClick={() => onRotate(page.id)}>
                <RotateCw size={16} />
              </PageCellButton>
              <PageCellButton label={formatMessage(t.removePageLabel, { position: index + 1 })} tip={t.tipRemove} onClick={() => onRemove(page.id)}>
                <Trash2 size={16} />
              </PageCellButton>
              <PageCellButton label={formatMessage(t.openPageLabel, { position: index + 1 })} tip={t.tipOpen} onClick={() => onOpen(page.id)}>
                <Maximize2 size={16} />
              </PageCellButton>
            </PageCellActions>
          </li>
        );
      })}
      <li class={styles.cell}>
        <div class={styles.add} data-add-pages>
          {/* A phone opens the camera, a mouse the picker (the pointer media queries in the sheets). */}
          <TakePhotoButton onFiles={onFiles} onCamera={onCamera} label={t.addPages} buttonClass={styles['add-button']} />
          <button type="button" class={`${styles['add-button']} ${styles['add-pick']}`} data-add-pick onClick={onPickMore}>
            <ImagePlus size={20} aria-hidden="true" />
            {t.addPages}
          </button>
        </div>
      </li>
    </ul>
    </>
  );
}
