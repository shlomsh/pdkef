/**
 * RED-17: every sentence the saved-file check shows. Pure, so the one rule
 * that matters is testable: nothing here says a term is absent from the
 * file. "No match" is always "in the text I could read", and the lead line
 * always says pictures can't be searched and the person decides.
 */
import type { Finding, PlaceKind, SavedPlace } from './types.ts';

export const CHECK_LEAD =
  "I searched the saved file's text, form fields, comments, bookmarks and document details. "
  + "Text inside pictures can't be searched, so you're the one who decides it's safe to share.";

export const CHECKING = 'Checking the saved file...';

export const CHECK_FAILED = "I couldn't read the saved file to check it. Your download is fine; look it over yourself before you share it.";

export const NO_MATCH = 'No match in the text I could read.';

export const NOTHING_COVERED = "Nothing you covered or deleted had text I could read, so there was nothing to look for. You can search for something below.";

export const SEARCH_LABEL = 'Look for something else in the saved file';

export const SEARCH_BUTTON = 'Search';

export const COVER_IT = 'Add a box over it';

export const REMOVE_IT = 'Remove it';

export const REMOVING = 'Removing…';

export const COVER_IT_NOTE = 'Adding a box covers it in your next download. Download again to get the new copy.';

/** "3", "3 and 7", "2, 5 and 9", from zero-based indexes. */
export function pageList(pages: readonly number[]): string {
  const oneBased = pages.map((page) => String(page + 1));
  if (oneBased.length <= 1) return oneBased.join('');
  return `${oneBased.slice(0, -1).join(', ')} and ${oneBased[oneBased.length - 1]}`;
}

const PLACE_TEXT: Record<PlaceKind, (page?: string) => string> = {
  field: (page) => (page ? `In a form field on page ${page}.` : 'In a form field.'),
  comment: (page) => (page ? `In a comment on page ${page}.` : 'In a comment.'),
  link: (page) => (page ? `In a link on page ${page}.` : 'In a link.'),
  bookmark: () => 'In a bookmark.',
  title: () => "In the document's title.",
  author: () => 'In the author field.',
  subject: () => "In the document's subject.",
  keywords: () => "In the document's keywords.",
  metadata: () => "In the document's details.",
  attachment: () => "In an attached file's name.",
  unused: () => 'In a part of the file no page shows.',
};

export function findingText(finding: Finding): string {
  switch (finding.kind) {
    case 'visible-in-picture':
      return `Page ${finding.pageIndex + 1}: still visible in the picture.`;
    case 'in-text':
      return `Page ${finding.pageIndex + 1}: in the page's text.`;
    case 'in-place':
      if (finding.place === 'field' && finding.removable === false) {
        return finding.pageIndex === undefined ? "In a form field's name." : `In a form field's name on page ${finding.pageIndex + 1}.`;
      }
      return PLACE_TEXT[finding.place](finding.pageIndex === undefined ? undefined : String(finding.pageIndex + 1));
  }
}

/** Whether a box can be put over this finding from the editor. */
export function canCover(finding: Finding): finding is Extract<Finding, { pageIndex: number; kind: 'visible-in-picture' | 'in-text' }> {
  return finding.kind === 'visible-in-picture' || finding.kind === 'in-text';
}

export type InPlaceFinding = Extract<Finding, { kind: 'in-place' }>;

/** Whether Remove it can take this finding out of the saved file. */
export function canRemove(finding: Finding): finding is InPlaceFinding {
  return finding.kind === 'in-place' && finding.removable !== false;
}

function truncated(text: string, max = 40): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}

/** What the panel says after a place was removed and the file saved again. */
export function removedMessage(place: Pick<SavedPlace, 'kind' | 'text'>): string {
  const done = 'Saved again and downloaded.';
  switch (place.kind) {
    case 'bookmark': return `Removed the bookmark "${truncated(place.text)}". ${done}`;
    case 'attachment': return `Removed the attachment "${truncated(place.text)}". ${done}`;
    case 'field': return `Cleared the field. ${done}`;
    case 'comment': return `Removed the comment. ${done}`;
    case 'link': return `Removed the link. ${done}`;
    case 'title': return `Removed the title. ${done}`;
    case 'author': return `Removed the author. ${done}`;
    case 'subject': return `Removed the subject. ${done}`;
    case 'keywords': return `Removed the keywords. ${done}`;
    case 'metadata': return `Removed the document details. ${done}`;
    case 'unused': return `Removed the parts of the file no page shows. ${done}`;
  }
}

export function picturePagesNote(pages: readonly number[]): string | null {
  if (pages.length === 0) return null;
  return pages.length === 1
    ? `Page ${pageList(pages)} is a picture, so look it over yourself.`
    : `Pages ${pageList(pages)} are pictures, so look them over yourself.`;
}

/** The caller passes how many attachments the *saved* file still has (`saved.attachments.length`). */
export function attachmentsNote(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "This file has an attached file. I didn't look inside it."
    : `This file has ${count} attached files. I didn't look inside them.`;
}

export function unsolidNote(pages: readonly number[]): string | null {
  if (pages.length === 0) return null;
  return pages.length === 1
    ? `A box on page ${pageList(pages)} didn't come out solid in the saved file. Don't share this copy.`
    : `Boxes on pages ${pageList(pages)} didn't come out solid in the saved file. Don't share this copy.`;
}

/** RED-59: the file's details are the person's to keep, alter or delete. */
export const DETAILS_TITLE = 'Details';

export const DETAILS_REVIEW = 'Review';

export const DETAIL_EDIT = 'Edit';

export const DETAIL_DELETE = 'Delete';

export const DETAIL_UNDO = 'Undo';

export const DETAIL_DONE = 'Done';

export const DETAILS_CLOSE = 'Done';

export const DETAIL_IMPLIED = 'Goes with the changes above';

export const DETAILS_THUMBS = "Page pictures from before your marks go on their own, so a mark can't be seen through them.";

export const DETAILS_CHANGED = (summary: string) => `Details: ${summary}.`;

export const DETAILS_SURVIVED = (labels: string) => `Still in your download: ${labels}. Don't share this copy yet.`;

export const DETAILS_CHANGED_ANNOUNCEMENT = (summary: string) => `Checked your download. Details: ${summary}.`;

export const DETAILS_SURVIVED_ANNOUNCEMENT = (labels: string) => `Still in your download: ${labels}.`;
