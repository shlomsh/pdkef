import { useState } from 'preact/hooks';
import { loadDraft, deleteDraft, saveHandoff } from '../lib/draftStore.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import dialogStyles from './Dialog.module.css';
import styles from './Dropzone.module.css';

/**
 * The home page's dropzone. Unlike the one inside BasePdfTool it does not run a
 * tool - it hands the file to one, across a navigation.
 *
 * `toolTarget` is what makes that possible: the bytes are parked in a one-shot
 * handoff record (draftStore.saveHandoff) that the destination tool collects on
 * mount. This used to write straight into the tool's *draft* key instead, which
 * had two consequences, both silent: the put() replaced whatever signing work was
 * saved there, and the record it wrote had no fileBytes, so the tool's restore
 * path skipped it and the dropped file was dropped on the floor. A handoff can do
 * neither - it has its own key space, and the tool only ever reads it.
 *
 * Because a handoff still means "open a different document in that tool", it asks
 * first when there is a saved draft to lose, naming both files - the same
 * ConfirmDialog and the same bargain BasePdfTool strikes for Replace file.
 */
export default function FileDropzone({ onFiles, multiple = true, accept = "application/pdf", href, toolTarget, className = '' }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [pending, setPending] = useState(null);

  // Park the file for `toolTarget` and go there. Split out from the drop handler
  // so the confirmation can call it later, once the user has agreed.
  const handOff = async (file, { discardDraft = false } = {}) => {
    if (discardDraft) await deleteDraft(toolTarget);
    await saveHandoff(toolTarget, {
      fileName: file.name,
      fileType: file.type || 'application/pdf',
      fileBytes: await file.arrayBuffer(),
    });
    window.location.href = `/${toolTarget}`;
  };

  const handleFiles = async (files) => {
    const incoming = Array.from(files || []);
    if (incoming.length === 0) return;

    if (!toolTarget) {
      onFiles?.(incoming);
      return;
    }

    // Only a draft that could actually be restored is worth protecting; a
    // record without bytes is not something the tool would have reopened.
    const draft = await loadDraft(toolTarget);
    if (draft?.fileBytes) setPending({ file: incoming[0], draftName: draft.fileName });
    else await handOff(incoming[0]);
  };

  const onInputChange = (event) => {
    // Read the list out before resetting the input. `files` is live, so
    // `value = ''` empties it in place - and `handleFiles` is async, so the
    // reset would land first. jsdom's stubbed `files` survives the reset, which
    // is how this class of bug reaches production with a green test suite.
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    handleFiles(files);
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

      <ConfirmDialog
        open={!!pending}
        titleId="confirm-handoff-title"
        title="Open this instead?"
        confirmLabel="Open it"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const next = pending;
          setPending(null);
          if (next) handOff(next.file, { discardDraft: true });
        }}
      >
        Opening <span class={dialogStyles['confirm-file']}>{pending?.file?.name}</span> discards the
        draft you have saved here{pending?.draftName ? ' of ' : ''}
        {pending?.draftName && <span class={dialogStyles['confirm-file']}>{pending.draftName}</span>},
        along with the work in it. That can’t be undone.
      </ConfirmDialog>
    </div>
  );
}
