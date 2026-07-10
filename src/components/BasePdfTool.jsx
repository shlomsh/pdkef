import { useState, useRef, useEffect } from 'preact/hooks';
import styles from './Dropzone.module.css';
import pdfToolStyles from './PdfTool.module.css';

export default function BasePdfTool({ 
  hasFiles, 
  onFilesAdded, 
  children,
  multiple = true,
  accept = "application/pdf",
  emptyStateMessage
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && !hasFiles && fileInputRef.current) {
      const url = new URL(window.location.href);
      if (url.searchParams.get('action') === 'open') {
        url.searchParams.delete('action');
        window.history.replaceState({}, '', url.toString());
        // Attempt to auto-open the file dialog. Some browsers may block this without a direct user gesture.
        fileInputRef.current.click();
      }
    }
  }, [hasFiles]);

  const onInputChange = (event) => {
    onFilesAdded(event.currentTarget.files);
    event.currentTarget.value = '';
  };

  const onDrop = (event) => {
    event.preventDefault();
    setIsDragOver(false);
    onFilesAdded(event.dataTransfer.files);
  };

  return (
    <div class={pdfToolStyles['merge-tool']}>
      <div
        class={`${styles.dropzone}${isDragOver ? ` ${styles['is-dragover']}` : ''}${hasFiles ? ` ${styles['has-files']}` : ''}`}
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

        {!hasFiles && (
          <p class={styles['dropzone-text']}>
            <strong>{emptyStateMessage || `Drop PDF${multiple ? 's' : ''} here`}</strong>
          </p>
        )}

        <label class={styles['file-picker-button']}>
          {hasFiles ? (multiple ? 'Add more' : 'Choose a different file') : `Choose file${multiple ? 's' : ''}`}
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={onInputChange}
            hidden
          />
        </label>

        {!hasFiles && (
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

      {children}
    </div>
  );
}
