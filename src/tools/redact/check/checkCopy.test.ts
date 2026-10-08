import { describe, expect, it } from 'vitest';
import {
  CHECK_LEAD,
  attachmentsNote,
  canCover,
  canRemove,
  removedMessage,
  COVER_IT,
  COVER_IT_NOTE,
  findingText,
  pageList,
  picturePagesNote,
  unsolidNote,
  DETAILS_TITLE,
  DETAILS_REVIEW,
  DETAIL_EDIT,
  DETAIL_DELETE,
  DETAIL_UNDO,
  DETAIL_DONE,
  DETAILS_CLOSE,
  DETAIL_IMPLIED,
  DETAILS_THUMBS,
  DETAILS_CHANGED,
  DETAILS_SURVIVED,
  DETAILS_CHANGED_ANNOUNCEMENT,
  DETAILS_SURVIVED_ANNOUNCEMENT,
} from './checkCopy.ts';
import type { Finding, PlaceKind } from './types.ts';

describe('pageList', () => {
  it('renders one page', () => {
    expect(pageList([2])).toBe('3');
  });

  it('renders two pages joined by "and"', () => {
    expect(pageList([2, 6])).toBe('3 and 7');
  });

  it('renders three or more pages as a comma list with a trailing "and"', () => {
    expect(pageList([1, 4, 8])).toBe('2, 5 and 9');
  });
});

describe('findingText', () => {
  it('describes visible-in-picture by page', () => {
    const finding: Finding = { kind: 'visible-in-picture', pageIndex: 0 };
    expect(findingText(finding)).toBe('Page 1: still visible in the picture.');
  });

  it('describes in-text by page', () => {
    const finding: Finding = { kind: 'in-text', pageIndex: 3 };
    expect(findingText(finding)).toBe("Page 4: in the page's text.");
  });

  const placeCases: Array<{ place: PlaceKind; pageIndex?: number; expected: string }> = [
    { place: 'field', pageIndex: 0, expected: 'In a form field on page 1.' },
    { place: 'field', expected: 'In a form field.' },
    { place: 'comment', pageIndex: 2, expected: 'In a comment on page 3.' },
    { place: 'comment', expected: 'In a comment.' },
    { place: 'link', pageIndex: 4, expected: 'In a link on page 5.' },
    { place: 'link', expected: 'In a link.' },
    { place: 'bookmark', expected: 'In a bookmark.' },
    { place: 'title', expected: "In the document's title." },
    { place: 'author', expected: 'In the author field.' },
    { place: 'subject', expected: "In the document's subject." },
    { place: 'keywords', expected: "In the document's keywords." },
    { place: 'metadata', expected: "In the document's details." },
    { place: 'attachment', expected: "In an attached file's name." },
    { place: 'unused', expected: 'In a part of the file no page shows.' },
  ];

  for (const { place, pageIndex, expected } of placeCases) {
    it(`describes in-place for ${place}${pageIndex === undefined ? '' : ' with a page'}`, () => {
      const finding: Finding = { kind: 'in-place', place, pageIndex, text: 'x', placeIndex: 0 };
      expect(findingText(finding)).toBe(expected);
    });
  }
});

describe('picturePagesNote', () => {
  it('returns null for no pages', () => {
    expect(picturePagesNote([])).toBeNull();
  });

  it('is singular for one page', () => {
    expect(picturePagesNote([0])).toBe('Page 1 is a picture, so look it over yourself.');
  });

  it('is plural for several pages', () => {
    expect(picturePagesNote([0, 2])).toBe('Pages 1 and 3 are pictures, so look them over yourself.');
  });
});

describe('attachmentsNote', () => {
  it('returns null for zero attachments', () => {
    expect(attachmentsNote(0)).toBeNull();
  });

  it('is singular for one attachment', () => {
    expect(attachmentsNote(1)).toBe("This file has an attached file. I didn't look inside it.");
  });

  it('is plural for several attachments', () => {
    expect(attachmentsNote(3)).toBe("This file has 3 attached files. I didn't look inside them.");
  });
});

describe('unsolidNote', () => {
  it('returns null for no pages', () => {
    expect(unsolidNote([])).toBeNull();
  });

  it('is singular for one page', () => {
    expect(unsolidNote([1])).toBe("A box on page 2 didn't come out solid in the saved file. Don't share this copy.");
  });

  it('is plural for several pages', () => {
    expect(unsolidNote([0, 3])).toBe("Boxes on pages 1 and 4 didn't come out solid in the saved file. Don't share this copy.");
  });
});

describe('canCover', () => {
  it('is true for visible-in-picture', () => {
    expect(canCover({ kind: 'visible-in-picture', pageIndex: 0 })).toBe(true);
  });

  it('is true for in-text', () => {
    expect(canCover({ kind: 'in-text', pageIndex: 0 })).toBe(true);
  });

  it('is false for in-place', () => {
    expect(canCover({ kind: 'in-place', place: 'title', text: 'x', placeIndex: 0 })).toBe(false);
  });
});

describe('CHECK_LEAD mentions pictures and that the person decides', () => {
  it('names pictures', () => {
    expect(CHECK_LEAD).toMatch(/pictures?/i);
  });

  it('says the person decides', () => {
    expect(CHECK_LEAD).toMatch(/you('re| are) the one who decides/i);
  });
});

// The rule that matters: nothing this module can say, for any input, may
// claim the file is clear or that a term is absent. "No match" only ever
// means "not found in the text I could read" - the UI carries that caveat
// separately, so no exported string or function output may say otherwise.
describe('no string claims absence or safety', () => {
  const forbidden = [
    /not in the (saved )?file/i,
    /isn't there/i,
    /\bclean\b/i,
    /all clear/i,
    /\bsafe\b(?! to share)/i,
    /no secrets?/i,
    /nothing (was )?found/i,
  ];

  function assertSafe(label: string, text: string) {
    for (const pattern of forbidden) {
      expect(text, `${label} matched forbidden pattern ${pattern}: "${text}"`).not.toMatch(pattern);
    }
  }

  it('checks every exported constant string', async () => {
    const mod = await import('./checkCopy.ts');
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === 'string') assertSafe(name, value);
    }
  });

  it('checks pageList across a range of inputs', () => {
    const inputs: number[][] = [[], [0], [4], [0, 1], [2, 9], [0, 1, 2], [3, 7, 11], [0, 1, 2, 3, 4]];
    for (const pages of inputs) assertSafe(`pageList(${JSON.stringify(pages)})`, pageList(pages));
  });

  it('checks findingText across every finding kind and place kind', () => {
    const places: PlaceKind[] = [
      'field',
      'comment',
      'link',
      'bookmark',
      'title',
      'author',
      'subject',
      'keywords',
      'metadata',
      'attachment',
    ];
    const findings: Finding[] = [
      { kind: 'visible-in-picture', pageIndex: 0 },
      { kind: 'visible-in-picture', pageIndex: 5 },
      { kind: 'in-text', pageIndex: 0 },
      { kind: 'in-text', pageIndex: 5 },
      ...places.map((place): Finding => ({ kind: 'in-place', place, text: 'x', placeIndex: 0 })),
      ...places.map((place): Finding => ({ kind: 'in-place', place, pageIndex: 2, text: 'x', placeIndex: 0 })),
    ];
    for (const finding of findings) assertSafe(`findingText(${JSON.stringify(finding)})`, findingText(finding));
  });

  it('checks picturePagesNote, attachmentsNote and unsolidNote across singular, plural and null', () => {
    for (const pages of [[], [0], [0, 1], [0, 1, 2]]) {
      const pictures = picturePagesNote(pages);
      if (pictures !== null) assertSafe(`picturePagesNote(${JSON.stringify(pages)})`, pictures);
      const unsolid = unsolidNote(pages);
      if (unsolid !== null) assertSafe(`unsolidNote(${JSON.stringify(pages)})`, unsolid);
    }
    for (const count of [0, 1, 2, 5]) {
      const note = attachmentsNote(count);
      if (note !== null) assertSafe(`attachmentsNote(${count})`, note);
    }
  });
});

describe('Remove it copy', () => {
  it('names a field name as a name, and only that', () => {
    const name: Finding = { kind: 'in-place', place: 'field', pageIndex: 0, text: 'x', placeIndex: 0, removable: false };
    expect(findingText(name)).toBe("In a form field's name on page 1.");
  });

  it('offers Remove it for in-place findings that are removable, and for nothing else', () => {
    expect(canRemove({ kind: 'in-place', place: 'title', text: 'x', placeIndex: 0 })).toBe(true);
    expect(canRemove({ kind: 'in-place', place: 'field', text: 'x', placeIndex: 0, removable: false })).toBe(false);
    expect(canRemove({ kind: 'in-text', pageIndex: 0 })).toBe(false);
    expect(canRemove({ kind: 'visible-in-picture', pageIndex: 0 })).toBe(false);
  });

  it('says plainly what was removed', () => {
    expect(removedMessage({ kind: 'title', text: 'x' })).toBe('Removed the title. Saved again and downloaded.');
    expect(removedMessage({ kind: 'attachment', text: 'a.png' })).toBe('Removed the attachment "a.png". Saved again and downloaded.');
    expect(removedMessage({ kind: 'field', text: 'x' })).toBe('Cleared the field. Saved again and downloaded.');
    expect(removedMessage({ kind: 'metadata', text: 'x' })).toBe('Removed the document details. Saved again and downloaded.');
    expect(removedMessage({ kind: 'unused', text: 'x' })).toBe('Removed the parts of the file no page shows. Saved again and downloaded.');
    expect(removedMessage({ kind: 'bookmark', text: 'Short' })).toBe('Removed the bookmark "Short". Saved again and downloaded.');
    const long = removedMessage({ kind: 'bookmark', text: 'b'.repeat(80) });
    expect(long).toBe(`Removed the bookmark "${'b'.repeat(39)}…". Saved again and downloaded.`);
    for (const kind of ['comment', 'link', 'author', 'subject', 'keywords'] as const) {
      const text = removedMessage({ kind, text: 'x' });
      expect(text).not.toMatch(/successfully|\u2014/);
    }
  });
});

describe('details copy', () => {
  it('has the agreed words', () => {
    expect(DETAILS_TITLE).toBe('Details');
    expect(DETAILS_REVIEW).toBe('Review');
    expect(DETAIL_EDIT).toBe('Edit');
    expect(DETAIL_DELETE).toBe('Delete');
    expect(DETAIL_UNDO).toBe('Undo');
    expect(DETAIL_DONE).toBe('Done');
    expect(DETAILS_CLOSE).toBe('Done');
    expect(DETAIL_IMPLIED).toBe('Goes with the changes above');
    expect(DETAILS_THUMBS).toBe("Page pictures from before your marks go on their own, so a mark can't be seen through them.");
    expect(DETAILS_CHANGED('title altered')).toBe('Details: title altered.');
    expect(DETAILS_SURVIVED('Author, Title')).toBe("Still in your download: Author, Title. Don't share this copy yet.");
    expect(DETAILS_CHANGED_ANNOUNCEMENT('title altered')).toBe('Checked your download. Details: title altered.');
    expect(DETAILS_SURVIVED_ANNOUNCEMENT('Author')).toBe('Still in your download: Author.');
  });

  it('carries no em dash', () => {
    for (const text of [DETAILS_THUMBS, DETAIL_IMPLIED, DETAILS_CHANGED('a'), DETAILS_SURVIVED('a')]) expect(text).not.toMatch(/\u2014/);
  });
});
