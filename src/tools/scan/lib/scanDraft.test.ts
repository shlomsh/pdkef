import { describe, expect, it } from 'vitest';
import { type Quad } from '#lib/pageEnhance/quad.ts';
import type { Pins } from './edges/follow.ts';
import { FULL_QUAD } from './quad.ts';
import { parseScanDraft, scanSnapshotKey, SCAN_DRAFT_SCHEMA_VERSION, storedPage } from './scanDraft.ts';
import { newPage } from './scanPages.ts';

const bytes = (text: string) => new TextEncoder().encode(text).buffer;
const QUAD: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
const files = [
  { fileName: 'a.jpg', fileType: 'image/jpeg', fileBytes: bytes('a') },
  { fileName: 'b.png', fileType: 'image/png', fileBytes: bytes('b') },
];
const settings = { pageSize: 'a4' as const, limit: '1mb' as const, name: 'Lease', defaultFilter: 'grayscale' as const };

describe('storedPage', () => {
  it('keeps corners only when the person set them', () => {
    const page = { ...newPage(new File(['x'], 'a.jpg'), 'document'), quad: QUAD, turns: 1 };
    expect(storedPage(page)).toEqual({ filter: 'document', turns: 1, quad: null, pins: null, sheet: false, fine: false, opened: null, question: null });
    expect(storedPage({ ...page, edited: true })).toEqual({ filter: 'document', turns: 1, quad: QUAD, pins: null, sheet: false, fine: false, opened: null, question: null });
    expect(storedPage({ ...page, sheet: true }).sheet).toBe(true);
    expect(storedPage({ ...page, fine: true }).fine).toBe(true);
    expect(storedPage({ ...page, opened: QUAD }).opened).toEqual(QUAD);
    const question = { spine: { top: 0.4, bottom: 0.6 }, rightToLeft: false };
    expect(storedPage({ ...page, question }).question).toEqual(question);
  });
});

describe('fine in parseScanDraft', () => {
  // Protects: a stored fine is kept, and a save from before the field reads Fine-tune edges as on exactly when it holds a pin.
  it('round-trips, and reads a record without it as fine only when it has a pin', () => {
    const read = (page: object) => parseScanDraft({ files, schemaVersion: SCAN_DRAFT_SCHEMA_VERSION, ...settings, pages: [page, page] })?.pages[0].fine;
    const PIN = [[{ k: 7, at: { x: 0.5, y: 0.1 } }], [], [], []];
    expect(read({ filter: 'original', turns: 0, quad: QUAD, sheet: false, fine: true })).toBe(true);
    expect(read({ filter: 'original', turns: 0, quad: QUAD, sheet: false, fine: false, pins: PIN })).toBe(false);
    expect(read({ filter: 'original', turns: 0, quad: QUAD, sheet: false, pins: PIN })).toBe(true);
    expect(read({ filter: 'original', turns: 0, quad: QUAD, sheet: false, pins: [[], [], [], []] })).toBe(false);
    expect(read({ filter: 'original', turns: 0, quad: QUAD, sheet: false })).toBe(false);
    expect(read({ filter: 'original', turns: 0, quad: QUAD, sheet: false, fine: 'yes', pins: PIN })).toBe(true);
  });
});

describe('scanSnapshotKey', () => {
  it('changes when a split question is answered', () => {
    const page = { ...newPage(new File(['x'], 'a.jpg'), 'document'), sheet: true };
    const asking = { ...page, question: { spine: { top: 0.4, bottom: 0.6 }, rightToLeft: false } };
    expect(scanSnapshotKey([asking], settings, () => 7)).not.toBe(scanSnapshotKey([page], settings, () => 7));
  });
  it('ignores the edge guess and changes with anything stored', () => {
    const file = new File(['x'], 'a.jpg');
    const page = newPage(file, 'document');
    const key = scanSnapshotKey([page], settings, () => 7);
    expect(scanSnapshotKey([{ ...page, quad: QUAD, guessed: true }], settings, () => 7)).toBe(key);
    expect(scanSnapshotKey([{ ...page, quad: QUAD, edited: true }], settings, () => 7)).not.toBe(key);
    expect(scanSnapshotKey([{ ...page, turns: 2 }], settings, () => 7)).not.toBe(key);
    expect(scanSnapshotKey([page], { ...settings, name: 'Other' }, () => 7)).not.toBe(key);
    expect(scanSnapshotKey([page], settings, () => 8)).not.toBe(key);
  });
});

describe('parseScanDraft', () => {
  it('restores photos, pages and settings', async () => {
    const restore = parseScanDraft({
      files, schemaVersion: SCAN_DRAFT_SCHEMA_VERSION, ...settings,
      pages: [{ filter: 'original', turns: 3, quad: QUAD, sheet: true, opened: QUAD }, { filter: 'document', turns: 0, quad: null }],
    });
    expect(restore?.files.map((f) => [f.name, f.type])).toEqual([['a.jpg', 'image/jpeg'], ['b.png', 'image/png']]);
    expect(await restore?.files[1].text()).toBe('b');
    expect(restore?.pages).toEqual([{ filter: 'original', turns: 3, quad: QUAD, pins: null, sheet: true, fine: false, opened: QUAD, question: null }, { filter: 'document', turns: 0, quad: null, pins: null, sheet: false, fine: false, opened: null, question: null }]);
    expect(restore?.settings).toEqual(settings);
  });

  it('restores the photos as new pages when the scan work is gone or unreadable', () => {
    const restore = parseScanDraft({ files });
    expect(restore?.pages).toEqual([
      { filter: 'document', turns: 0, quad: null, pins: null, sheet: false, fine: false, opened: null, question: null },
      { filter: 'document', turns: 0, quad: null, pins: null, sheet: false, fine: false, opened: null, question: null },
    ]);
    expect(restore?.settings).toEqual({});
    const odd = parseScanDraft({
      files, schemaVersion: SCAN_DRAFT_SCHEMA_VERSION, pageSize: 'huge', limit: 3,
      pages: [{ filter: 'sepia', turns: 9, quad: [...FULL_QUAD.slice(0, 3), { x: 2, y: 0 }] }, null],
    });
    expect(odd?.pages[0]).toEqual({ filter: 'document', turns: 0, quad: null, pins: null, sheet: false, fine: false, opened: null, question: null });
    expect(odd?.settings).toEqual({});
  });

  it('keeps an unanswered split question, and drops one that is malformed', () => {
    const question = { spine: { top: 0.45, bottom: 0.55 }, rightToLeft: true };
    const restore = parseScanDraft({
      files, schemaVersion: SCAN_DRAFT_SCHEMA_VERSION,
      pages: [{ filter: 'document', turns: 0, quad: null, sheet: true, question }, { filter: 'document', turns: 0, quad: null, sheet: true, question: { spine: { top: 'x', bottom: 2 }, rightToLeft: 1 } }],
    });
    expect(restore?.pages[0].question).toEqual(question);
    expect(restore?.pages[1].question).toBeNull();
  });

  it('holds nothing without photos', () => {
    expect(parseScanDraft(null)).toBeNull();
    expect(parseScanDraft({ fileBytes: bytes('%PDF') })).toBeNull();
    expect(parseScanDraft({ files: [{ fileName: 'a.jpg' }] })).toBeNull();
  });
});

const PINS: Pins = [[{ k: 3, at: { x: 0.4, y: 0.12 } }], [], [{ k: 0, at: { x: 0.5, y: 0.9 } }, { k: 14, at: { x: 0.6, y: 0.91 } }], []];
const EMPTY_PINS: Pins = [[], [], [], []];
const editedPage = () => ({ ...newPage(new File(['x'], 'a.jpg'), 'document'), quad: QUAD, edited: true });
const parseOne = (page: Record<string, unknown>) => parseScanDraft({ files, schemaVersion: SCAN_DRAFT_SCHEMA_VERSION, pages: [page, page] })?.pages[0];
const base = { filter: 'original', turns: 2, quad: QUAD };

describe('pins in storedPage', () => {
  it('keeps the pins of an edited page, which belong to the corners stored with them', () => {
    expect(storedPage({ ...editedPage(), pins: PINS }).pins).toEqual(PINS);
  });
  it('stores no pins for an un-edited page, since its guessed corners are not stored either', () => {
    const stored = storedPage({ ...newPage(new File(['x'], 'a.jpg'), 'document'), quad: QUAD, pins: PINS });
    expect(stored.quad).toBeNull();
    expect(stored.pins).toBeNull();
  });
  it('stores four empty lists as null so an emptied page looks like one never pinned', () => {
    expect(storedPage({ ...editedPage(), pins: EMPTY_PINS }).pins).toBeNull();
  });
});

describe('pins in scanSnapshotKey', () => {
  const key = (pins: Pins | null, edited = true) => scanSnapshotKey([{ ...editedPage(), edited, pins }], settings, () => 7);
  it('changes when a pin is added, moved or removed, so each one is saved', () => {
    const moved: Pins = [[{ k: 3, at: { x: 0.41, y: 0.12 } }], PINS[1], PINS[2], PINS[3]];
    const removed: Pins = [PINS[0], [], [PINS[2][0]], []];
    expect(key(PINS)).not.toBe(key(null));
    expect(key(moved)).not.toBe(key(PINS));
    expect(key(removed)).not.toBe(key(PINS));
  });
  it('does not change with the pins of an un-edited page, which are not stored', () => {
    expect(key(PINS, false)).toBe(key(null, false));
  });
});

describe('pins in parseScanDraft', () => {
  it('round-trips valid pins, including an empty side', () => {
    expect(parseOne({ ...base, pins: PINS })).toEqual({ filter: 'original', turns: 2, quad: QUAD, pins: PINS, sheet: false, fine: true, opened: null, question: null });
  });
  it.each([
    ['not an array', { a: 1 }],
    ['3 sides', [[], [], []]],
    ['a side that is not an array', [[], 'x', [], []]],
    ['k 15', [[{ k: 15, at: { x: 0.5, y: 0.5 } }], [], [], []]],
    ['k 1.5', [[{ k: 1.5, at: { x: 0.5, y: 0.5 } }], [], [], []]],
    ['k -1', [[{ k: -1, at: { x: 0.5, y: 0.5 } }], [], [], []]],
    ['at.x 1.2', [[{ k: 1, at: { x: 1.2, y: 0.5 } }], [], [], []]],
    ['at.y NaN', [[{ k: 1, at: { x: 0.5, y: NaN } }], [], [], []]],
    ['a missing at', [[{ k: 1 }], [], [], []]],
    ['one bad entry among good ones (never a partial set)', [[{ k: 1, at: { x: 0.5, y: 0.5 } }], [], [{ k: 2, at: { x: 5, y: 0.5 } }], []]],
  ])('drops the whole value to null for %s, so a damaged record never half-restores, and keeps the other fields', (_name, pins) => {
    expect(parseOne({ ...base, pins })).toEqual({ filter: 'original', turns: 2, quad: QUAD, pins: null, sheet: false, fine: false, opened: null, question: null });
  });
  it('reads a record saved before pins existed as pins null, everything else as before', () => {
    expect(parseOne(base)).toEqual({ filter: 'original', turns: 2, quad: QUAD, pins: null, sheet: false, fine: false, opened: null, question: null });
  });
  it('returns null pins when the quad does not parse, since pins belong to their corners', () => {
    const bad = parseOne({ ...base, quad: [...FULL_QUAD.slice(0, 3), { x: 2, y: 0 }], pins: PINS });
    expect(bad?.quad).toBeNull();
    expect(bad?.pins).toBeNull();
    expect(bad?.turns).toBe(2);
  });
});
