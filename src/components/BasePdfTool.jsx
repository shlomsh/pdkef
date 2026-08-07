import { useState, useRef, useEffect } from 'preact/hooks';
import styles from './Dropzone.module.css';
import pdfToolStyles from './PdfTool.module.css';

function hasFilePayload(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

export default function BasePdfTool({
  hasFiles,
  onFilesAdded,
  children,
  multiple = true,
  accept = "application/pdf",
  emptyStateMessage,
  fileLabel,
  fileMeta,
  draftSaved = false
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDraggingOverWorkspace, setIsDraggingOverWorkspace] = useState(false);
  const fileInputRef = useRef(null);
  const dragDepthRef = useRef(0);

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

  // Once a file is loaded, the small dropzone is gone, so the whole tool
  // area becomes the drop target instead (with an overlay while dragging).
  const onWorkspaceDragEnter = (event) => {
    if (!hasFiles || !hasFilePayload(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingOverWorkspace(true);
  };

  const onWorkspaceDragOver = (event) => {
    if (!hasFiles || !hasFilePayload(event)) return;
    event.preventDefault();
  };

  const onWorkspaceDragLeave = (event) => {
    if (!hasFiles || !hasFilePayload(event)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingOverWorkspace(false);
  };

  const onWorkspaceDrop = (event) => {
    if (!hasFiles || !hasFilePayload(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingOverWorkspace(false);
    onFilesAdded(event.dataTransfer.files);
  };

  const replaceLabel = multiple ? 'Add files' : 'Replace file';
  const replaceLabelShort = multiple ? 'Add' : 'Replace';

  return (
    <div
      class={pdfToolStyles['merge-tool']}
      onDragEnter={onWorkspaceDragEnter}
      onDragOver={onWorkspaceDragOver}
      onDragLeave={onWorkspaceDragLeave}
      onDrop={onWorkspaceDrop}
    >
      {!hasFiles && (
        <div
          class={`${styles.dropzone}${isDragOver ? ` ${styles['is-dragover']}` : ''}`}
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
            <strong>{emptyStateMessage || `Drop PDF${multiple ? 's' : ''} here`}</strong>
          </p>

          <label class={styles['file-picker-button']}>
            {`Choose file${multiple ? 's' : ''}`}
            <input
              ref={fileInputRef}
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
            Private. Files never leave your device.
          </p>
        </div>
      )}

      {hasFiles && (
        <div class={styles['file-bar']}>
          <span class={styles['file-bar-icon']} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M6 3.5h8l5 5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5A1.5 1.5 0 0 1 6.5 3.5Z"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linejoin="round"
              />
              <path d="M14 3.5V8a1 1 0 0 0 1 1h4.5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
            </svg>
          </span>

          <span class={styles['file-bar-info']}>
            <span class={styles['file-bar-name']}>
              {fileLabel || (multiple ? 'Files loaded' : 'PDF loaded')}
            </span>
            {(fileMeta || draftSaved) && (
              <span class={styles['file-bar-meta']}>
                {fileMeta && <span class={styles['file-bar-meta-text']}>{fileMeta}</span>}
                {draftSaved && (
                  <span class={styles['file-bar-saved']}>
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3 8.5l3 3 7-7.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                    Draft saved
                  </span>
                )}
              </span>
            )}
          </span>

          <label class={styles['file-bar-replace']}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M2 6l2.5-2.5M2 6l2.5 2.5M2 6h9a3 3 0 0 1 3 3v1M14 10l-2.5 2.5M14 10l-2.5-2.5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span class={styles['file-bar-replace-full']}>{replaceLabel}</span>
            <span class={styles['file-bar-replace-short']}>{replaceLabelShort}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              multiple={multiple}
              onChange={onInputChange}
              hidden
            />
          </label>
        </div>
      )}

      {hasFiles && isDraggingOverWorkspace && (
        <div class={styles['drop-overlay']} aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 3.5h7l5 5V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V3.5Z"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
            />
            <path d="M9.5 13.5h5M12.5 11l2.5 2.5-2.5 2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <p>{multiple ? 'Drop to add more files' : 'Drop to replace the current file'}</p>
        </div>
      )}

      {children}
    </div>
  );
}
