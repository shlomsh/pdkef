import { describe, expect, it } from 'vitest';
import { describeTraces, survivedRows, type TraceRow } from './describeTraces.ts';

const empty = () => ({
  title: null, author: null, subject: null, keywords: null, creator: null, producer: null,
  creationDate: null, modDate: null, otherInfoKeys: [] as string[],
  xmp: { present: false, hasHistory: false },
  attachments: [] as Array<{ name: string; pageIndex?: number }>,
  scripts: { document: false, pages: [] as number[] },
  thumbnails: [] as number[], pageDetails: [] as number[],
});
const now = new Date('2026-10-08T12:00:00Z');
const opts = { locale: 'en-GB', now };
const flat = (row: TraceRow) => row.parts.map((p) => p.text).join('');
const one = (traces: ReturnType<typeof empty>, o = opts) => describeTraces(traces, o).map(flat);

describe('describeTraces', () => {
  it('gives no rows for an empty file', () => {
    expect(describeTraces(empty(), opts)).toEqual([]);
  });

  it('made: app, device and date', () => {
    const t = { ...empty(), creator: 'Notes', producer: 'iOS Quartz', creationDate: { iso: '2026-10-07T09:14:00', offsetMinutes: 180 } };
    const rows = describeTraces(t, opts);
    expect(rows[0].kind).toBe('made');
    expect(flat(rows[0])).toMatch(/^Notes on an iPhone or iPad, 7 Oct,? 09:14$/);
    expect(rows[0].parts.find((p) => p.type === 'date')).toMatchObject({ iso: '2026-10-07T09:14:00' });
    expect(rows[0].parts.find((p) => p.type === 'value')?.text).toBe('Notes');
  });

  it('made: app falls back to producer', () => {
    expect(one({ ...empty(), producer: 'Microsoft Word for Windows' })[0]).toBe('Microsoft Word for Windows on Windows');
  });

  it.each([
    ['iPhone 15', 'on an iPhone'],
    ['iPad Pro', 'on an iPad'],
    ['iOS 17', 'on an iPhone or iPad'],
    ['Android 14', 'on Android'],
    ['Mac OS X 10.15', 'on a Mac'],
    ['macOS Quartz', 'on a Mac'],
    ['Windows 11', 'on Windows'],
  ])('device table: %s', (producer, phrase) => {
    expect(one({ ...empty(), creator: 'App', producer })[0]).toBe(`App ${phrase}`);
  });

  it('no device phrase when none matches', () => {
    expect(one({ ...empty(), creator: 'Scanner' })[0]).toBe('Scanner');
  });

  it('adds the year when it differs from now', () => {
    const t = { ...empty(), creator: 'Notes', creationDate: { iso: '2024-03-02T08:05:00', offsetMinutes: null } };
    expect(one(t)[0]).toContain('2024');
  });

  it('adds changed date when modDate is at least a minute later', () => {
    const t = { ...empty(), creator: 'Notes', creationDate: { iso: '2026-10-07T09:14:00', offsetMinutes: null }, modDate: { iso: '2026-10-07T10:30:00', offsetMinutes: null } };
    expect(one(t)[0]).toMatch(/, changed 7 Oct/);
  });

  it('no changed under a minute later', () => {
    const t = { ...empty(), creator: 'Notes', creationDate: { iso: '2026-10-07T09:14:00', offsetMinutes: null }, modDate: { iso: '2026-10-07T09:14:30', offsetMinutes: null } };
    expect(one(t)[0]).not.toContain('changed');
  });

  it('a date with no app reads Saved', () => {
    const t = { ...empty(), creationDate: { iso: '2026-10-07T09:14:00', offsetMinutes: null } };
    expect(one(t)[0]).toMatch(/^Saved 7 Oct/);
  });

  it('date uses the locale', () => {
    const t = { ...empty(), creator: 'Notes', creationDate: { iso: '2026-10-07T09:14:00', offsetMinutes: null } };
    const he = one(t, { locale: 'he', now })[0];
    expect(he).toContain('באוק');
    expect(he).toContain('09:14');
  });

  it('titled variants, keeping Hebrew verbatim as values', () => {
    expect(one({ ...empty(), title: 'Q3', author: 'Dana' })).toEqual(['“Q3”, by Dana']);
    expect(one({ ...empty(), title: 'Q3' })).toEqual(['“Q3”']);
    expect(one({ ...empty(), author: 'Dana' })).toEqual(['By Dana']);
    const rows = describeTraces({ ...empty(), title: 'דוח שנתי', author: 'דנה לוי' }, opts);
    const values = rows[0].parts.filter((p) => p.type === 'value').map((p) => p.text);
    expect(values).toEqual(['דוח שנתי', 'דנה לוי']);
  });

  it('described variants', () => {
    expect(one({ ...empty(), subject: 'Tax', keywords: 'a, b' })).toEqual(['Described as “Tax”, tagged “a, b”']);
    expect(one({ ...empty(), subject: 'Tax' })).toEqual(['Described as “Tax”']);
    expect(one({ ...empty(), keywords: 'a' })).toEqual(['Tagged “a”']);
  });

  it('other', () => {
    expect(one({ ...empty(), otherInfoKeys: ['Company', 'X'] })).toEqual(['2 more details the app added']);
  });

  it('xmp', () => {
    expect(one({ ...empty(), xmp: { present: true, hasHistory: false } })).toEqual(['A second set of details']);
    expect(one({ ...empty(), xmp: { present: true, hasHistory: true } })).toEqual(['A second set of details, with its save history']);
  });

  it('attachments, one row each', () => {
    const rows = describeTraces({ ...empty(), attachments: [{ name: 'a.pdf' }, { name: 'n.txt', pageIndex: 2 }] }, opts);
    expect(rows.map(flat)).toEqual(['Attached: a.pdf', 'Attached in a comment on page 3: n.txt']);
    expect(rows[1]).toMatchObject({ kind: 'attachment', attachment: 'n.txt', pageIndex: 2 });
  });

  it('scripts', () => {
    expect(one({ ...empty(), scripts: { document: true, pages: [] } })).toEqual(['Scripts that run on open']);
    expect(one({ ...empty(), scripts: { document: false, pages: [1] } })).toEqual(['Scripts that run on open']);
  });

  it('thumbnail and page details', () => {
    expect(one({ ...empty(), thumbnails: [2] })).toEqual(['A small picture of page 3 as it was']);
    expect(one({ ...empty(), thumbnails: [2, 6] })).toEqual(['A small picture of pages 3 and 7 as they were']);
    expect(one({ ...empty(), pageDetails: [0] })).toEqual(['Hidden details on page 1']);
    expect(one({ ...empty(), pageDetails: [1, 4, 8] })).toEqual(['Hidden details on pages 2, 5 and 9']);
  });

  it('orders rows', () => {
    const t = { ...empty(), pageDetails: [0], title: 'T', creator: 'A' };
    expect(describeTraces(t, opts).map((r) => r.kind)).toEqual(['made', 'titled', 'pageDetails']);
  });
});

describe('survivedRows', () => {
  it('picks the attachment row by name and other kinds by presence', () => {
    const original = { ...empty(), title: 'T', attachments: [{ name: 'a.pdf' }, { name: 'b.pdf' }] };
    const rows = describeTraces(original, opts);
    const saved = { ...empty(), attachments: [{ name: 'b.pdf' }] };
    const ids = survivedRows(rows, saved);
    const byName = (n: string) => rows.find((r) => r.attachment === n)!.id;
    expect(ids.has(byName('b.pdf'))).toBe(true);
    expect(ids.has(byName('a.pdf'))).toBe(false);
    expect(ids.has(rows.find((r) => r.kind === 'titled')!.id)).toBe(false);
    expect(survivedRows(rows, { ...saved, title: 'T' }).has(rows.find((r) => r.kind === 'titled')!.id)).toBe(true);
  });
});
