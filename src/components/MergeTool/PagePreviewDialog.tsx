import { useEffect, useRef, useState } from 'preact/hooks';
import dialogStyles from '../Dialog.module.css';
import styles from './PageStrip.module.css';
import { renderPdfThumbnails } from '../../lib/thumbnails.js';
import { formatMessage, type MergeMessages } from '../../i18n/toolMessages';

export interface PreviewTarget {
  file: File;
  pageIndex: number;
  rotation: number;
  /** 1-based position in the OUTPUT (skipped pages excluded, same counter
   * the document heading and each cell's aria-label use), and the output
   * page count, for the title - never the raw plan index/length, which
   * disagreed with the heading whenever a page was skipped (review P2). */
  position: number;
  total: number;
  /** Shows the "skipped" word beside the title; a skipped page's `position`
   * is the number it would take if brought back. */
  skipped: boolean;
  /** Previous/Next disable at the ends of the raw plan, not at `position`,
   * since a skipped page's would-be position can equal or pass `total`
   * without it being the last page to step through. */
  atStart: boolean;
  atEnd: boolean;
}

interface PagePreviewDialogProps {
  target: PreviewTarget | null;
  onClose: () => void;
  onStep: (delta: 1 | -1) => void;
  messages: MergeMessages;
}

/* MERGE-08: tap a page in the strip to see it large. `showModal()` puts the
   dialog in the top layer (project_fullscreen_dialog_top_layer: a plain
   `<dialog open>` is invisible under real fullscreen). Loaded through a
   dynamic import() from the strip, so the eager graph does not carry it. */
export const PREVIEW_WIDTH = 900;

export default function PagePreviewDialog({ target, onClose, onStep, messages: t }: PagePreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  // Shlomi (2026-09-13): stepping used to blank the image, so the body fell
  // to its minimum height and grew back when the next page arrived - a
  // visible resize on every step. The last page now stays up (dimmed, via
  // `stale`) until its replacement has rendered, and the stage itself has a
  // fixed height (PageStrip.module.css `.preview-stage`), so nothing moves.
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (target && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.open = true;
    } else if (!target && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.open = false;
    }
  }, [!!target]);

  useEffect(() => {
    if (!target) {
      setDataUrl(null);
      setStale(false);
      return undefined;
    }
    setStale(true);
    const controller = new AbortController();
    const width = Math.min(PREVIEW_WIDTH, Math.round((typeof window !== 'undefined' ? window.innerWidth : PREVIEW_WIDTH) * 1.5));
    renderPdfThumbnails(
      target.file,
      (_pageNumber: number, url: string) => {
        if (controller.signal.aborted) return;
        setDataUrl(url);
        setStale(false);
      },
      { pageIndices: [target.pageIndex], width, type: 'image/jpeg', quality: 0.85, signal: controller.signal },
    ).catch(() => {});
    return () => controller.abort();
  }, [target?.file, target?.pageIndex]);

  useEffect(() => {
    if (!target) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') onStep(1);
      else if (event.key === 'ArrowLeft') onStep(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, onStep]);

  return (
    <dialog
      ref={dialogRef}
      class={`${dialogStyles.dialog} ${styles['preview-dialog']}`}
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      aria-labelledby="merge-preview-title"
    >
      <div class={dialogStyles.header}>
        <h3 id="merge-preview-title">
          {target
            ? formatMessage(t.previewTitle, { number: target.position, total: target.total })
              + (target.skipped ? ` · ${t.skippedBadge.toLowerCase()}` : '')
            : ''}
        </h3>
        <button type="button" class={dialogStyles.close} onClick={onClose} aria-label={t.previewClose}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      {/* Shlomi (2026-09-13): a gallery, not a form. Previous and Next are
          chevrons on the stage's two sides, and the stage itself is split
          into thirds: the left third steps back, the right third steps
          forward, the middle third is inert. Visual left is always
          "previous" (the way ArrowLeft already behaves), in Hebrew too. The
          zones are pointer-only affordances; keyboard users have the arrow
          keys and the two labelled buttons. */}
      <div class={styles['preview-stage']} data-rotation={target?.rotation || undefined} data-stale={stale || undefined}>
        {dataUrl ? (
          <img class={styles['preview-image']} src={dataUrl} alt="" />
        ) : (
          <p class={styles['preview-loading']}>{t.previewLoading}</p>
        )}
        <div
          class={`${styles['preview-zone']} ${styles['preview-zone-prev']}`}
          aria-hidden="true"
          onClick={() => { if (target && !target.atStart) onStep(-1); }}
        />
        <div
          class={`${styles['preview-zone']} ${styles['preview-zone-next']}`}
          aria-hidden="true"
          onClick={() => { if (target && !target.atEnd) onStep(1); }}
        />
        <button
          type="button"
          class={`${styles['preview-chevron']} ${styles['preview-chevron-prev']}`}
          onClick={() => onStep(-1)}
          disabled={!target || target.atStart}
          aria-label={t.previewPrev}
          title={t.previewPrev}
        >
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
        <button
          type="button"
          class={`${styles['preview-chevron']} ${styles['preview-chevron-next']}`}
          onClick={() => onStep(1)}
          disabled={!target || target.atEnd}
          aria-label={t.previewNext}
          title={t.previewNext}
        >
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
      </div>
    </dialog>
  );
}
