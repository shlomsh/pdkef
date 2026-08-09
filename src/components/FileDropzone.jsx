import { useState } from 'preact/hooks';
import { loadDraft, deleteDraft, saveHandoff } from '../lib/draftStore.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import dialogStyles from './Dialog.module.css';
import DropzoneEmptyState from './DropzoneEmptyState.jsx';

/**
 * The home page's dropzone. Unlike the one inside BasePdfTool it does not run a
 * tool - it hands the file to one, across a navigation. `toolTarget` is the
 * only mode: there is no local-callback fallback, since the sole caller
 * (index.astro) always sets it.
 *
 * The bytes are parked in a one-shot handoff record (draftStore.saveHandoff)
 * that the destination tool collects on mount. This used to write straight
 * into the tool's *draft* key instead, which had two consequences, both
 * silent: the put() replaced whatever signing work was saved there, and the
 * record it wrote had no fileBytes, so the tool's restore path skipped it and
 * the dropped file was dropped on the floor. A handoff can do neither - it
 * has its own key space, and the tool only ever reads it.
 *
 * Because a handoff still means "open a different document in that tool", it asks
 * first when there is a saved draft to lose, naming both files - the same
 * ConfirmDialog and the same bargain BasePdfTool strikes for Replace file.
 */
export default function FileDropzone({ multiple = true, accept = "application/pdf", href, toolTarget, className = '' }) {
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

    // Only a draft that could actually be restored is worth protecting; a
    // record without bytes is not something the tool would have reopened.
    const draft = await loadDraft(toolTarget);
    if (draft?.fileBytes) setPending({ file: incoming[0], draftName: draft.fileName });
    else await handOff(incoming[0]);
  };

  return (
    <>
      <DropzoneEmptyState
        multiple={multiple}
        accept={accept}
        href={href}
        onFiles={handleFiles}
        className={className}
      />

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
    </>
  );
}
