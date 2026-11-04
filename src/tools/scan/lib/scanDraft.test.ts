import { describe, expect, it } from 'vitest';
import { type Quad } from '#lib/pageEnhance/quad.ts';
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
    expect(storedPage(page)).toEqual({ filter: 'document', turns: 1, quad: null });
    expect(storedPage({ ...page, edited: true })).toEqual({ filter: 'document', turns: 1, quad: QUAD });
  });
});

describe('scanSnapshotKey', () => {
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
      pages: [{ filter: 'original', turns: 3, quad: QUAD }, { filter: 'document', turns: 0, quad: null }],
    });
    expect(restore?.files.map((f) => [f.name, f.type])).toEqual([['a.jpg', 'image/jpeg'], ['b.png', 'image/png']]);
    expect(await restore?.files[1].text()).toBe('b');
    expect(restore?.pages).toEqual([{ filter: 'original', turns: 3, quad: QUAD }, { filter: 'document', turns: 0, quad: null }]);
    expect(restore?.settings).toEqual(settings);
  });

  it('restores the photos as new pages when the scan work is gone or unreadable', () => {
    const restore = parseScanDraft({ files });
    expect(restore?.pages).toEqual([
      { filter: 'document', turns: 0, quad: null },
      { filter: 'document', turns: 0, quad: null },
    ]);
    expect(restore?.settings).toEqual({});
    const odd = parseScanDraft({
      files, schemaVersion: SCAN_DRAFT_SCHEMA_VERSION, pageSize: 'huge', limit: 3,
      pages: [{ filter: 'sepia', turns: 9, quad: [...FULL_QUAD.slice(0, 3), { x: 2, y: 0 }] }, null],
    });
    expect(odd?.pages[0]).toEqual({ filter: 'document', turns: 0, quad: null });
    expect(odd?.settings).toEqual({});
  });

  it('holds nothing without photos', () => {
    expect(parseScanDraft(null)).toBeNull();
    expect(parseScanDraft({ fileBytes: bytes('%PDF') })).toBeNull();
    expect(parseScanDraft({ files: [{ fileName: 'a.jpg' }] })).toBeNull();
  });
});
