/**
 * RED-17: every sentence the saved-file check shows. Pure, so the one rule
 * that matters is testable: nothing here says a term is absent from the
 * file. "No match" is always "in the text I could read", and the lead line
 * always says pictures can't be searched and the person decides.
 */
import type { Finding, PlaceKind } from './types.ts';

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
};

export function findingText(finding: Finding): string {
  switch (finding.kind) {
    case 'visible-in-picture':
      return `Page ${finding.pageIndex + 1}: still visible in the picture.`;
    case 'in-text':
      return `Page ${finding.pageIndex + 1}: in the page's text.`;
    case 'in-place':
      return PLACE_TEXT[finding.place](finding.pageIndex === undefined ? undefined : String(finding.pageIndex + 1));
  }
}

/** Whether a box can be put over this finding from the editor. */
export function canCover(finding: Finding): finding is Extract<Finding, { pageIndex: number; kind: 'visible-in-picture' | 'in-text' }> {
  return finding.kind === 'visible-in-picture' || finding.kind === 'in-text';
}

export function picturePagesNote(pages: readonly number[]): string | null {
  if (pages.length === 0) return null;
  return pages.length === 1
    ? `Page ${pageList(pages)} is a picture, so look it over yourself.`
    : `Pages ${pageList(pages)} are pictures, so look them over yourself.`;
}

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
