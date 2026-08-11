import { useState } from 'preact/hooks';
import styles from './Dropzone.module.css';

/**
 * The empty-state dropzone: icon, heading, choose-file control and privacy
 * line. BasePdfTool (every tool's own empty state) and FileDropzone (the home
 * page's) rendered this exact markup independently until they drifted - this
 * is the one copy both build on now.
 *
 * `href` picks the choose-file control's shape: a navigating link when set
 * (the home page defers to the destination tool's own picker), otherwise a
 * label wrapping a hidden file input. `inputRef` only matters in the input
 * case - BasePdfTool uses it to auto-open the OS picker on `?action=open`.
 */
export default function DropzoneEmptyState({
  multiple = true,
  accept = 'application/pdf',
  message,
  href,
  inputRef,
  onFiles,
  className = '',
  // Drops the icon and privacy line, keeping only the message + button as a
  // single row. Only FileDropzone uses this, and only once a resume-draft
  // card is already showing above it: the icon and "files never leave your
  // device" messaging have already made their case once on the page (the
  // card itself, the header's own privacy badge), and this box is now the
  // secondary "start something new" path rather than the primary pitch, so
  // it shouldn't cost as much of the desktop viewport's fixed height budget
  // as the empty-state pitch does. See the min-width:1024px rule this keys
  // off of in Dropzone.module.css - the desktop layout is deliberately
  // sized to fit hero + card + dropzone + the tool grid without scrolling,
  // and a resume card is real height nothing budgeted for before it shipped.
  compact = false,
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const onInputChange = (event) => {
    // Read the list out before resetting the input - `value = ''` empties a
    // live FileList in place in a real browser, so the order here matters
    // (see CLAUDE.md's FileList note).
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    onFiles(files);
  };

  const onDrop = (event) => {
    event.preventDefault();
    setIsDragOver(false);
    onFiles(event.dataTransfer.files);
  };

  return (
    <div
      // The compact row layout itself is styled entirely via `className`
      // (FileDropzone.module.css), not a class defined here - Dropzone.module.css
      // is also imported by BasePdfTool.jsx, which Astro server-renders on
      // every tool page, so any CSS added to it is inlined into all of them
      // regardless of whether a given page ever sets `compact`. That page-CSS
      // budget was already at 79755/80000 bytes before this feature; adding
      // dead weight there tipped it over. FileDropzone.jsx's own module is
      // only ever imported by a client:only component, so Astro never inlines
      // it into any page's HTML at all.
      class={`${styles.dropzone} ${className}${isDragOver ? ` ${styles['is-dragover']}` : ''}`}
      // Marks this as the real "add a file" invitation, as opposed to
      // BasePdfTool's own checking-draft placeholder (which also uses
      // .dropzone for the box styling but must never be hidden by it) - see
      // the `html[data-draft-hint]` rule in Dropzone.module.css.
      data-empty-state
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={onDrop}
    >
      {!compact && (
        <svg
          class={styles['dropzone-icon']}
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          aria-hidden="true"
        >
          <rect x="9" y="4" width="24" height="32" rx="3" class={styles['dz-page']} />
          <path d="M27 4v8h8" class={styles['dz-fold']} />
          <rect x="16" y="26" width="22" height="16" rx="3" class={`${styles['dz-page']} ${styles['dz-page-front']}`} />
          <path d="M23 30v8M27 34h-8" class={styles['dz-plus']} />
        </svg>
      )}

      <p class={styles['dropzone-text']}>
        <strong>{message || `Drop PDF${multiple ? 's' : ''} here`}</strong>
      </p>

      {href ? (
        <a class={styles['file-picker-button']} href={href}>
          Choose file{multiple ? 's' : ''}
        </a>
      ) : (
        <label class={styles['file-picker-button']}>
          Choose file{multiple ? 's' : ''}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={onInputChange}
            hidden
          />
        </label>
      )}

      {!compact && (
        <p class={styles['privacy-line']}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linejoin="round"
            />
            <path
              d="M9 12.5l2 2 4-4.5"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Private. Files never leave your device.
        </p>
      )}
    </div>
  );
}
