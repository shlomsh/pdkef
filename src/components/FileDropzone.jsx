import { useState } from 'preact/hooks';
import { saveDraft } from '../lib/draftStore.js';
import styles from './Dropzone.module.css';

export default function FileDropzone({ onFiles, multiple = true, accept = "application/pdf", href, toolTarget, className = '' }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = async (files) => {
    if (toolTarget) {
      await saveDraft(toolTarget, { files: Array.from(files) });
      window.location.href = `/${toolTarget}`;
    } else if (onFiles) {
      onFiles(files);
    }
  };

  const onInputChange = (event) => {
    handleFiles(event.currentTarget.files);
    event.currentTarget.value = '';
  };

  const onDrop = (event) => {
    event.preventDefault();
    setIsDragOver(false);
    handleFiles(event.dataTransfer.files);
  };

  return (
    <div
      class={`${styles.dropzone} ${className}${isDragOver ? ` ${styles['is-dragover']}` : ''}`}
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
        <strong>Drop PDF{multiple ? 's' : ''} here</strong>
      </p>

      {href ? (
        <a class={styles['file-picker-button']} href={href}>
          Choose file{multiple ? 's' : ''}
        </a>
      ) : (
        <label class={styles['file-picker-button']}>
          Choose file{multiple ? 's' : ''}
          <input
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={onInputChange}
            hidden
          />
        </label>
      )}

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
    </div>
  );
}
