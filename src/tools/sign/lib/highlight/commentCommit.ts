// SIGN-44: what saving a comment commits. Pure: null means nothing changed, so no undo step.
export type CommentPatch = { comment: string | undefined; commentedAt?: number | undefined };

/** A written or changed comment is stamped `now`; a removed one drops its date too. */
export function commentPatch(draft: string, current: string | undefined, now: number): CommentPatch | null {
  const next = draft.trim() ? draft : undefined;
  const before = current?.trim() ? current : undefined;
  // An opened-then-abandoned comment ('') closes; it must not linger as an empty comment.
  if (current === '' && next === undefined) return { comment: undefined, commentedAt: undefined };
  if (next === before) return null;
  return next === undefined ? { comment: undefined, commentedAt: undefined } : { comment: next, commentedAt: now };
}
