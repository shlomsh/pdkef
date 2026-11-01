type CapsuleItemId = 'file' | 'page' | 'zoom' | 'marker' | 'undo' | 'redo' | 'print' | 'download' | 'more' | 'exit';

/** Under this width the capsule keeps only what the reader needs at hand (R15). @testSeam */
export const FOLD_BELOW_PX = 600;

/** The order they fold into More, which is also the order they appear there. */
const FOLDABLE: readonly CapsuleItemId[] = ['file', 'redo', 'print', 'download'];

export function foldedItems(width: number): CapsuleItemId[] {
  return width < FOLD_BELOW_PX ? [...FOLDABLE] : [];
}

/**
 * What stands in More's place. More is a menu only when it would hold two or more actions; a lone action is
 * its own button, and none at all means nothing is shown. A folded item with no `onSelect` (the file name) is
 * text, not an action, so it does not count.
 */
export function moreDisplay(folded: { onSelect?: unknown }[], more: { onSelect?: unknown }[]): 'menu' | 'lone' | 'none' {
  const actions = [...folded, ...more].filter((it) => it.onSelect).length;
  return actions >= 2 ? 'menu' : actions === 1 ? 'lone' : 'none';
}

export interface CapsuleLabels {
  toolbar: string;
  exit: string;
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
  exit: 'Exit full screen',
  undo: 'Undo',
  redo: 'Redo',
  print: 'Print',
  download: 'Download',
  more: 'More',
  page: 'Page {n} of {count}',
  jump: 'Go to page',
  go: 'Go',
};
