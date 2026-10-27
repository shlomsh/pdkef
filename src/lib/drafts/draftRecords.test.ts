import { describe, expect, it } from 'vitest';
import { parseDraftRecord, parseHandoff, parseLegacyRecord, parseStoredEntry } from './draftRecords.ts';

const bytes = new ArrayBuffer(4);
const work = (extra: Record<string, unknown> = {}) => ({ revision: 2, updatedAt: 5, writerId: 'w', ...extra });
const single = (over: Record<string, unknown> = {}) => ({
  tool: 'recent:sha256:a', id: 'sha256:a', fileName: 'a.pdf', fileType: 'application/pdf',
  fileBytes: bytes, savedAt: 100, work: { sign: work({ elements: [1] }) }, ...over,
});

describe.each([
  ['parseStoredEntry', parseStoredEntry],
  ['parseHandoff', parseHandoff],
  ['parseLegacyRecord', parseLegacyRecord],
])('%s', (_name, parse) => {
  it('gives null for anything that is not an object', () => {
    for (const raw of [undefined, null, 'x', 3, true]) expect(parse(raw)).toBeNull();
  });
  it('passes a single-file record through unchanged', () => {
    const record = single();
    expect(parse(record)).toBe(record);
  });
  it('passes a multi-file record through unchanged', () => {
    const record = { fileName: 'm', files: [{ fileBytes: bytes }, { fileBytes: bytes }] };
    expect(parse(record)).toBe(record);
  });
});

describe('parseDraftRecord', () => {
  it('gives null for a non-object', () => {
    expect(parseDraftRecord(undefined, 'sign', 'x')).toBeNull();
  });
  it('builds a single-file record with work[tool] spread last', () => {
    expect(parseDraftRecord(single(), 'sign', 'sha256:a')).toEqual({
      fileName: 'a.pdf', fileType: 'application/pdf', fileBytes: bytes, sourceId: 'sha256:a', savedAt: 100,
      revision: 2, updatedAt: 5, writerId: 'w', elements: [1],
    });
  });
  it('lets work fields override entry fields', () => {
    const record = parseDraftRecord(single({ work: { sign: work({ fileName: 'w.pdf', savedAt: 1, sourceId: 's' }) } }), 'sign', 'sha256:a');
    expect(record).toMatchObject({ fileName: 'w.pdf', savedAt: 1, sourceId: 's' });
  });
  it('returns the entry file fields alone when the tool has no work', () => {
    const record = parseDraftRecord(single(), 'redact', 'sha256:a');
    expect(record).toEqual({
      fileName: 'a.pdf', fileType: 'application/pdf', fileBytes: bytes, sourceId: 'sha256:a', savedAt: 100,
    });
  });
  it('builds a multi-file record when every file has bytes', () => {
    const files = [{ fileBytes: bytes }, { fileBytes: bytes }];
    const record = parseDraftRecord(single({ fileBytes: undefined, files }), 'sign', 'sha256:a');
    expect(record?.files).toBe(files);
    expect(record).not.toHaveProperty('fileBytes');
  });
  it('gives null for empty files, a file without bytes, or no bytes at all', () => {
    expect(parseDraftRecord(single({ fileBytes: undefined, files: [] }), 'sign', 'x')).toBeNull();
    expect(parseDraftRecord(single({ fileBytes: undefined, files: [{ fileBytes: bytes }, {}] }), 'sign', 'x')).toBeNull();
    expect(parseDraftRecord(single({ fileBytes: undefined }), 'sign', 'x')).toBeNull();
  });
});
