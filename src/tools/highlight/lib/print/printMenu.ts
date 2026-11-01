import { isComment } from '#editor/comments/anchors.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';

/** What Print puts beside or after the pages: nothing, the notes in the margin, or the notes as a list at the end. */
export type PrintNotes = 'none' | 'beside' | 'end';

interface PrintMenuItem {
  id: 'plain' | 'beside' | 'end';
  label: string;
  notes: PrintNotes;
}

/** Whether the document has a comment, which is what "Print with my notes" needs to be worth offering. */
export function hasComments(elements: readonly EditorElement[]): boolean {
  return elements.some(isComment);
}

/** READ-06: Print always, and the two ways to print the notes only when there is a comment to print. */
export function printMenuItems(withComments: boolean, labels: { printPlain: string; printWithNotes: string; printNotesAtEnd: string }): PrintMenuItem[] {
  const items: PrintMenuItem[] = [{ id: 'plain', label: labels.printPlain, notes: 'none' }];
  if (withComments) {
    items.push({ id: 'beside', label: labels.printWithNotes, notes: 'beside' });
    items.push({ id: 'end', label: labels.printNotesAtEnd, notes: 'end' });
  }
  return items;
}
