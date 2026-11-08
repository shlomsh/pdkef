import { useEffect, useRef, useState } from 'preact/hooks';
import { useUndoWindow } from '#shell/useUndoWindow.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import type { CommentPatch } from '#editor/highlight/commentCommit.ts';
import { commentCards } from '#editor/highlight/commentCards.ts';
import { anchorNode } from '#editor-ui/comments/anchorNode.ts';
import { commentCardLabel } from '#editor-ui/comments/commentLabel.ts';
import { CommentCardBody } from '#editor-ui/comments/CommentCardBody.tsx';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { HighlightMessages } from '../messages.ts';
import { paneIndex, paneNotes, snapIndex } from '../lib/notes/notePane.ts';
import styles from './NotePane.module.css';

const stop = (event: Event) => event.stopPropagation();
const STEER_MS = 700;

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The distance between two neighbouring cards, which is how far one swipe travels. */
function cardStep(track: HTMLElement): number {
  const cards = track.querySelectorAll<HTMLElement>('[data-note-card]');
  return cards.length > 1 ? Math.abs(cards[1].offsetLeft - cards[0].offsetLeft) : track.clientWidth;
}

const Chevron = ({ flip }: { flip?: boolean }) => (
  <svg class={flip ? styles.forward : styles.back} aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>
);

/** READ-15: on a phone the notes sit in a bottom pane, one at a time; swipe sideways to read the next in page order. */
export default function NotePane({ elements, activeElementId, messages, labels, onSelect, onSave, onDelete, onDiscard, onUndo, onEdit, onReturnFocus }: {
  elements: readonly EditorElement[];
  activeElementId: string | null;
  messages: SignMessages;
  labels: HighlightMessages['notes'];
  onSelect: (id: string | null) => void;
  onSave: (id: string, patch: CommentPatch) => void;
  onDelete: (id: string) => void;
  onDiscard: (id: string) => void;
  onUndo: () => void;
  onEdit: (id: string) => void;
  onReturnFocus?: (id: string) => void;
}) {
  const notes = paneNotes(elements, activeElementId);
  const idx = paneIndex(notes, activeElementId);
  const open = idx >= 0;
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const steering = useRef<number | null>(null);
  const wasOpen = useRef(false);
  const [deleted, setDeleted] = useState<string | null>(null);
  const undoWindow = useUndoWindow(() => setDeleted(null));
  const rtl = messages.dir === 'rtl';

  // The pane follows the active note: the track slides to its card and the page brings its passage above the pane.
  useEffect(() => {
    if (!open) { wasOpen.current = false; return; }
    const behavior: ScrollBehavior = !wasOpen.current || reducedMotion() ? 'auto' : 'smooth';
    wasOpen.current = true;
    const node = anchorNode(elements, activeElementId!);
    // The margin makes block: 'center' centre the passage in the band above the pane, not in the whole viewport; it is cleared right after, since the scroll target is computed at call time.
    if (node) node.style.scrollMarginBottom = `${section.current?.offsetHeight ?? 0}px`;
    node?.scrollIntoView({ block: 'center', behavior });
    if (node) node.style.scrollMarginBottom = '';
    const el = track.current;
    if (!el || !el.scrollTo || snapIndex(el.scrollLeft, cardStep(el), notes.length) === idx) return;
    steering.current = idx;
    el.scrollTo({ left: (rtl ? -1 : 1) * idx * cardStep(el), behavior });
    const timer = setTimeout(() => { steering.current = null; }, STEER_MS);
    return () => clearTimeout(timer);
  }, [activeElementId, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onSelect(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onSelect]);

  if (!open && !deleted) return null;

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const i = snapIndex(el.scrollLeft, cardStep(el), notes.length);
    if (steering.current !== null) {
      if (i === steering.current) steering.current = null;
      return;
    }
    if (i !== idx && notes[i]) onSelect(notes[i].id);
  };
  const remove = (i: number) => {
    const next = notes[i + 1] ?? notes[i - 1];
    onDelete(notes[i].id);
    onSelect(next?.id ?? null);
    setDeleted(notes[i].id);
    undoWindow.start();
  };
  const undo = () => {
    const id = deleted!;
    setDeleted(null);
    undoWindow.stop();
    onUndo();
    onSelect(id);
  };
  const close = () => { setDeleted(null); undoWindow.stop(); onSelect(null); };

  return (
    <section ref={section} class={styles.pane} data-note-pane aria-label={labels.region} dir={messages.dir}
      onClick={stop} onMouseDown={stop} onTouchStart={stop} onPointerDown={stop}>
      {deleted && (
        <div class={styles.chip} role="status">
          <span>{labels.deleted}</span>
          <button type="button" class={styles.undo} onClick={undo}>{labels.undo}</button>
        </div>
      )}
      {open && (
        <>
          <div class={styles.header}>
            <button type="button" class={styles.icon} aria-label={labels.previous} disabled={idx === 0} onClick={() => onSelect(notes[idx - 1].id)}><Chevron /></button>
            <span class={styles.count}>{formatMessage(labels.count, { index: idx + 1, count: notes.length })}</span>
            <button type="button" class={styles.icon} aria-label={labels.next} disabled={idx === notes.length - 1} onClick={() => onSelect(notes[idx + 1].id)}><Chevron flip /></button>
            <button type="button" class={`${styles.icon} ${styles.close}`} aria-label={labels.close} onClick={close}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div class={styles.track} ref={track} data-note-track onScroll={onScroll}>
            {notes.map((note, i) => {
              const card = commentCards(elements, note.pageIndex, activeElementId).find((c) => c.id === note.id);
              if (!card) return null;
              return (
                <div key={note.id} class={styles.card} data-note-card={note.id} data-active={note.id === activeElementId || undefined}>
                  <div class={styles.meta}>
                    {note.color && <span class={styles.swatch} style={{ background: note.color }} />}
                    {formatMessage(labels.page, { number: note.pageIndex + 1 })}
                  </div>
                  {/* Keyed by note: its draft is local state, so a neighbour must not open with this one's text. */}
                  <CommentCardBody
                    key={note.id}
                    card={card}
                    active={note.id === activeElementId}
                    messages={messages}
                    label={commentCardLabel(elements, note.id, note.pageIndex, messages)}
                    onSelect={() => onSelect(note.id)}
                    onSave={(patch) => onSave(note.id, patch)}
                    onDelete={() => remove(i)}
                    onDiscard={() => onDiscard(note.id)}
                    onEdit={() => onEdit(note.id)}
                    onReturnFocus={() => onReturnFocus?.(note.id)}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
