import { useState } from 'preact/hooks';
import type { Ref } from 'preact';
import styles from './Dropzone.module.css';
import { englishShellMessages, type ShellMessages } from '../i18n/toolMessages';

interface DropzoneEmptyStateProps {
  multiple?: boolean;
  accept?: string;
  message?: string;
  inputRef?: Ref<HTMLInputElement>;
  onFiles: (files: File[] | FileList) => void;
  compact?: boolean;
  messages?: ShellMessages;
}

/** Empty-state file picker shared by the PDF tool pages. */
export default function DropzoneEmptyState({
  multiple = true,
  accept = 'application/pdf',
  message,
  inputRef,
  onFiles,
  compact = false,
  messages = englishShellMessages,
}: DropzoneEmptyStateProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const onInputChange = (event: Event) => {
    // Read the list out before resetting the input - `value = ''` empties a
    // live FileList in place in a real browser, so the order here matters
    // (see CLAUDE.md's FileList note).
    const target = event.currentTarget as HTMLInputElement;
    const files = Array.from(target.files || []);
    target.value = '';
    onFiles(files);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    if (event.dataTransfer) onFiles(event.dataTransfer.files);
  };

  return (
    <div
      class={`${styles.dropzone}${isDragOver ? ` ${styles['is-dragover']}` : ''}`}
      // Marks this as the real "add a file" invitation, as opposed to
      // BasePdfTool's own checking-draft placeholder (which also uses
      // .dropzone for the box styling but must never be hidden by it) - see
      // the `html[data-draft-hint]` rule in Dropzone.module.css.
      data-empty-state
      data-compact={compact || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={onDrop}
    >
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

      <p class={styles['dropzone-text']}>
        <strong>{message || (multiple ? messages.dropHereMany : messages.dropHereOne)}</strong>
      </p>

      <label class={styles['file-picker-button']}>
        {multiple ? messages.chooseFilesMany : messages.chooseFileOne}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={onInputChange}
          hidden
        />
      </label>

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
        {messages.privacyLine}
      </p>
    </div>
  );
}
