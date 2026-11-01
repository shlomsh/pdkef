export interface ClickInput {
  detail: number;
  pageKind: 'text' | 'scan';
  pressInkId: string | null;
  overExistingId: string | null;
}
export interface ClickOutcome { mark: 'none' | 'word' | 'sentence' | 'line'; replaceInkId: string | null }

/** R10 to R12: what a click does on top of the press that preceded it. */
export function clickOutcome({ detail, pageKind, pressInkId, overExistingId }: ClickInput): ClickOutcome {
  if (detail < 2 || overExistingId) return { mark: 'none', replaceInkId: null };
  const mark = detail === 2 ? 'word' : pageKind === 'text' ? 'sentence' : 'line';
  return { mark, replaceInkId: pressInkId };
}
