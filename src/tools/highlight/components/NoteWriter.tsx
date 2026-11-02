import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { SignMessages } from '#editor/registry/messages.ts';
import type { CommentPatch } from '#editor/highlight/commentCommit.ts';
import type { HighlightMessages } from '../messages.ts';
import type { NoteWriterController } from '../hooks/useNoteWriter.ts';
import { writerCancel, writerSave } from '../lib/notes/noteWriter.ts';
import styles from './NoteWriter.module.css';

const TITLE_ID = 'note-writer-title';

/** READ-19: a phone's full-screen page for writing one note. The hook opens it inside the tap; this only draws it and decides Save and Cancel. */
export default function NoteWriter({ writer, messages, labels, passage, onSave, onDiscard, onReturnFocus }: {
  writer: NoteWriterController;
  messages: SignMessages;
  labels: HighlightMessages['notes'];
  passage?: ComponentChildren;
  onSave(id: string, patch: CommentPatch): void;
  onDiscard(id: string): void;
  onReturnFocus?(id: string): void;
}) {
  const { target } = writer;
  const [blank, setBlank] = useState(!target?.comment.trim());
  useEffect(() => { setBlank(!target?.comment.trim()); }, [target]);

  const finish = (id: string) => { writer.close(); onReturnFocus?.(id); };
  const save = () => {
    const field = writer.field.current;
    if (!target || !field) return;
    const result = writerSave(target, field.value, Date.now());
    if (result.kind === 'blocked') return;
    if (result.kind === 'save') onSave(target.id, result.patch);
    else if (result.kind === 'discard') onDiscard(target.id);
    finish(target.id);
  };
  const cancel = () => {
    if (!target) return;
    if (writerCancel(target) === 'discard') onDiscard(target.id);
    finish(target.id);
  };

  return (
    <dialog ref={writer.dialog} class={styles.dialog} data-note-writer dir={messages.dir} aria-labelledby={TITLE_ID}
      onCancel={(event) => { event.preventDefault(); cancel(); }}>
      <div class={styles.header}>
        <button type="button" class={styles.cancel} onClick={cancel}>{messages.commentCancel}</button>
        <h2 id={TITLE_ID} class={styles.title}>{labels.writerTitle}</h2>
        <button type="button" class={styles.save} disabled={blank} onClick={save}>
          {target?.isNew ? messages.highlightCommentLabel : messages.commentSave}
        </button>
      </div>
      <div class={styles.content}>
        {passage}
        <textarea
          ref={writer.field}
          data-note-writer-input
          class={styles.input}
          dir="auto"
          rows={6}
          aria-label={messages.highlightCommentLabel}
          placeholder={messages.highlightCommentPlaceholder}
          onInput={(event) => setBlank(!(event.currentTarget as HTMLTextAreaElement).value.trim())}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); save(); }
          }}
          onKeyUp={(event) => event.stopPropagation()}
        />
      </div>
    </dialog>
  );
}
