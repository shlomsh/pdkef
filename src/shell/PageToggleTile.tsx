import type { ComponentChildren } from 'preact';
import styles from './PageToggleTile.module.css';
import pdfToolStyles from './PdfTool.module.css';

export interface PageToggleTileProps {
  thumbnail: string | null;
  /** In the output (pressed) or left out (dimmed, dashed). */
  selected: boolean;
  /** The toggle's accessible name, e.g. "Page 3"; aria-pressed carries the state. */
  label: string;
  onToggle: () => void;
  onPreview: () => void;
  previewLabel: string;
  /** Places the magnifier (top/bottom/inset); the shared look is in this module. */
  previewClass?: string;
  /** Extra classes on the tile, for the tool's own states. */
  class?: string;
  /** Degrees the thumbnail is previewed rotated (0, 90, 180, 270). */
  rotation?: number;
  /** Rendered under the thumbnail; the tool styles it. It never takes pointer events. */
  caption?: ComponentChildren;
  /** A control that sits on the thumbnail (PDF to Image's download link). It must set pointer-events: auto. */
  extra?: ComponentChildren;
  /** Tiles stacked into one continuous column: no frame, no gaps. */
  flush?: boolean;
  /** The toggle does nothing (a lone page cannot be left out). */
  locked?: boolean;
  /** Controls positioned against the whole tile (Split's rotate button). They must set pointer-events: auto. */
  children?: ComponentChildren;
}

export default function PageToggleTile({
  thumbnail,
  selected,
  label,
  onToggle,
  onPreview,
  previewLabel,
  previewClass,
  class: className,
  rotation,
  caption,
  extra,
  flush,
  locked,
  children,
}: PageToggleTileProps) {
  return (
    <div
      class={`${styles.tile}${className ? ` ${className}` : ''}`}
      data-out={selected ? undefined : 'true'}
      data-flush={flush ? 'true' : undefined}
    >
      <button
        type="button"
        class={styles.toggle}
        aria-pressed={selected}
        aria-label={label}
        disabled={locked}
        onClick={onToggle}
      />
      <div class={styles.art}>
        <div class={styles.thumb} data-rotation={rotation || undefined}>
          {thumbnail ? (
            <img class={styles['thumb-img']} src={thumbnail} alt="" />
          ) : (
            <div class={`${pdfToolStyles['thumb-placeholder']} ${pdfToolStyles['thumb-placeholder-fill']}`} />
          )}
        </div>
        {extra}
        <button
          type="button"
          class={`${styles['preview-btn']}${previewClass ? ` ${previewClass}` : ''}`}
          aria-label={previewLabel}
          onClick={onPreview}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.3 10.3L14 14" />
          </svg>
        </button>
      </div>
      {caption != null && <span class={styles['caption-slot']}>{caption}</span>}
      {children}
    </div>
  );
}
