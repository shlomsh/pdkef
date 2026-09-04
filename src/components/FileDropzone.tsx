import { useState } from 'preact/hooks';
import { loadDraft, deleteDraft, saveHandoff, readDraftMeta } from '../editor/workspace/draftStore.js';
import ConfirmDialog from './ConfirmDialog.tsx';
import dialogStyles from './Dialog.module.css';
import DropzoneEmptyState from './DropzoneEmptyState.tsx';
import ResumeDraftCard from './ResumeDraftCard.tsx';
import homepageStyles from './FileDropzone.module.css';

// Every tool that persists a draft. Not sourced from tools.js - most tools
// there have no draft feature at all, and this list has to stay in the exact
// order the resume card should check/display them in.
const DRAFT_TOOLS = ['sign', 'redact'];

// Synchronous, so the client-only launcher starts with the complete local
// state rather than fetching it after its first render.
function readAllDraftMeta(): any[] {
  return DRAFT_TOOLS.map((tool) => {
    const meta: any = readDraftMeta(tool);
    return meta && { tool, ...meta };
  })
    .filter(Boolean)
    .sort((a: any, b: any) => (b.savedAt || 0) - (a.savedAt || 0));
}

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
export default function FileDropzone({ multiple = true, accept = "application/pdf", href, toolTarget, className = '' }: {
  multiple?: boolean;
  accept?: string;
  href?: string;
  toolTarget: string;
  className?: string;
}) {
  const [pending, setPending] = useState<{ file: File; draftName?: string } | null>(null);
  // Lazy initializer, not an effect: the launcher renders its complete local
  // state in one client pass, with no asynchronous metadata fetch.
  const [drafts] = useState(readAllDraftMeta);

  // Park the file for `toolTarget` and go there. Split out from the drop handler
  // so the confirmation can call it later, once the user has agreed.
  const handOff = async (file: File, { discardDraft = false }: { discardDraft?: boolean } = {}) => {
    if (discardDraft) await deleteDraft(toolTarget);
    await saveHandoff(toolTarget, {
      fileName: file.name,
      fileType: file.type || 'application/pdf',
      fileBytes: await file.arrayBuffer(),
    });
    window.location.href = `/${toolTarget}`;
  };

  const handleFiles = async (files: FileList | File[]) => {
    const incoming = Array.from(files || []);
    if (incoming.length === 0) return;

    // Only a draft that could actually be restored is worth protecting; a
    // record without bytes is not something the tool would have reopened.
    const draft: any = await loadDraft(toolTarget);
    if (draft?.fileBytes) setPending({ file: incoming[0], draftName: draft.fileName });
    else await handOff(incoming[0]);
  };

  return (
    <>
      <ResumeDraftCard drafts={drafts} />

      <DropzoneEmptyState
        multiple={multiple}
        accept={accept}
        href={href}
        onFiles={handleFiles}
        className={`${className} ${drafts.length > 0 ? homepageStyles.compact : ''}`}
        // The card above already made the primary pitch to a returning
        // visitor; this keeps the dropzone from repeating "Drop PDFs here" as
        // if nothing had just answered that question for them.
        message={drafts.length > 0 ? 'Or start something new' : undefined}
        // Same reasoning, sized: a resume card is real height the desktop
        // layout's one-viewport budget never accounted for (see
        // FileDropzone.module.css's header comment) - shrink the now-
        // secondary CTA to make room rather than let the tool grid below it
        // get pushed past the fold. `compact` only controls JSX (hiding the
        // icon/privacy line); the row-layout CSS comes from the class above.
        compact={drafts.length > 0}
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
