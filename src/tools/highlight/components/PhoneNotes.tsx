import type { ComponentProps } from 'preact';
import type { NoteWriterController } from '../hooks/useNoteWriter.ts';
import NotePane from './NotePane.tsx';
import NoteWriter from './NoteWriter.tsx';
import PassagePicture from './PassagePicture.tsx';

/** READ-19: a phone's notes: the pane reads them, and a page of their own writes them. */
/** The writer stays mounted at any width, so a turn of the phone never loses the words in it; only the pane is narrow-only. */
export default function PhoneNotes({ writer, wide, ...pane }: Omit<ComponentProps<typeof NotePane>, 'onEdit'> & { writer: NoteWriterController; wide: boolean; onEdit(id: string): void }) {
  return (
    <>
      {!wide && <NotePane {...pane} />}
      <NoteWriter writer={writer} messages={pane.messages} labels={pane.labels} passage={<PassagePicture elements={pane.elements} noteId={writer.target?.id ?? null} />}
        onSave={pane.onSave} onDiscard={pane.onDiscard} onReturnFocus={pane.onReturnFocus} />
    </>
  );
}
