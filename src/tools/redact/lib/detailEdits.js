/**
 * RED-59: the vocabulary of detail edits, shared by the engine and by Redact's
 * UI. Pure data and one pure function; deliberately NO imports, so the island
 * can use it without pulling pdf-lib into its first paint.
 */

/** Detail ids that accept delete or alter. */
export const TEXT_DETAIL_IDS = ['title', 'author', 'subject', 'keywords', 'made'];
/** Detail ids that accept delete only, like attachments, 'scripts' and 'hidden'. */
export const DATE_DETAIL_IDS = ['created', 'changed'];
/** The detail id of an attached file: `attachment:<pageIndex or empty>:<name>`. */
export const attachmentDetailId = (file) => `attachment:${file.pageIndex ?? ''}:${file.name}`;

/** @typedef {{ action: 'delete' } | { action: 'alter', value: string }} DetailEdit */
/** @typedef {Record<string, DetailEdit>} DetailEdits Keyed by detail id. */

/**
 * Adds `hidden: delete` when a text or date detail is edited, because the XMP
 * packet is a second copy of the same details and would keep the old value.
 * Deleting Created also deletes Changed: the Changed row is hidden when it
 * sits within a minute of Created, and its date would otherwise stay in the file.
 * Pure; returns the input unchanged when nothing needs adding.
 * @param {DetailEdits} edits
 * @returns {DetailEdits}
 */
export function expandDetailEdits(edits) {
  const touched = [...TEXT_DETAIL_IDS, ...DATE_DETAIL_IDS].some((id) => edits[id]);
  if (!touched) return edits;
  const out = { ...edits };
  if (edits.created?.action === 'delete' && !edits.changed) out.changed = { action: 'delete' };
  if (!edits.hidden) out.hidden = { action: 'delete' };
  return out;
}
