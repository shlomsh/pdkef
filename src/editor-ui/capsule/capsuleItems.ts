export type CapsuleItemId = 'file' | 'page' | 'zoom' | 'marker' | 'undo' | 'redo' | 'print' | 'download' | 'more' | 'exit';

/** Under this width the capsule keeps only what the reader needs at hand (R15). */
export const FOLD_BELOW_PX = 600;

/** The order they fold into More, which is also the order they appear there. */
const FOLDABLE: readonly CapsuleItemId[] = ['file', 'redo', 'print', 'download'];

export function foldedItems(width: number): CapsuleItemId[] {
  return width < FOLD_BELOW_PX ? [...FOLDABLE] : [];
}

export interface CapsuleLabels {
  toolbar: string;
  exit: string;
  enter: string;
  undo: string;
  redo: string;
  print: string;
  download: string;
  more: string;
  /** "Page {n} of {count}" */
  page: string;
  jump: string;
  go: string;
}

export const englishCapsuleLabels: CapsuleLabels = {
  toolbar: 'Reading lamp',
  exit: 'Leave the reading lamp',
  enter: 'Enter the reading lamp',
  undo: 'Undo',
  redo: 'Redo',
  print: 'Print',
  download: 'Download',
  more: 'More',
  page: 'Page {n} of {count}',
  jump: 'Go to page',
  go: 'Go',
};
