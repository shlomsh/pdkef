import { isComment } from '#editor/comments/anchors.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';

export interface PrintMenuItem {
  id: 'plain' | 'notes';
  label: string;
  withNotes: boolean;
}

/** Whether the document has a comment, which is what "Print with my notes" needs to be worth offering. */
export function hasComments(elements: readonly EditorElement[]): boolean {
  return elements.some(isComment);
}

/** READ-06: Print always, and Print with my notes only when there is something to put in the margin. */
export function printMenuItems(withComments: boolean, labels: { printPlain: string; printWithNotes: string }): PrintMenuItem[] {
  const items: PrintMenuItem[] = [{ id: 'plain', label: labels.printPlain, withNotes: false }];
  if (withComments) items.push({ id: 'notes', label: labels.printWithNotes, withNotes: true });
  return items;
}
