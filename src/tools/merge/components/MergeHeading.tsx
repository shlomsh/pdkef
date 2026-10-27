import HistoryButtons from '../../../shell/HistoryButtons.tsx';
import OutputName from '../../../shell/OutputName.tsx';
import { workspaceStyles } from '../../../shell/pageWorkspace/PageWorkspace.tsx';
import { pagesLabel, skippedLabel } from '../../../shell/pageWorkspace/pageCounts.ts';
import { formatMessage } from '../../../lib/formatMessage';
import docStyles from './MergeDocument.module.css';
import type { MergeMessages } from '../messages';
import type { ShellMessages } from '../../../shell/shellMessages';

interface MergeHeadingProps {
  title: string;
  outputCount: number;
  skippedCount: number;
  stillRendering: boolean;
  renderedCount: number;
  onRename: (next: string) => void;
  onRenamingChange: (renaming: boolean) => void;
  t: MergeMessages;
  sm: ShellMessages;
}

export function MergeHeading({ title, outputCount, skippedCount, stillRendering, renderedCount, onRename, onRenamingChange, t, sm }: MergeHeadingProps) {
  return (
    <h2 class={workspaceStyles['doc-heading']} id="page-grid-heading">
      {/* MERGE-11 (Shlomi's WYSIWYG rebuild, 2026-09-13): the
          visible name IS the editable output file name - one
          span, at rest identical to the old plain heading text,
          that becomes contenteditable in place on click. This
          sr-only lead-in keeps the region announcing what it is
          for anyone not reading the name itself. */}
      <span class="sr-only">{t.documentHeading}</span>
      <OutputName
        name={title}
        label={t.fileNameEditableLabel}
        onRename={onRename}
        onEditingChange={onRenamingChange}
        wrapOnPhone
      >
        <span class={workspaceStyles['doc-heading-count']}>
          {' · '}{pagesLabel(outputCount, sm)}
          {skippedCount > 0 ? ` · ${skippedLabel(skippedCount, t)}` : ''}
        </span>
        {stillRendering && (
          <span class={docStyles['doc-heading-progress']}>
            {' · '}{formatMessage(t.renderedCount, { count: renderedCount })}
          </span>
        )}
      </OutputName>
    </h2>
  );
}

interface MergeHeaderStatusProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  showPickedUp: boolean;
  showShortcuts: boolean;
  isRestoredWorkspace: boolean;
  onStartFresh: () => void;
  t: MergeMessages;
}

export function MergeHeaderStatus({
  canUndo, canRedo, onUndo, onRedo, showPickedUp, showShortcuts, isRestoredWorkspace, onStartFresh, t,
}: MergeHeaderStatusProps) {
  // Beside the history buttons, only one line lives in the header slot at a time: the
  // restore sentence (its phone placement - review P2, item 3) wins over the
  // once-only shortcuts hint.
  const shortcutsVisible = !showPickedUp && showShortcuts;
  return (
    <>
      <HistoryButtons canUndo={canUndo} canRedo={canRedo} onUndo={onUndo} onRedo={onRedo} labels={t} />
      {showPickedUp ? (
        /* Review P2, item 3: the rail's own "Picked up..." sentence
           lives in `.rail-scroll`, which is CSS-hidden on phones,
           so it never showed there. This is the phone placement -
           same sentence, its own 5-second window, then nothing
           (never the persistent "Draft saved" chip, which stays a
           desktop-rail-only affordance) - CSS-hidden at 768px and
           up so the two placements never show at once. */
        <span data-testid="header-draft-chip" class={docStyles['header-draft-chip']} role="status">
          {t.pickedUp}
          {' '}
          <button type="button" class={docStyles['start-fresh']} onClick={onStartFresh}>{t.startFresh}</button>
        </span>
      ) : shortcutsVisible ? (
        <span class={docStyles['shortcuts-hint']} role="status">{t.shortcutsLine}</span>
      ) : isRestoredWorkspace ? (
        /* QUAL-10: below 768px this slot is its own row and
           `:empty` folds it away, so the sentence timing out
           would lift the grid. Keep one silent child in the slot. */
        <span class={docStyles['header-draft-chip']} aria-hidden="true" />
      ) : null}
    </>
  );
}
