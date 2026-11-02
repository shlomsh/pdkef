import { useRef, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { NoteTarget } from '../lib/notes/noteWriter.ts';

export interface NoteWriterController {
  dialog: RefObject<HTMLDialogElement>;
  field: RefObject<HTMLTextAreaElement>;
  target: NoteTarget | null;
  open(target: NoteTarget): void;
  close(): void;
}

/** READ-19: the phone's writing page. `open` runs inside the tap and focuses the field synchronously, or iOS raises no keyboard. */
export function useNoteWriter(): NoteWriterController {
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const [target, setTarget] = useState<NoteTarget | null>(null);
  const open = (next: NoteTarget) => {
    const box = dialog.current;
    const input = field.current;
    if (!box || !input) return;
    input.value = next.comment;
    if (!box.open) box.showModal();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    setTarget(next);
  };
  const close = () => {
    if (dialog.current?.open) dialog.current.close();
    setTarget(null);
  };
  return { dialog, field, target, open, close };
}
