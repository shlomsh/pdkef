import type { RefObject } from 'preact';
import { LockKeyhole, File as FileIcon, FilePlus, Trash2 } from 'lucide-preact';
import { formatMessage } from '../../../lib/formatMessage';
import FileName from '../../../shell/FileName.tsx';
import SortMenu from '../../../shell/SortMenu.tsx';
import DraftRetentionHint from '../../../shell/DraftRetentionHint';
import { workspaceStyles } from '../../../shell/pageWorkspace/PageWorkspace.tsx';
import railStyles from './MergeRail.module.css';
import { tagStyle } from './tagStyle.ts';
import type { SortOption } from './MergePhoneControls.tsx';
import type { FileEntry, SortMode } from '../mergeModel.ts';
import type { MergeMessages } from '../messages';
import type { ShellMessages } from '../../../shell/shellMessages';

interface MergeRailContentProps {
  entries: FileEntry[];
  listRef: RefObject<HTMLUListElement>;
  canReorderFiles: boolean;
  rearranged: boolean;
  showSortControls: boolean;
  sortMode: SortMode;
  sortOptions: SortOption[];
  /** The label of the draft chip ("Draft saved"...), or null for none. */
  draftStatusLabel: string | null;
  showDraftRetentionHint: boolean;
  showPickedUpSentence: boolean;
  isRestoredWorkspace: boolean;
  onRemove: (id: number) => void;
  onRowKeyDown: (event: KeyboardEvent, id: number) => void;
  onRowClick: (id: number) => void;
  onSortChange: (value: string) => void;
  onResetOrder: () => void;
  onAdd: () => void;
  onClear: () => void;
  t: MergeMessages;
  sm: ShellMessages;
}

export default function MergeRailContent({
  entries, listRef, canReorderFiles, rearranged, showSortControls, sortMode, sortOptions, draftStatusLabel, showDraftRetentionHint,
  showPickedUpSentence, isRestoredWorkspace, onRemove, onRowKeyDown, onRowClick, onSortChange, onResetOrder, onAdd, onClear, t, sm,
}: MergeRailContentProps) {
  return (
    <>
      <ul class={railStyles['file-list']} ref={listRef} aria-describedby="reorder-hint">
        {entries.map((entry, index) => (
          <li
            key={entry.id}
            class={railStyles['file-row']}
            data-id={entry.id}
            data-file-id={entry.id}
            data-link-row
            data-error={entry.error === 'unreadable' ? 'unreadable' : undefined}
            data-locked={entry.error === 'encrypted' ? '' : undefined}
            onClick={() => onRowClick(entry.id)}
          >
            {/* A whole-file move is also the quickest way back from
                an interleaved page plan: it regroups that file's
                pages in the newly selected file order. */}
            {canReorderFiles && (
              <span
                class={railStyles.grip}
                tabIndex={0}
                role="button"
                aria-label={formatMessage(t.dragHandleLabel, { name: entry.file.name, position: index + 1, total: entries.length })}
                onKeyDown={(e) => { e.stopPropagation(); onRowKeyDown(e, entry.id); }}
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="5" cy="3" r="1.4" fill="currentColor" />
                  <circle cx="11" cy="3" r="1.4" fill="currentColor" />
                  <circle cx="5" cy="8" r="1.4" fill="currentColor" />
                  <circle cx="11" cy="8" r="1.4" fill="currentColor" />
                  <circle cx="5" cy="13" r="1.4" fill="currentColor" />
                  <circle cx="11" cy="13" r="1.4" fill="currentColor" />
                </svg>
              </span>
            )}
            <span class={railStyles['tag-square']} style={tagStyle(index)} aria-hidden="true" />
            <FileName name={entry.file.name} className={railStyles['file-name']} />
            {entry.error === 'encrypted' ? (
              <span class={railStyles['file-pages']} title={t.protectedOwnerOnlyTitle}>
                <LockKeyhole size={12} aria-hidden="true" />
                <span class="sr-only">{t.protectedOwnerOnlyTitle}</span>
              </span>
            ) : (
              <span class={railStyles['file-pages']}>
                <FileIcon size={12} aria-hidden="true" />
                {entry.pageCount ?? '…'}
              </span>
            )}
            <button
              type="button"
              class={railStyles['file-remove']}
              aria-label={formatMessage(t.removeLabel, { name: entry.file.name })}
              onClick={(e) => { e.stopPropagation(); onRemove(entry.id); }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      {rearranged ? (
        <div class={railStyles['rearranged-note']} role="status">
          <span>{t.pagesRearranged}</span>
          <button type="button" class={railStyles['reset-order']} onClick={onResetOrder}>
            {t.resetOrder}
          </button>
        </div>
      ) : showSortControls && (
        <div class={railStyles['list-controls']}>
          <SortMenu label={t.sortFilesLabel} ariaLabel={t.sortLabel} value={sortMode} options={sortOptions} onChange={onSortChange} />
        </div>
      )}

      {/* Shlomi (2026-09-13): "Draft saved" (or the restore
          sentence) on its own line, end-aligned, so its width never
          moves Add files / Clear all below it and the Hebrew
          edition mirrors it for free (text-align: end is a logical
          property). */}
      {/* QUAL-10: a restored workspace keeps this row after the
          sentence's five seconds are up (blank, then "Draft saved"
          on the first real edit), so its going never pulls the rows
          below it up. A fresh pick has no row until its first save. */}
      {(showPickedUpSentence || draftStatusLabel || isRestoredWorkspace) && (
        <div class={railStyles['draft-status-row']}>
          {showPickedUpSentence ? (
            <>
              {t.pickedUp} <button type="button" class={workspaceStyles['quiet-button']} onClick={onClear}>{t.startFresh}</button>
            </>
          ) : draftStatusLabel ? (
            <>
              <span>{draftStatusLabel}</span>
              {showDraftRetentionHint && <DraftRetentionHint label={sm.draftRetentionInfo} />}
            </>
          ) : ' '}
        </div>
      )}

      <div class={workspaceStyles['quiet-row']}>
        {/* Shlomi (2026-09-13): the two actions are bordered
            buttons now, so the "·" that used to separate them as
            text links is gone; the row's gap does the separating. */}
        <button type="button" class={workspaceStyles['quiet-button']} onClick={onAdd}><FilePlus size={16} aria-hidden="true" />{sm.addLabel}</button>
        <button type="button" class={workspaceStyles['quiet-button']} onClick={onClear}><Trash2 size={16} aria-hidden="true" />{sm.clearLabel}</button>
      </div>
    </>
  );
}
