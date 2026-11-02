import { commentPatch, type CommentPatch } from '#editor/highlight/commentCommit.ts';

/** READ-19: the note the phone's writing page is open on: the comment's id, its saved text, and whether it is new (saved blank, not yet logged). */
export interface NoteTarget { id: string; comment: string; isNew: boolean }


/** What Save does: a blank draft on an old note is blocked, a changed draft saves, a blank new note is dropped. */
export function writerSave(target: NoteTarget, draft: string, now: number):
  { kind: 'save'; patch: CommentPatch } | { kind: 'discard' } | { kind: 'none' } | { kind: 'blocked' } {
  const blank = !draft.trim();
  if (blank && !target.isNew) return { kind: 'blocked' };
  const patch = commentPatch(draft, target.comment, now);
  if (patch) return { kind: 'save', patch };
  return blank ? { kind: 'discard' } : { kind: 'none' };
}

/** What Cancel does: a new note is dropped, an old one stays as it was. */
export function writerCancel(target: NoteTarget): 'discard' | 'none' {
  return target.isNew ? 'discard' : 'none';
}
