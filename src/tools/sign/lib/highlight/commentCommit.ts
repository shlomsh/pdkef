// SIGN-44: what a note's blur commits. Pure: null means nothing changed, so no undo step.
export function commentPatch(draft: string, current: string | undefined): { comment: string | undefined } | null {
  const next = draft.trim() ? draft : undefined;
  const before = current?.trim() ? current : undefined;
  // An opened-then-abandoned note ('') closes; it must not linger as an empty comment.
  if (current === '' && next === undefined) return { comment: undefined };
  return next === before ? null : { comment: next };
}
