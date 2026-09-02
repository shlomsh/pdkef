import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRAFT_SCHEMA_VERSION,
  migrateDraftRecord,
  validateDraftElements,
  validateDraftRecord,
} from './draftValidation.ts';

const bytesOf = (length = 4) => new ArrayBuffer(length);

const goodText = { id: 'text-1', type: 'text', pageIndex: 0, left: 10, top: 20, text: 'Hello' };
const goodBlackout = { id: 'blackout-1', type: 'blackout', pageIndex: 0, left: 10, top: 20, width: 5, height: 5 };
const goodDeleteMark = {
  id: 'delete-1', type: 'delete', pageIndex: 0, sourceObjectId: 'obj-1', kind: 'run',
  left: 10, top: 20, width: 5, height: 5,
};

describe('validateDraftElements', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('passes a valid record through with elements intact', () => {
    const { valid, droppedCount } = validateDraftElements([goodText, goodBlackout]);
    expect(valid).toEqual([goodText, goodBlackout]);
    expect(droppedCount).toBe(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('drops an element with an unrecognized type while good elements survive', () => {
    const { valid, droppedCount } = validateDraftElements([goodText, { id: 'x', type: 'nonsense', pageIndex: 0 }]);
    expect(valid).toEqual([goodText]);
    expect(droppedCount).toBe(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('drops a duplicate id, keeping the first occurrence', () => {
    const dupe = { ...goodBlackout, left: 999 };
    const { valid, droppedCount } = validateDraftElements([goodBlackout, dupe]);
    expect(valid).toEqual([goodBlackout]);
    expect(droppedCount).toBe(1);
  });

  it('drops a non-integer pageIndex', () => {
    const { valid, droppedCount } = validateDraftElements([{ ...goodText, pageIndex: 1.5 }]);
    expect(valid).toEqual([]);
    expect(droppedCount).toBe(1);
  });

  it('drops a negative pageIndex', () => {
    const { valid, droppedCount } = validateDraftElements([{ ...goodText, pageIndex: -1 }]);
    expect(valid).toEqual([]);
    expect(droppedCount).toBe(1);
  });

  it('accepts a Redact delete mark, which is not in the shared registry', () => {
    const { valid, droppedCount } = validateDraftElements([goodDeleteMark]);
    expect(valid).toEqual([goodDeleteMark]);
    expect(droppedCount).toBe(0);
  });

  it('does not log when nothing was dropped', () => {
    validateDraftElements([goodText]);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('migrateDraftRecord', () => {
  it('migrates a legacy style-keyed element to type and stamps the current version', () => {
    const record = { fileName: 'a.pdf', fileBytes: bytesOf(), elements: [{ id: 'e1', pageIndex: 0, style: 'blackout', left: 0, top: 0, width: 1, height: 1 }] };
    const migrated = migrateDraftRecord(record) as any;
    expect(migrated.schemaVersion).toBe(DRAFT_SCHEMA_VERSION);
    expect(migrated.elements[0].type).toBe('blackout');
    expect(migrated.elements[0].style).toBeUndefined();
  });

  it('leaves an already-versioned record unmigrated but re-stamped', () => {
    const record = { fileName: 'a.pdf', fileBytes: bytesOf(), schemaVersion: DRAFT_SCHEMA_VERSION, elements: [goodBlackout] };
    const migrated = migrateDraftRecord(record) as any;
    expect(migrated.elements).toEqual([goodBlackout]);
    expect(migrated.schemaVersion).toBe(DRAFT_SCHEMA_VERSION);
  });
});

describe('validateDraftRecord', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('returns a validated record with valid elements on success', () => {
    const record = { fileName: 'a.pdf', fileType: 'application/pdf', fileBytes: bytesOf(), elements: [goodText] };
    const result = validateDraftRecord(record);
    expect(result).toEqual({ fileName: 'a.pdf', fileType: 'application/pdf', fileBytes: record.fileBytes, elements: [goodText], extra: undefined });
  });

  it('returns null for a missing fileName', () => {
    expect(validateDraftRecord({ fileBytes: bytesOf(), elements: [] })).toBeNull();
  });

  it('returns null for an empty fileName', () => {
    expect(validateDraftRecord({ fileName: '', fileBytes: bytesOf(), elements: [] })).toBeNull();
  });

  it('returns null for missing fileBytes', () => {
    expect(validateDraftRecord({ fileName: 'a.pdf', elements: [] })).toBeNull();
  });

  it('returns null for a non-object record', () => {
    expect(validateDraftRecord(null)).toBeNull();
    expect(validateDraftRecord('nope')).toBeNull();
  });

  it('drops invalid elements but keeps the record', () => {
    const record = { fileName: 'a.pdf', fileBytes: bytesOf(), elements: [goodText, { id: 'bad', type: 'nonsense', pageIndex: 0 }] };
    const result = validateDraftRecord(record);
    expect(result?.elements).toEqual([goodText]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
