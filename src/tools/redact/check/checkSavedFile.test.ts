import { describe, expect, it } from 'vitest';
import { createPageGeometry } from '../../../editor/geometry/coords.ts';
import { PRESET_FINDERS, termFinder } from '../find/finders.ts';
import { buildPageText } from '../find/pageText.ts';
import type { SearchablePage } from '../find/findMatches.ts';
import { checkSavedFile } from './checkSavedFile.ts';
import type { CheckBox, CheckTerm, SavedFile } from './types.ts';

const geometry = createPageGeometry({ cropBox: { x: 0, y: 0, width: 600, height: 800 }, rotation: 0, userUnit: 1 });
const item = (str: string, x: number, y: number) => ({ str, transform: [12, 0, 0, 12, x, y], width: str.length * 6, height: 12 });

const page = (pageIndex: number, ...items: ReturnType<typeof item>[]): SearchablePage => ({
  text: buildPageText(pageIndex, items),
  geometry,
});

const nameTerm: CheckTerm = { label: 'Jane Doe', source: 'find', finder: termFinder('Jane Doe') };

// A box covering the match on page 0 at (100, 700), sized generously.
const coveringBox: CheckBox = { pageIndex: 0, type: 'blackout', left: 0, top: 0, width: 100, height: 100 };

function emptySavedFile(overrides: Partial<SavedFile> = {}): SavedFile {
  return {
    pages: [],
    places: [],
    picturePages: [],
    attachmentCount: 0,
    ...overrides,
  };
}

describe('checkSavedFile', () => {
  it('gives no findings for a covered match, even on a picture page', () => {
    const original = [page(0, item('Jane Doe', 100, 700))];
    const results = checkSavedFile({
      terms: [nameTerm],
      original,
      boxes: [coveringBox],
      saved: emptySavedFile({ picturePages: [0] }),
    });

    expect(results).toEqual([{ term: nameTerm, findings: [] }]);
  });

  it('counts a box drawn tightly around the letters as covering them, though it misses Find\'s padding', () => {
    // "Jane Doe" at 12pt from x 100 to 148 on baseline 700: its letters sit
    // between viewport y 91.6 and 101.8. Find's own box reaches y 87.
    const original = [page(0, item('Jane Doe', 100, 700))];
    const tight: CheckBox = { pageIndex: 0, type: 'blackout', left: (99 / 600) * 100, top: (91 / 800) * 100, width: (50 / 600) * 100, height: (12 / 800) * 100 };
    const results = checkSavedFile({ terms: [nameTerm], original, boxes: [tight], saved: emptySavedFile({ picturePages: [0] }) });

    expect(results[0].findings).toEqual([]);
  });

  it('still flags a match a box only half hides', () => {
    const original = [page(0, item('Jane Doe', 100, 700))];
    const half: CheckBox = { pageIndex: 0, type: 'blackout', left: (99 / 600) * 100, top: (91 / 800) * 100, width: (25 / 600) * 100, height: (12 / 800) * 100 };
    const results = checkSavedFile({ terms: [nameTerm], original, boxes: [half], saved: emptySavedFile({ picturePages: [0] }) });

    expect(results[0].findings).toEqual([{ kind: 'visible-in-picture', pageIndex: 0 }]);
  });

  it('flags an uncovered match on a page saved as a picture', () => {
    const original = [page(0, item('Jane Doe', 100, 700))];
    const results = checkSavedFile({
      terms: [nameTerm],
      original,
      boxes: [],
      saved: emptySavedFile({ picturePages: [0] }),
    });

    expect(results[0].findings).toEqual([{ kind: 'visible-in-picture', pageIndex: 0 }]);
  });

  it('does not flag visible-in-picture for a page that was not saved as a picture', () => {
    const original = [page(0, item('Jane Doe', 100, 700))];
    const results = checkSavedFile({
      terms: [nameTerm],
      original,
      boxes: [],
      saved: emptySavedFile(),
    });

    expect(results[0].findings).toEqual([]);
  });

  it('flags a term still present in the saved file text', () => {
    const original = [page(0, item('Jane Doe', 100, 700))];
    const saved = emptySavedFile({
      pages: [page(0, item('Jane Doe', 100, 700))],
    });

    const results = checkSavedFile({ terms: [nameTerm], original, boxes: [], saved });

    expect(results[0].findings).toEqual([{ kind: 'in-text', pageIndex: 0 }]);
  });

  it('flags a term in a title place and in a field on page 2, ordered as saved', () => {
    const original = [page(0, item('Jane Doe', 100, 700))];
    const saved = emptySavedFile({
      places: [
        { kind: 'title', text: 'Report for Jane Doe' },
        { kind: 'field', text: 'Jane Doe', pageIndex: 2 },
      ],
    });

    const results = checkSavedFile({ terms: [nameTerm], original, boxes: [], saved });

    expect(results[0].findings).toEqual([
      { kind: 'in-place', place: 'title', pageIndex: undefined },
      { kind: 'in-place', place: 'field', pageIndex: 2 },
    ]);
  });

  it('flags a term matched in a link', () => {
    const original = [page(0, item('Jane Doe', 100, 700))];
    const saved = emptySavedFile({
      places: [{ kind: 'link', text: 'jane-doe-profile', pageIndex: 1 }],
    });

    const results = checkSavedFile({
      terms: [{ label: 'jane-doe-profile', source: 'typed', finder: termFinder('jane-doe-profile') }],
      original,
      boxes: [],
      saved,
    });

    expect(results[0].findings).toEqual([{ kind: 'in-place', place: 'link', pageIndex: 1 }]);
  });

  it('reports an uncovered match on a picture page once, although the page also carries it as text', () => {
    const original = [page(0, item('Jane Doe', 100, 700))];
    const saved = emptySavedFile({ pages: [page(0, item('Jane Doe', 100, 700))], picturePages: [0] });

    const results = checkSavedFile({ terms: [nameTerm], original, boxes: [], saved });

    expect(results[0].findings).toEqual([{ kind: 'visible-in-picture', pageIndex: 0 }]);
  });

  it('orders page findings by page, visible-in-picture before in-text, then places last', () => {
    const original = [
      page(0, item('Jane Doe', 100, 700)),
      page(1, item('Jane Doe', 100, 700)),
    ];
    const saved = emptySavedFile({
      pages: [page(0, item('Jane Doe', 100, 700))],
      picturePages: [1],
      places: [{ kind: 'comment', text: 'Jane Doe was here', pageIndex: 0 }],
    });

    const results = checkSavedFile({ terms: [nameTerm], original, boxes: [], saved });

    expect(results[0].findings).toEqual([
      { kind: 'in-text', pageIndex: 0 },
      { kind: 'visible-in-picture', pageIndex: 1 },
      { kind: 'in-place', place: 'comment', pageIndex: 0 },
    ]);
  });

  it('dedupes repeated matches on the same page into one finding', () => {
    const original = [page(0, item('Jane Doe', 100, 700), item('Jane Doe', 100, 600))];
    const saved = emptySavedFile({ picturePages: [0] });

    const results = checkSavedFile({ terms: [nameTerm], original, boxes: [], saved });

    expect(results[0].findings).toEqual([{ kind: 'visible-in-picture', pageIndex: 0 }]);
  });

  it('checks a preset finder the same way as a typed term', () => {
    const emailTerm: CheckTerm = { label: 'Email addresses', source: 'typed', finder: PRESET_FINDERS.email };
    const original = [page(0, item('contact jane@example.com', 100, 700))];
    const saved = emptySavedFile({
      pages: [page(0, item('contact jane@example.com', 100, 700))],
    });

    const results = checkSavedFile({ terms: [emailTerm], original, boxes: [], saved });

    expect(results[0].findings).toEqual([{ kind: 'in-text', pageIndex: 0 }]);
  });

  it('keeps terms in the order they were given, each with its own findings', () => {
    const original = [page(0, item('Jane Doe', 100, 700))];
    const otherTerm: CheckTerm = { label: 'Nobody', source: 'typed', finder: termFinder('Nobody') };
    const saved = emptySavedFile({ picturePages: [0] });

    const results = checkSavedFile({ terms: [otherTerm, nameTerm], original, boxes: [], saved });

    expect(results.map((result) => result.term)).toEqual([otherTerm, nameTerm]);
    expect(results[0].findings).toEqual([]);
    expect(results[1].findings).toEqual([{ kind: 'visible-in-picture', pageIndex: 0 }]);
  });
});
