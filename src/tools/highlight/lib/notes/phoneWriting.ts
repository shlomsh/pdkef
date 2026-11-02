import type { EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import { isComment } from '#editor/comments/anchors.ts';
import type { NoteTarget } from './noteWriter.ts';

/**
 * READ-19: a mark's commands with phone writing added. On a narrow workspace Comment, and Edit from a pane card, open
 * the writing page inside the tap, so iOS raises the keyboard; on a wide one Comment only makes the note active.
 */
export function withPhoneWriting<C extends { comment(mark: HighlightElement): NoteTarget }>(
  commands: C, elements: readonly EditorElement[], { wide, writer }: { wide: boolean; writer: { open(target: NoteTarget): void } },
) {
  return {
    ...commands,
    comment(mark: HighlightElement) {
      const note = commands.comment(mark);
      if (!wide) writer.open(note);
      return note;
    },
    editNote(id: string) {
      const note = elements.find((el) => el.id === id);
      if (note && isComment(note)) writer.open({ id, comment: note.comment, isNew: false });
    },
  };
}
