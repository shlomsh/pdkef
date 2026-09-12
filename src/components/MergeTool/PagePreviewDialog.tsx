import { useEffect, useRef, useState } from 'preact/hooks';
import dialogStyles from '../Dialog.module.css';
import styles from './PageStrip.module.css';
import { renderPdfThumbnails } from '../../lib/thumbnails.js';
import { formatMessage, type MergeMessages } from '../../i18n/toolMessages';

export interface PreviewTarget {
  file: File;
  pageIndex: number;
  rotation: number;
  /** 1-based position in the output, and the output page count, for the title. */
  position: number;
  total: number;
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
    setDataUrl(null);
    if (!target) return undefined;
    const controller = new AbortController();
    const width = Math.min(PREVIEW_WIDTH, Math.round((typeof window !== 'undefined' ? window.innerWidth : PREVIEW_WIDTH) * 1.5));
    renderPdfThumbnails(
      target.file,
      (_pageNumber: number, url: string) => { if (!controller.signal.aborted) setDataUrl(url); },
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
          {target ? formatMessage(t.previewTitle, { number: target.position, total: target.total }) : ''}
        </h3>
        <button type="button" class={dialogStyles.close} onClick={onClose} aria-label={t.previewClose}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div class={styles['preview-body']} data-rotation={target?.rotation || undefined}>
        {dataUrl ? (
          <img class={styles['preview-image']} src={dataUrl} alt="" />
        ) : (
          <p class={styles['preview-loading']}>{t.previewLoading}</p>
        )}
      </div>
      <div class={dialogStyles.footer}>
        <button type="button" class={`${dialogStyles.button} ${dialogStyles.secondary}`} onClick={() => onStep(-1)} disabled={!target || target.position <= 1}>
          {t.previewPrev}
        </button>
        <button type="button" class={`${dialogStyles.button} ${dialogStyles.secondary}`} onClick={() => onStep(1)} disabled={!target || target.position >= target.total}>
          {t.previewNext}
        </button>
      </div>
    </dialog>
  );
}
