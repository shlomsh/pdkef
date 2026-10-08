import { describe, expect, it } from 'vitest';
import { changesPieces, changesSummary, describeDetails, detailsSummary, survivedAlways, survivedDetails, survivorLabel } from './describeDetails.ts';
import type { DocumentTraces } from '../../../editor/adapters/pdf/documentTraces.js';

const empty = (): DocumentTraces => ({
  title: null, author: null, subject: null, keywords: null, creator: null, producer: null,
  creationDate: null, modDate: null, pieceInfo: false, otherInfoKeys: [] as string[],
  xmp: { present: false, hasHistory: false },
  attachments: [] as Array<{ name: string; pageIndex?: number }>,
  scripts: { document: false, pages: [] as number[] },
  thumbnails: [] as number[], pageDetails: [] as number[],
});
const now = new Date('2026-10-08T12:00:00Z');
const opts = { locale: 'en-GB', now };
const date = (iso: string) => ({ iso, offsetMinutes: 0 });
const rows = (t: DocumentTraces) => describeDetails(t, opts);
const ids = (t: DocumentTraces) => rows(t).map((r) => r.id);

describe('describeDetails', () => {
  it('gives no rows for an empty file', () => {
    expect(rows(empty())).toEqual([]);
  });

  it('lists rows in order, only those the file has, with Hebrew values verbatim', () => {
    const t = {
      ...empty(),
      title: 'הצהרה', author: 'שלומי', subject: 'S', keywords: 'k1, k2', creator: 'Pages', producer: 'Quartz',
      creationDate: date('2026-10-07T09:14:00'), modDate: date('2026-10-07T09:20:00'),
      attachments: [{ name: 'a.png' }, { name: 'b.txt', pageIndex: 2 }],
      scripts: { document: true, pages: [] }, xmp: { present: true, hasHistory: false },
    };
    expect(ids(t)).toEqual(['title', 'author', 'subject', 'keywords', 'made', 'created', 'changed', 'attachment::a.png', 'attachment:2:b.txt', 'scripts', 'hidden']);
    const r = rows(t);
    expect(r[0]).toMatchObject({ label: 'Title', text: 'הצהרה', editable: true });
    expect(r[1]).toMatchObject({ label: 'Author', text: 'שלומי', editable: true });
    expect(r[2]).toMatchObject({ label: 'Subject', editable: true });
    expect(r[3]).toMatchObject({ label: 'Keywords', editable: true });
    expect(r[4]).toMatchObject({ label: 'Made with', text: 'Pages · Quartz', editable: true });
    expect(r[5]).toMatchObject({ label: 'Created', iso: '2026-10-07T09:14:00', editable: false });
    expect(r[5].text).toMatch(/^7 Oct,? 09:14$/);
    expect(r[6]).toMatchObject({ label: 'Changed', iso: '2026-10-07T09:20:00', editable: false });
    expect(r[7]).toMatchObject({ label: 'Attached', text: 'a.png', editable: false });
    expect(r[8]).toMatchObject({ label: 'Attached on page 3', text: 'b.txt', editable: false });
    expect(r[9]).toMatchObject({ label: 'Scripts', text: 'Run when the file opens', editable: false });
    expect(r[10]).toMatchObject({ label: 'Hidden', text: 'A second copy of these details', editable: false });
  });

  it('made: one app alone, or the same name twice shown once, as they are', () => {
    expect(rows({ ...empty(), creator: 'Notes' })[0].text).toBe('Notes');
    expect(rows({ ...empty(), producer: 'iOS Quartz PDFContext' })[0].text).toBe('iOS Quartz PDFContext');
    expect(rows({ ...empty(), creator: 'Word', producer: 'Word' })[0].text).toBe('Word');
  });

  it('dates show the year only when it differs from now, in UTC wall time', () => {
    const r = rows({ ...empty(), creationDate: date('2024-01-02T23:05:00') });
    expect(r[0].text).toMatch(/^2 Jan 2024,? 23:05$/);
  });

  it('changed: shown only a minute or more after created, or with no created date', () => {
    const created = date('2026-10-07T09:14:00');
    expect(ids({ ...empty(), creationDate: created, modDate: date('2026-10-07T09:14:59') })).toEqual(['created']);
    expect(ids({ ...empty(), creationDate: created, modDate: date('2026-10-07T09:15:00') })).toEqual(['created', 'changed']);
    expect(ids({ ...empty(), modDate: date('2026-10-07T09:15:00') })).toEqual(['changed']);
  });

  it('hidden: names the applicable parts, capitalised', () => {
    const text = (t: Partial<DocumentTraces>) => rows({ ...empty(), ...t })[0].text;
    expect(text({ xmp: { present: true, hasHistory: true } })).toBe('A second copy of these details with its save history');
    expect(rows({ ...empty(), pieceInfo: true })).toEqual([]);
    expect(text({ otherInfoKeys: ['Company'] })).toBe("The app's own notes");
    expect(text({ pageDetails: [1] })).toBe("The app's own notes");
    expect(text({ xmp: { present: true, hasHistory: false }, pieceInfo: true })).toBe('A second copy of these details');
  });

  it('scripts row for page scripts too', () => {
    expect(ids({ ...empty(), scripts: { document: false, pages: [0] } })).toEqual(['scripts']);
  });

  it('thumbnails alone give no row', () => {
    expect(ids({ ...empty(), thumbnails: [0] })).toEqual([]);
  });
});

describe('detailsSummary', () => {
  it('is empty when there are no rows', () => {
    expect(detailsSummary([], {})).toEqual([]);
  });

  it('joins title, author, made and created, then files, scripts and hidden', () => {
    const t = {
      ...empty(), title: 'T', author: 'A', subject: 'S', creator: 'Pages', creationDate: date('2026-10-07T09:14:00'),
      attachments: [{ name: 'a' }, { name: 'b' }], scripts: { document: true, pages: [] }, otherInfoKeys: ['K'],
    };
    const created = rows(t).find((r) => r.id === 'created')!.text;
    expect(detailsSummary(rows(t), {}).join(' · ')).toBe(`T · A · Pages · ${created} · 2 attached files · scripts · hidden details`);
  });

  it('shows only the app that made the file, not the library that wrote it', () => {
    expect(detailsSummary(rows({ ...empty(), creator: 'Notes', producer: 'iOS Version 17.5 Quartz PDFContext' }), {})).toEqual(['Notes']);
  });

  it('one attached file is singular', () => {
    expect(detailsSummary(rows({ ...empty(), attachments: [{ name: 'a', pageIndex: 0 }] }), {})).toEqual(['1 attached file']);
  });
});

describe('detailsSummary follows the edits', () => {
  const t = {
    ...empty(), title: 'T', author: 'A', creator: 'Pages', creationDate: date('2026-10-07T09:14:00'),
    attachments: [{ name: 'a' }, { name: 'b' }], xmp: { present: true, hasHistory: false },
  };
  const del = { action: 'delete' as const };
  it('leaves a deleted detail out', () => {
    expect(detailsSummary(rows(t), { author: del })).not.toContain('A');
    expect(detailsSummary(rows(t), { 'attachment::a': del })).toContain('1 attached file');
  });
  it('shows the new value of an altered one', () => {
    expect(detailsSummary(rows(t), { title: { action: 'alter', value: 'הצהרה' } })[0]).toBe('הצהרה');
    expect(detailsSummary(rows(t), { made: { action: 'alter', value: 'Me' } })).toContain('Me');
  });
  it('leaves out the implied ones: hidden goes with any edited text, created takes changed along', () => {
    expect(detailsSummary(rows(t), {})).toContain('hidden details');
    expect(detailsSummary(rows(t), { title: del })).not.toContain('hidden details');
    expect(detailsSummary(rows(t), { author: { action: 'alter', value: 'X' } })).not.toContain('hidden details');
  });
  it('returns pieces, not a joined string', () => {
    expect(detailsSummary(rows({ ...empty(), title: 'a · b', author: 'c' }), {})).toEqual(['a · b', 'c']);
  });
});

describe('changesSummary', () => {
  const t = { ...empty(), title: 'T', author: 'A', creator: 'Pages', attachments: [{ name: 'a.png' }], scripts: { document: true, pages: [] } };
  it('is empty when nothing was edited', () => {
    expect(changesSummary(rows(t), {})).toBe('');
  });

  it('lists explicit edits in row order', () => {
    const edits = {
      author: { action: 'delete' as const },
      title: { action: 'alter' as const, value: 'X' },
      'attachment::a.png': { action: 'delete' as const },
      made: { action: 'delete' as const },
      scripts: { action: 'delete' as const },
    };
    expect(changesSummary(rows(t), edits)).toBe('title altered, author deleted, app deleted, a.png deleted, scripts deleted');
  });

  it('gives the pieces for the UI to wrap one by one', () => {
    expect(changesPieces(rows(t), { author: { action: 'delete' }, title: { action: 'alter', value: 'X' } })).toEqual([{ name: 'title', verb: 'altered' }, { name: 'author', verb: 'deleted' }]);
  });

  it('ignores edits for ids the file does not have', () => {
    expect(changesSummary(rows(t), { subject: { action: 'delete' } })).toBe('');
  });
});

describe('survivedDetails', () => {
  const del = { action: 'delete' as const };
  const alter = (value: string) => ({ action: 'alter' as const, value });

  it('is empty when every edit took', () => {
    expect(survivedDetails({ title: del, author: alter('Y'), hidden: del }, { ...empty(), author: 'Y' })).toEqual([]);
  });

  it('flags a deleted text id still present, per id', () => {
    for (const id of ['title', 'author', 'subject', 'keywords'] as const) {
      expect(survivedDetails({ [id]: del }, { ...empty(), [id]: 'still' })).toEqual([id]);
      expect(survivedDetails({ [id]: del }, empty())).toEqual([]);
    }
  });

  it('made: deleted survives on creator or producer, altered when creator is not the new value', () => {
    expect(survivedDetails({ made: del }, { ...empty(), creator: 'x' })).toEqual(['made']);
    expect(survivedDetails({ made: del }, { ...empty(), producer: 'x' })).toEqual(['made']);
    expect(survivedDetails({ made: del }, empty())).toEqual([]);
    expect(survivedDetails({ made: alter('New') }, { ...empty(), creator: 'Old' })).toEqual(['made']);
    expect(survivedDetails({ made: alter('New') }, { ...empty(), creator: 'New' })).toEqual([]);
  });

  it('an altered text id whose saved value differs survives (Hebrew too)', () => {
    expect(survivedDetails({ title: alter('הצהרה') }, { ...empty(), title: 'Old' })).toEqual(['title']);
    expect(survivedDetails({ title: alter('הצהרה') }, { ...empty(), title: 'הצהרה' })).toEqual([]);
  });

  it('dates', () => {
    expect(survivedDetails({ created: del, changed: del }, { ...empty(), creationDate: date('2026-01-01T00:00:00') })).toEqual(['created']);
    expect(survivedDetails({ created: del, changed: del }, { ...empty(), modDate: date('2026-01-01T00:00:00') })).toEqual(['changed']);
  });

  it('attachments match by name and page', () => {
    const saved = { ...empty(), attachments: [{ name: 'a:b.png', pageIndex: 1 }, { name: 'c.txt' }] };
    expect(survivedDetails({ 'attachment:1:a:b.png': del }, saved)).toEqual(['attachment:1:a:b.png']);
    expect(survivedDetails({ 'attachment::a:b.png': del }, saved)).toEqual([]);
    expect(survivedDetails({ 'attachment::c.txt': del }, saved)).toEqual(['attachment::c.txt']);
  });

  it('scripts', () => {
    expect(survivedDetails({ scripts: del }, { ...empty(), scripts: { document: true, pages: [] } })).toEqual(['scripts']);
    expect(survivedDetails({ scripts: del }, { ...empty(), scripts: { document: false, pages: [2] } })).toEqual(['scripts']);
    expect(survivedDetails({ scripts: del }, empty())).toEqual([]);
  });

  it('hidden survives on any of xmp, other Info keys, page details', () => {
    for (const part of [{ xmp: { present: true, hasHistory: false } }, { otherInfoKeys: ['K'] }, { pageDetails: [0] }]) {
      expect(survivedDetails({ hidden: del }, { ...empty(), ...part })).toEqual(['hidden']);
    }
    expect(survivedDetails({ hidden: del }, empty())).toEqual([]);
  });

  it('ignores an alter on an id that only accepts delete', () => {
    expect(survivedDetails({ created: alter('x') }, { ...empty(), creationDate: date('2026-01-01T00:00:00') })).toEqual([]);
  });

  it('catches an implied Hidden delete that did not take, labelled from the row by the caller', () => {
    const saved = { ...empty(), xmp: { present: true, hasHistory: false } };
    expect(survivedDetails({ title: { action: 'alter', value: 'X' } }, { ...saved, title: 'X' })).toEqual(['hidden']);
    expect(survivedDetails({ title: { action: 'alter', value: 'X' } }, { ...empty(), title: 'X' })).toEqual([]);
  });

  it('catches an implied Changed delete (from deleting Created) that did not take', () => {
    const saved = { ...empty(), modDate: date('2026-01-01T00:00:00') };
    expect(survivedDetails({ created: { action: 'delete' } }, saved)).toEqual(['changed']);
  });
});

describe('survivedAlways', () => {
  it('names page pictures and app data still in the saved file, whatever the edits', () => {
    expect(survivedAlways(empty())).toEqual([]);
    expect(survivedAlways({ ...empty(), thumbnails: [0, 2] })).toEqual(['Page pictures']);
    expect(survivedAlways({ ...empty(), pieceInfo: true })).toEqual(['App data']);
    expect(survivedAlways({ ...empty(), thumbnails: [1], pieceInfo: true })).toEqual(['Page pictures', 'App data']);
  });

  it('survivedDetails no longer counts pieceInfo as hidden', () => {
    expect(survivedDetails({ hidden: { action: 'delete' } }, { ...empty(), pieceInfo: true })).toEqual([]);
  });
});

describe('survivorLabel', () => {
  const r = [{ id: 'title', label: 'Title', text: 'Q', editable: true }];
  it('uses the row label when the rows are loaded', () => {
    expect(survivorLabel('title', r)).toBe('Title');
  });

  it('falls back to the id plain label while rows are still empty', () => {
    const labels = Object.fromEntries(['title', 'made', 'scripts', 'hidden', 'created', 'changed', 'author'].map((id) => [id, survivorLabel(id, [])]));
    expect(labels).toEqual({ title: 'Title', made: 'App', scripts: 'Scripts', hidden: 'Hidden', created: 'Created', changed: 'Changed', author: 'Author' });
    expect(survivorLabel('attachment:2:שם.png', [])).toBe('שם.png');
    expect(survivorLabel('attachment::a:b.png', [])).toBe('a:b.png');
  });

  it('names an attachment by its file name from the row', () => {
    expect(survivorLabel('attachment::a.png', [{ id: 'attachment::a.png', label: 'Attached', text: 'a.png', editable: false }])).toBe('a.png');
  });
});
