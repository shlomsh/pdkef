// SIGN-44: what saving a comment commits. Pure: null means nothing to save (unchanged or blank).
export type CommentPatch = { comment: string; commentedAt: number };

/** A written or changed comment is stamped `now`. A blank draft is the caller's discard (new) or delete (saved). */
export function commentPatch(draft: string, current: string, now: number): CommentPatch | null {
  if (!draft.trim() || draft === current) return null;
  return { comment: draft, commentedAt: now };
}
