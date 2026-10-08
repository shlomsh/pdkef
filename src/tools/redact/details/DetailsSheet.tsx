import { useEffect, useRef, useState } from 'preact/hooks';
import { expandDetailEdits } from '../../../editor/adapters/pdf/detailEdits.js';
import type { DetailEdit, DetailEdits } from '../../../editor/adapters/pdf/detailEdits.js';
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

const DELETED_PREFIX = 'Deleted: ';
const ALTERED_PREFIX = 'Altered: ';

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
  // Where focus goes once the row has re-rendered into its next state.
  const pendingFocus = useRef<{ id: string; action: 'edit' | 'delete' | 'undo' } | null>(null);

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
      if (editingId !== null) {
        pendingFocus.current = { id: editingId, action: 'edit' };
        setEditingId(null);
      } else closeRef.current();
    };
    window.addEventListener('keydown', onEsc, { capture: true });
    return () => window.removeEventListener('keydown', onEsc, { capture: true });
  }, [open, editingId]);

  useEffect(() => {
    if (editingId !== null) inputRef.current?.focus();
  }, [editingId]);

  // The button that was pressed is gone or changed, so focus follows the person to the row's next one.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target || editingId !== null) return;
    const button = dialogRef.current?.querySelector<HTMLElement>(`[data-detail-row="${CSS.escape(target.id)}"] [data-action="${target.action}"]`);
    if (button) {
      button.focus();
      pendingFocus.current = null;
    }
  });

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
    pendingFocus.current = { id: row.id, action: 'edit' };
    setEditingId(null);
    if (value === '' || value === row.text) onRestore(row.id);
    else if (value !== currentText(row)) onEdit(row.id, { action: 'alter', value });
  };

  // Closing never throws a typed value away: the active edit commits first, by the row's Done rule.
  const closeSheet = () => {
    const active = editingId === null ? undefined : rows.find((r) => r.id === editingId);
    if (active) commit(active);
    onClose();
  };
  const closeRef = useRef(closeSheet);
  closeRef.current = closeSheet;

  const stateOf = (row: DetailRow): RowState => {
    if (editingId === row.id) return 'editing';
    const edit = edits[row.id];
    if (edit?.action === 'delete') return 'deleted';
    if (edit?.action === 'alter') return 'altered';
    if (implied[row.id]?.action === 'delete') return 'implied';
    return 'kept';
  };

  // The accessible name carries the row ("Delete Title"); a comment attachment adds its file name.
  const nameOf = (row: DetailRow) => (row.id.startsWith('attachment:') ? `${row.label} ${row.text}` : row.label);
  const remove = (row: DetailRow) => {
    pendingFocus.current = { id: row.id, action: 'undo' };
    onEdit(row.id, { action: 'delete' });
  };
  const undo = (row: DetailRow) => {
    pendingFocus.current = { id: row.id, action: row.editable ? 'edit' : 'delete' };
    onRestore(row.id);
  };

  const value = (row: DetailRow, text: string) => (
    row.iso ? <time dateTime={row.iso}>{text}</time> : <bdi>{text}</bdi>
  );

  return (
    <dialog
      ref={dialogRef}
      class={styles.sheet}
      aria-labelledby="details-sheet-title"
      onClose={() => { if (open) closeSheet(); }}
      onClick={(event) => { if (event.target === event.currentTarget) closeSheet(); }}
    >
      <div class={styles.sheetHeader}>
        <h3 id="details-sheet-title">{DETAILS_TITLE}</h3>
        <button type="button" class={styles.done} onClick={closeSheet}>{DETAILS_CLOSE}</button>
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
                    dir="auto"
                    onInput={(event) => setDraft((event.target as HTMLInputElement).value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(row); } }}
                  />
                  <span class={styles.actions}>
                    <button type="button" class={styles.action} data-action="done" aria-label={`${DETAIL_DONE} ${nameOf(row)}`} onClick={() => commit(row)}>{DETAIL_DONE}</button>
                  </span>
                </>
              ) : (
                <>
                  <span class={styles.value}>
                    {state === 'deleted' && <span class="sr-only">{DELETED_PREFIX}</span>}
                    {state === 'altered' && <span class="sr-only">{ALTERED_PREFIX}</span>}
                    {struck ? <s>{value(row, row.text)}</s> : value(row, currentText(row))}
                    {state === 'implied' && <span class={styles.implied}>{DETAIL_IMPLIED}</span>}
                  </span>
                  <span class={styles.actions}>
                    {state === 'deleted' && (
                      <button type="button" class={styles.action} data-action="undo" aria-label={`${DETAIL_UNDO} ${nameOf(row)}`} onClick={() => undo(row)}>{DETAIL_UNDO}</button>
                    )}
                    {(state === 'kept' || state === 'altered') && (
                      <>
                        {row.editable && (
                          <button type="button" class={styles.action} data-action="edit" aria-label={`${DETAIL_EDIT} ${nameOf(row)}`} onClick={() => startEdit(row)}>{DETAIL_EDIT}</button>
                        )}
                        <button type="button" class={styles.action} data-action="delete" aria-label={`${DETAIL_DELETE} ${nameOf(row)}`} onClick={() => remove(row)}>{DETAIL_DELETE}</button>
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
