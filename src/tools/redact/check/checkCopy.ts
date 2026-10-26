/**
 * RED-17: every sentence the saved-file check shows. Pure, so the one rule
 * that matters is testable: nothing here says a term is absent from the
 * file. "No match" is always "in the text I could read", and the lead line
 * always says pictures can't be searched and the person decides.
 *
 * ARCH-35: the words live in `messages.ts` (`check`, `details`). The constants below are the
 * English edition's text, for the components that read it directly; each function takes the
 * messages as its last argument, so a second edition needs no change here.
 */
import { formatMessage } from '../../../lib/formatMessage.ts';
import { englishRedactMessages } from '../messages.ts';
import type { RedactMessages } from '../messages.ts';
import type { Finding, PlaceKind, SavedPlace } from './types.ts';

const en = englishRedactMessages;

export const CHECK_LEAD = en.check.lead;

export const CHECKING = en.check.checking;

export const CHECK_FAILED = en.check.failed;
/** RED-69: the check's code could not load because the tab outlived a deploy. */
export const CHECK_UPDATED = en.check.updated;

export const NO_MATCH = en.check.noMatch;

export const ALL_CLEAR = en.check.allClear;

export const NOTHING_COVERED_SHORT = en.check.nothingCoveredShort;

export const SEARCH_SUMMARY = en.check.searchSummary;

export const SEARCH_LABEL = en.check.searchLabel;

export const SEARCH_BUTTON = en.check.searchButton;

export const COVER_IT = en.check.coverIt;

export const REMOVE_IT = en.check.removeIt;

export const REMOVING = en.check.removing;

export const COVER_IT_NOTE = en.check.coverItNote;

/** "3", "3 and 7", "2, 5 and 9", from zero-based indexes. */
export function pageList(pages: readonly number[], messages: RedactMessages = en): string {
  const oneBased = pages.map((page) => String(page + 1));
  if (oneBased.length <= 1) return oneBased.join('');
  return formatMessage(messages.check.listAnd, { head: oneBased.slice(0, -1).join(', '), last: oneBased[oneBased.length - 1] });
}

export function findingText(finding: Finding, messages: RedactMessages = en): string {
  const m = messages.check;
  switch (finding.kind) {
    case 'visible-in-picture':
      return formatMessage(m.visibleInPicture, { page: finding.pageIndex + 1 });
    case 'in-text':
      return formatMessage(m.inText, { page: finding.pageIndex + 1 });
    case 'in-place': {
      if (finding.place === 'field' && finding.removable === false) {
        return finding.pageIndex === undefined ? m.fieldName : formatMessage(m.fieldNameOnPage, { page: finding.pageIndex + 1 });
      }
      const place: PlaceKind = finding.place;
      if (finding.pageIndex !== undefined && (place === 'field' || place === 'comment' || place === 'link')) {
        return formatMessage(m.placeOnPage[place], { page: finding.pageIndex + 1 });
      }
      return m.place[place];
    }
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
export function removedMessage(place: Pick<SavedPlace, 'kind' | 'text'>, messages: RedactMessages = en): string {
  const m = messages.check;
  const removed: Record<SavedPlace['kind'], string> = {
    bookmark: formatMessage(m.removedBookmark, { text: truncated(place.text) }),
    attachment: formatMessage(m.removedAttachment, { text: truncated(place.text) }),
    field: m.removedField,
    comment: m.removedComment,
    link: m.removedLink,
    title: m.removedTitle,
    author: m.removedAuthor,
    subject: m.removedSubject,
    keywords: m.removedKeywords,
    metadata: m.removedMetadata,
    unused: m.removedUnused,
  };
  return `${removed[place.kind]} ${m.removedDone}`;
}

export function picturePagesNote(pages: readonly number[], messages: RedactMessages = en): string | null {
  if (pages.length === 0) return null;
  return formatMessage(pages.length === 1 ? messages.check.picturePageOne : messages.check.picturePagesMany, { pages: pageList(pages, messages) });
}

/** The caller passes how many attachments the *saved* file still has (`saved.attachments.length`). */
export function attachmentsNote(count: number, messages: RedactMessages = en): string | null {
  if (count <= 0) return null;
  return count === 1 ? messages.check.attachmentOne : formatMessage(messages.check.attachmentMany, { count });
}

export function unsolidNote(pages: readonly number[], messages: RedactMessages = en): string | null {
  if (pages.length === 0) return null;
  return formatMessage(pages.length === 1 ? messages.check.unsolidOne : messages.check.unsolidMany, { pages: pageList(pages, messages) });
}

/** RED-59: the file's details are the person's to keep, alter or delete. */
export const DETAILS_TITLE = en.details.title;

export const DETAILS_REVIEW = en.details.review;

export const DETAIL_EDIT = en.details.edit;

export const DETAIL_DELETE = en.details.delete;

export const DETAIL_UNDO = en.details.undo;

export const DETAIL_DONE = en.details.done;

export const DETAILS_CLOSE = en.details.close;

export const DETAIL_IMPLIED = en.details.implied;

export const DETAILS_THUMBS = en.details.thumbs;

export const DETAILS_CHANGED = (summary: string) => formatMessage(en.details.changed, { summary });

export const DETAILS_SURVIVED = (labels: string) => formatMessage(en.details.survived, { labels });

export const DETAILS_CHANGED_ANNOUNCEMENT = (summary: string) => formatMessage(en.details.changedAnnouncement, { summary });

export const DETAILS_SURVIVED_ANNOUNCEMENT = (labels: string) => formatMessage(en.details.survivedAnnouncement, { labels });
