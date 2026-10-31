// SIGN-44: what a note's blur commits. Pure: null means nothing changed, so no undo step.
export function commentPatch(draft: string, current: string | undefined): { comment: string | undefined } | null {
  const next = draft.trim() ? draft : undefined;
  const before = current?.trim() ? current : undefined;
  return next === before ? null : { comment: next };
}
