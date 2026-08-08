import { useState, useRef, useEffect, useCallback } from 'preact/hooks';
import styles from './Dropzone.module.css';
import pdfToolStyles from './PdfTool.module.css';
import dialogStyles from './Dialog.module.css';
import ConfirmDialog from './ConfirmDialog.jsx';
import ToolShell, { FileActions, ToolShellContext } from './ToolShell.jsx';

function hasFilePayload(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}

/**
 * The shell every tool is built on: the empty-state dropzone, the loaded-state
 * identity + control row, the file input behind both, and the confirmation any
 * destructive file action goes through.
 *
 * It owns all of that on purpose. Nine tools each deciding for themselves what
 * "start over" meant is what produced two class names, two labels and two
 * behaviours for one action, plus three hand-copied confirmation dialogs and
 * three tools out of nine that quietly threw the user's work away. What differs
 * between tools is declared here as configuration - one file or many, what work
 * a replacement would cost - not re-implemented per tool.
 */
export default function BasePdfTool({
  hasFiles,
  onFilesAdded,
  children,
  multiple = true,
  accept = 'application/pdf',
  emptyStateMessage,
  fileLabel,
  fileMeta,
  draftSaved = false,
  /* Is there anything a replacement would destroy? False skips the
     confirmation entirely: nothing has been done to this file yet, so asking
     would be noise. */
  hasWork = false,
  /* What the confirmation calls the thing being discarded, in the tool's own
     words: it reads "...and discards your redaction boxes." */
  workNoun = 'the work you have done here',
  /* List tools only. Its presence is what puts a Clear all beside Add files:
     for a list those are two genuinely different intents, not the drift this
     shell exists to remove. */
  onClearAll,
  clearSummary,
  /* Sign and Redact mount <ToolShell> themselves, inside the element that goes
     full screen - a toolbar rendered out here would disappear the moment full
     screen started. They still take every other decision from this component
     through the context below. */
  ownsShell = false,
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDraggingOverWorkspace, setIsDraggingOverWorkspace] = useState(false);
  const [pendingFiles, setPendingFiles] = useState(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
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

  // The one gate every incoming file goes through, whether it arrived from the
  // picker or from a drop. Adding to a list costs nothing and an untouched tool
  // has nothing to lose; anything else asks first, naming both files.
  const receiveFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;
    if (multiple || !hasFiles || !hasWork) {
      onFilesAdded(incoming);
      return;
    }
    setPendingFiles(incoming);
  }, [multiple, hasFiles, hasWork, onFilesAdded]);

  const onInputChange = (event) => {
    // Copy the FileList out before clearing the input. `value = ''` resets the
    // selection, and `files` is a live list, so it empties underneath you - in
    // a real browser only. jsdom's stubbed `files` survives it, so this reads
    // as working in unit tests and does nothing at all in the built app.
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    receiveFiles(files);
  };

  const onDrop = (event) => {
    event.preventDefault();
    setIsDragOver(false);
    receiveFiles(event.dataTransfer.files);
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
    receiveFiles(event.dataTransfer.files);
  };

  const requestReplace = useCallback(() => fileInputRef.current?.click(), []);
  const requestClear = useCallback(() => setConfirmClearOpen(true), []);
  const cancelReplace = useCallback(() => setPendingFiles(null), []);
  const cancelClear = useCallback(() => setConfirmClearOpen(false), []);

  const confirmReplace = () => {
    const files = pendingFiles;
    setPendingFiles(null);
    if (files) onFilesAdded(files);
  };

  const confirmClear = () => {
    setConfirmClearOpen(false);
    onClearAll?.();
  };

  const shell = { fileLabel, fileMeta, draftSaved, multiple, requestReplace, requestClear };

  return (
    <ToolShellContext.Provider value={shell}>
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
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={onInputChange}
          hidden
        />
      )}

      {hasFiles && !ownsShell && (
        <ToolShell>
          <FileActions />
        </ToolShell>
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

      {/* Replacing a file is the one destructive thing a single-file tool can
          do, so it says which file is going and what goes with it. It never
          appears when there is nothing to lose - see `hasWork`. */}
      <ConfirmDialog
        open={!!pendingFiles}
        titleId="confirm-replace-title"
        title="Replace this file?"
        confirmLabel="Replace file"
        onCancel={cancelReplace}
        onConfirm={confirmReplace}
      >
        Opening <span class={dialogStyles['confirm-file']}>{pendingFiles?.[0]?.name}</span> closes{' '}
        <span class={dialogStyles['confirm-file']}>{fileLabel || 'the current PDF'}</span> and discards {workNoun}.
        That can’t be undone.{draftSaved ? ' Your saved draft goes with it.' : ''}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmClearOpen}
        titleId="confirm-clear-title"
        title="Clear all files?"
        confirmLabel="Clear all"
        onCancel={cancelClear}
        onConfirm={confirmClear}
      >
        This empties the list{clearSummary ? ` of ${clearSummary}` : ''} and the order you put it in.
        Nothing is removed from your device.
      </ConfirmDialog>
    </div>
    </ToolShellContext.Provider>
  );
}
