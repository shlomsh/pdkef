import { useEffect, useRef, useState } from 'preact/hooks';
import { expandDetailEdits } from '../../../editor/adapters/pdf/documentTraces.js';
import type { DetailEdit, DetailEdits } from '../../../editor/adapters/pdf/documentTraces.js';
import type { DetailRow } from './describeDetails.ts';
import {
  DETAILS_CLOSE, DETAILS_THUMBS, DETAILS_TITLE, DETAIL_DELETE, DETAIL_DONE, DETAIL_EDIT, DETAIL_IMPLIED, DETAIL_UNDO,
} from '../check/checkCopy.ts';
import styles from './Details.module.css';

interface Props {
  open: boolean;
  rows: DetailRow[];
  edits: DetailEdits;
  onEdit: (id: string, edit: DetailEdit) => void;
  onRestore: (id: string) => void;
  onClose: () => void;
}

type RowState = 'kept' | 'deleted' | 'altered' | 'implied' | 'editing';

/**
 * RED-59: every detail the file carries, each one the person's to keep, alter
 * or delete. A `<dialog>` opened with showModal() like ConfirmDialog (top
 * layer, so it shows in real full screen); Escape is captured so it closes
 * the sheet, or cancels an edit in progress, and nothing else.
 */
export function DetailsSheet({ open, rows, edits, onEdit, onRestore, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const implied = expandDetailEdits(edits);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.open = true;
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.open = false;
    }
    if (!open) setEditingId(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (editingId !== null) setEditingId(null);
      else onClose();
    };
    window.addEventListener('keydown', onEsc, { capture: true });
    return () => window.removeEventListener('keydown', onEsc, { capture: true });
  }, [open, editingId, onClose]);

  useEffect(() => {
    if (editingId !== null) inputRef.current?.focus();
  }, [editingId]);

  const currentText = (row: DetailRow) => {
    const edit = edits[row.id];
    return edit?.action === 'alter' ? edit.value : row.text;
  };

  const startEdit = (row: DetailRow) => {
    setDraft(currentText(row));
    setEditingId(row.id);
  };

  const commit = (row: DetailRow) => {
    const value = draft.trim();
    setEditingId(null);
    if (value === '' || value === row.text) onRestore(row.id);
    else if (value !== currentText(row)) onEdit(row.id, { action: 'alter', value });
  };

  const stateOf = (row: DetailRow): RowState => {
    if (editingId === row.id) return 'editing';
    const edit = edits[row.id];
    if (edit?.action === 'delete') return 'deleted';
    if (edit?.action === 'alter') return 'altered';
    if (implied[row.id]?.action === 'delete') return 'implied';
    return 'kept';
  };

  const value = (row: DetailRow, text: string) => (
    row.iso ? <time dateTime={row.iso}>{text}</time> : <bdi>{text}</bdi>
  );

  return (
    <dialog
      ref={dialogRef}
      class={styles.sheet}
      aria-labelledby="details-sheet-title"
      onClose={() => { if (open) onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div class={styles.sheetHeader}>
        <h3 id="details-sheet-title">{DETAILS_TITLE}</h3>
        <button type="button" class={styles.done} onClick={onClose}>{DETAILS_CLOSE}</button>
      </div>
      <ul class={styles.rows}>
        {rows.map((row) => {
          const state = stateOf(row);
          const struck = state === 'deleted' || state === 'implied';
          return (
            <li key={row.id} class={styles.row} data-detail-row={row.id} data-detail-state={state}>
              <span class={styles.label}>{row.label}</span>
              {state === 'editing' ? (
                <>
                  <input
                    ref={inputRef}
                    class={styles.input}
                    value={draft}
                    aria-label={row.label}
                    onInput={(event) => setDraft((event.target as HTMLInputElement).value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(row); } }}
                  />
                  <span class={styles.actions}>
                    <button type="button" class={styles.action} onClick={() => commit(row)}>{DETAIL_DONE}</button>
                  </span>
                </>
              ) : (
                <>
                  <span class={styles.value}>
                    {struck ? <s>{value(row, row.text)}</s> : value(row, currentText(row))}
                    {state === 'implied' && <span class={styles.implied}>{DETAIL_IMPLIED}</span>}
                  </span>
                  <span class={styles.actions}>
                    {state === 'deleted' && (
                      <button type="button" class={styles.action} onClick={() => onRestore(row.id)}>{DETAIL_UNDO}</button>
                    )}
                    {(state === 'kept' || state === 'altered') && (
                      <>
                        {row.editable && (
                          <button type="button" class={styles.action} onClick={() => startEdit(row)}>{DETAIL_EDIT}</button>
                        )}
                        <button type="button" class={styles.action} onClick={() => onEdit(row.id, { action: 'delete' })}>{DETAIL_DELETE}</button>
                      </>
                    )}
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p class={styles.thumbs}><span aria-hidden="true">✓</span> {DETAILS_THUMBS}</p>
    </dialog>
  );
}
