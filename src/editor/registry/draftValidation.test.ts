import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRAFT_SCHEMA_VERSION,
  dropUnsafeUpdates,
  isDraftElement,
  migrateDraftRecord,
  validateDocumentStyle,
  validateDraftElements,
  validateDraftRecord,
  type DraftElement,
} from './draftValidation.ts';
import { applyHistoryEntries, revertHistoryEntries } from '../model/actionHistory.ts';

const bytesOf = (length = 4) => new ArrayBuffer(length);

const goodText = { id: 'text-1', type: 'text', pageIndex: 0, left: 10, top: 20, text: 'Hello' };
const goodBlackout = { id: 'blackout-1', type: 'blackout', pageIndex: 0, left: 10, top: 20, width: 5, height: 5 };
const goodDeleteElement = {
  id: 'delete-1', type: 'delete', pageIndex: 0, sourceObjectId: 'obj-1', kind: 'run',
  left: 10, top: 20, width: 5, height: 5, start: 100, end: 120,
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

  it('accepts a Redact delete element, which is not in the shared registry', () => {
    const { valid, droppedCount } = validateDraftElements([goodDeleteElement]);
    expect(valid).toEqual([goodDeleteElement]);
    expect(droppedCount).toBe(0);
  });

  it('accepts a delete element with no formPath (older drafts) or a string[] formPath', () => {
    const withPath = { ...goodDeleteElement, id: 'delete-2', formPath: ['7 0 R', '9 0 R'] };
    expect(validateDraftElements([goodDeleteElement, withPath]).valid).toEqual([goodDeleteElement, withPath]);
    expect(validateDraftElements([{ ...goodDeleteElement, formPath: [] }]).droppedCount).toBe(0);
  });

  it('drops a delete element whose formPath is not an array of strings', () => {
    for (const formPath of ['7 0 R', [7], [null], {}, null]) {
      const { valid, droppedCount } = validateDraftElements([{ ...goodDeleteElement, formPath }]);
      expect(valid).toEqual([]);
      expect(droppedCount).toBe(1);
    }
  });

  it('drops a delete element missing its byte span (start/end)', () => {
    const { start, end, ...withoutSpan } = goodDeleteElement;
    const { valid, droppedCount } = validateDraftElements([withoutSpan]);
    expect(valid).toEqual([]);
    expect(droppedCount).toBe(1);
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

  it('migrates legacy add history into a self-contained command', () => {
    const record = {
      fileName: 'a.pdf',
      fileBytes: bytesOf(),
      schemaVersion: 1,
      elements: [goodText],
      extra: {
        actionHistory: [{
          id: 'history-1', type: 'ADD_TEXT', elementId: goodText.id, pageIndex: 0,
          description: 'Added text box', timestamp: 10, snapshot: null,
        }],
      },
    };

    const migrated = migrateDraftRecord(record) as Record<string, any>;
    expect(migrated.extra.actionHistory).toEqual([{
      id: 'history-1',
      type: 'ADD_TEXT',
      operation: 'add',
      pageIndex: 0,
      description: 'Added text box',
      timestamp: 10,
      elements: [{ element: goodText, index: 0 }],
    }]);
  });

  it('drops a legacy delete command whose original stacking index is unknowable', () => {
    const record = {
      fileName: 'a.pdf',
      fileBytes: bytesOf(),
      schemaVersion: 1,
      elements: [goodText],
      extra: {
        actionHistory: [{
          id: 'history-1', type: 'DELETE_ELEMENT', elementId: goodBlackout.id, pageIndex: 0,
          description: 'Deleted blackout', timestamp: 10, snapshot: [goodBlackout],
        }],
      },
    };

    const migrated = migrateDraftRecord(record) as Record<string, any>;
    expect(migrated.extra.actionHistory).toEqual([]);
  });
});

describe('validateDraftRecord', () => {
  it('RED-03: keeps a restored history command that added boxes across several pages', () => {
    const copies = [1, 2, 3].map((pageIndex) => ({ ...goodBlackout, id: `blackout-p${pageIndex}`, pageIndex }));
    const repeat = {
      id: 'history-repeat', type: 'REPEAT_ON_EVERY_PAGE', operation: 'add', pageIndex: 0,
      description: 'Added the box to 3 more pages', timestamp: 10,
      elements: copies.map((element, i) => ({ element, index: 1 + i })),
    };
    const record = {
      fileName: 'a.pdf', fileBytes: bytesOf(), schemaVersion: DRAFT_SCHEMA_VERSION,
      elements: [goodBlackout, ...copies], extra: { actionHistory: [repeat] },
    };
    const result = validateDraftRecord(record);
    expect(result?.elements).toHaveLength(4);
    expect(result?.extra?.actionHistory).toEqual([repeat]);
  });

  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  // SIGN-33 folds SIGN-32's flat carriedFont/carriedFontSize/carriedDirection
  // into one `carried` object, validated key by key: a bad value drops only
  // itself, never the rest of the object.
  const goodCarried = {
    font: 'Caveat', fontSize: 13.5, direction: 'rtl', color: '#112233', textAlign: 'center',
    bold: true, italic: false, dateFormat: 'iso', symbolMark: 'x', symbolWidth: 6, strokeWidth: 2,
    whiteoutColor: '#ffffff', signatureWidth: 30,
  };

  it('keeps a fully valid carried style, key for key', () => {
    const record = { fileName: 'a.pdf', fileBytes: bytesOf(), elements: [], extra: { carried: goodCarried } };
    expect(validateDraftRecord(record)?.extra?.carried).toEqual(goodCarried);
  });

  it.each([
    ['font', 'empty string', { font: '' }],
    ['font', 'wrong type', { font: 7 }],
    ['fontSize', 'string', { fontSize: '18' }],
    ['fontSize', 'negative', { fontSize: -5 }],
    ['fontSize', 'zero', { fontSize: 0 }],
    ['direction', 'unrelated string', { direction: 'up' }],
    ['direction', 'wrong type', { direction: 1 }],
    ['color', 'empty string', { color: '' }],
    ['textAlign', 'unknown enum value', { textAlign: 'middle' }],
    ['bold', 'wrong type', { bold: 'yes' }],
    ['italic', 'wrong type', { italic: 1 }],
    ['dateFormat', 'unknown format id', { dateFormat: 'not-a-format' }],
    ['symbolMark', 'unknown mark', { symbolMark: 'star' }],
    ['symbolWidth', 'zero', { symbolWidth: 0 }],
    ['strokeWidth', 'negative', { strokeWidth: -1 }],
    ['whiteoutColor', 'empty string', { whiteoutColor: '' }],
    ['signatureWidth', 'negative', { signatureWidth: -10 }],
  ])('drops only a malformed %s (%s), keeping every other key', (key, _label, badPatch) => {
    const carried = { ...goodCarried, ...badPatch };
    const record = { fileName: 'a.pdf', fileBytes: bytesOf(), elements: [goodText], extra: { carried } };
    const result = validateDraftRecord(record);
    expect(result?.elements).toEqual([goodText]);
    const resultCarried = result?.extra?.carried as Record<string, unknown>;
    expect(resultCarried[key]).toBeUndefined();
    const { [key]: _dropped, ...expectedRest } = goodCarried as Record<string, unknown>;
    expect(resultCarried).toEqual(expectedRest);
  });

  it('an absent or non-record carried value comes back as {}, not undefined', () => {
    const missing = validateDraftRecord({ fileName: 'a.pdf', fileBytes: bytesOf(), elements: [], extra: {} });
    expect(missing?.extra?.carried).toEqual({});
    const notARecord = validateDraftRecord({ fileName: 'a.pdf', fileBytes: bytesOf(), elements: [], extra: { carried: 'nope' } });
    expect(notARecord?.extra?.carried).toEqual({});
  });

  it('extra missing entirely leaves carried undefined, not {}', () => {
    const result = validateDraftRecord({ fileName: 'a.pdf', fileBytes: bytesOf(), elements: [] });
    expect(result?.extra).toBeUndefined();
  });

  it('migrates a SIGN-32 draft\'s flat carriedFont/carriedFontSize/carriedDirection into carried', () => {
    const record = {
      fileName: 'a.pdf', fileBytes: bytesOf(), elements: [],
      extra: { carriedFont: 'David', carriedFontSize: 18, carriedDirection: 'rtl' },
    };
    expect(validateDraftRecord(record)?.extra?.carried).toEqual({ font: 'David', fontSize: 18, direction: 'rtl' });
  });

  it('drops a malformed legacy carriedFont/carriedFontSize/carriedDirection during migration, the same rule as any other key', () => {
    const record = {
      fileName: 'a.pdf', fileBytes: bytesOf(), elements: [],
      extra: { carriedFont: '', carriedFontSize: -5, carriedDirection: 'up' },
    };
    expect(validateDraftRecord(record)?.extra?.carried).toEqual({});
  });

  it('a SIGN-33 carried key always wins over a same-key SIGN-32 legacy field', () => {
    const record = {
      fileName: 'a.pdf', fileBytes: bytesOf(), elements: [],
      extra: { carried: { font: 'Arimo' }, carriedFont: 'David', carriedFontSize: 18 },
    };
    expect(validateDraftRecord(record)?.extra?.carried).toEqual({ font: 'Arimo', fontSize: 18 });
  });

  it('a legacy field fills a key the SIGN-33 carried object never mentions', () => {
    const record = {
      fileName: 'a.pdf', fileBytes: bytesOf(), elements: [],
      extra: { carried: { color: '#112233' }, carriedDirection: 'rtl' },
    };
    expect(validateDraftRecord(record)?.extra?.carried).toEqual({ color: '#112233', direction: 'rtl' });
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

  it('keeps a valid add and a valid update in order, dropping only a malformed update', () => {
    const validAdd = {
      id: 'history-1', type: 'ADD_TEXT', operation: 'add', pageIndex: 0,
      description: 'Added text box', timestamp: 10, elements: [{ element: goodText, index: 0 }],
    };
    const validUpdate = {
      id: 'history-2', type: 'MOVE_ELEMENT', operation: 'update', pageIndex: 0,
      description: 'Moved', timestamp: 20,
      updates: [{ id: goodText.id, before: { left: 10 }, after: { left: 20 } }],
    };
    const malformedUpdate = {
      id: 'history-3', type: 'MOVE_ELEMENT', operation: 'update', pageIndex: 0,
      description: 'Moved', timestamp: 30,
      updates: [{ id: goodText.id, before: { left: 20, top: 5 }, after: { left: 30 } }],
    };
    const record = {
      fileName: 'a.pdf', fileBytes: bytesOf(), elements: [goodText],
      extra: { actionHistory: [validAdd, validUpdate, malformedUpdate] },
    };

    const result = validateDraftRecord(record);
    expect(result?.extra?.actionHistory).toEqual([validAdd, validUpdate]);
  });

  it('caps a 150-entry history at 100, keeping the newest-first head', () => {
    const entries = Array.from({ length: 150 }, (_, i) => ({
      id: `history-${i}`, type: 'MOVE_ELEMENT', operation: 'update', pageIndex: 0,
      description: 'Moved', timestamp: i,
      updates: [{ id: goodText.id, before: { left: i }, after: { left: i + 1 } }],
    }));
    const record = {
      fileName: 'a.pdf', fileBytes: bytesOf(), elements: [goodText],
      extra: { actionHistory: entries },
    };

    const result = validateDraftRecord(record);
    expect(result?.extra?.actionHistory).toHaveLength(100);
    expect(result?.extra?.actionHistory).toEqual(entries.slice(0, 100));
  });

  it('validates persisted history snapshots and drops malformed commands', () => {
    const validHistory = {
      id: 'history-1',
      type: 'ADD_TEXT',
      operation: 'add',
      pageIndex: 0,
      description: 'Added text box',
      timestamp: 10,
      elements: [{ element: goodText, index: 0 }],
    };
    const record = {
      fileName: 'a.pdf', fileBytes: bytesOf(), elements: [goodText],
      extra: {
        actionHistory: [
          validHistory,
          { ...validHistory, id: 'history-2', elements: [{ element: goodText, index: 'front' }] },
        ],
      },
    };

    const result = validateDraftRecord(record);
    expect(result?.extra?.actionHistory).toEqual([validHistory]);
    expect(errorSpy).toHaveBeenCalledWith('draftValidation: dropped 1 invalid history command(s)');
  });
});

describe('dropUnsafeUpdates', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('drops an update whose after would produce an unrecognized type, the rest surviving in order', () => {
    // Newest-first: h3 (valid), h2 (corrupt after.type), h1 (valid, older).
    const h3 = {
      id: 'h3', type: 'MOVE_ELEMENT', operation: 'update', pageIndex: 0,
      description: 'Moved', timestamp: 30, updates: [{ id: goodText.id, before: { left: 20 }, after: { left: 30 } }],
    };
    const h2 = {
      id: 'h2', type: 'CORRUPT', operation: 'update', pageIndex: 0,
      description: 'Corrupt', timestamp: 20, updates: [{ id: goodText.id, before: { type: 'text' }, after: { type: 'bogus' } }],
    };
    const h1 = {
      id: 'h1', type: 'MOVE_ELEMENT', operation: 'update', pageIndex: 0,
      description: 'Moved', timestamp: 10, updates: [{ id: goodText.id, before: { left: 10 }, after: { left: 20 } }],
    };

    const result = dropUnsafeUpdates([goodText] as DraftElement[], [h3, h2, h1] as any, isDraftElement);
    expect(result).toEqual([h3, h1]);
    expect(errorSpy).toHaveBeenCalledWith('draftValidation: dropped 1 update(s) that would corrupt an element');
  });

  it('keeps a valid update on an element a newer delete entry removed, restoring it first', () => {
    const deleteEntry = {
      id: 'd1', type: 'DELETE_ELEMENT', operation: 'delete', pageIndex: 0,
      description: 'Deleted', timestamp: 20, elements: [{ element: goodText, index: 0 }],
    };
    const updateEntry = {
      id: 'u1', type: 'MOVE_ELEMENT', operation: 'update', pageIndex: 0,
      description: 'Moved', timestamp: 10, updates: [{ id: goodText.id, before: { left: 5 }, after: { left: 10 } }],
    };

    // The live document has no elements: the delete really happened.
    const result = dropUnsafeUpdates([], [deleteEntry, updateEntry] as any, isDraftElement);
    expect(result).toEqual([deleteEntry, updateEntry]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('keeps an update whose element is absent everywhere, applying it would be a no-op', () => {
    const updateEntry = {
      id: 'u1', type: 'MOVE_ELEMENT', operation: 'update', pageIndex: 0,
      description: 'Moved', timestamp: 10, updates: [{ id: 'ghost', before: { type: 'bogus' }, after: { type: 'also-bogus' } }],
    };

    const result = dropUnsafeUpdates([], [updateEntry] as any, isDraftElement);
    expect(result).toEqual([updateEntry]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('returns a fully valid history unchanged', () => {
    const validAdd = {
      id: 'history-1', type: 'ADD_TEXT', operation: 'add', pageIndex: 0,
      description: 'Added text box', timestamp: 10, elements: [{ element: goodText, index: 0 }],
    };
    const validUpdate = {
      id: 'history-2', type: 'MOVE_ELEMENT', operation: 'update', pageIndex: 0,
      description: 'Moved', timestamp: 20,
      updates: [{ id: goodText.id, before: { left: 10 }, after: { left: 20 } }],
    };

    const result = dropUnsafeUpdates([goodText] as DraftElement[], [validUpdate, validAdd] as any, isDraftElement);
    expect(result).toEqual([validUpdate, validAdd]);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('RED-30: blur strength migration', () => {
  const blur = { id: 'blur-1', type: 'blur', pageIndex: 0, left: 1, top: 2, width: 30, height: 10 };

  it('turns legacy strings into numbers in elements and history without adding or dropping entries', () => {
    const record = {
      fileName: 'a.pdf', fileBytes: bytesOf(), schemaVersion: DRAFT_SCHEMA_VERSION,
      elements: [{ ...blur, strength: 'strong' }, { ...blur, id: 'blur-2' }],
      extra: {
        actionHistory: [{
          id: 'h1', type: 'UPDATE_ELEMENT', operation: 'update', pageIndex: 0, description: 'x', timestamp: 1,
          updates: [{ id: 'blur-1', before: { strength: 'light' }, after: { strength: 'strong' } }],
        }, {
          id: 'h2', type: 'DELETE_ELEMENT', operation: 'delete', pageIndex: 0, description: 'y', timestamp: 2,
          elements: [{ element: { ...blur, id: 'gone', strength: 'medium' }, index: 0 }],
        }],
      },
    };
    const migrated = migrateDraftRecord(record) as Record<string, any>;
    expect(migrated.elements[0].strength).toBe(0.5);
    expect('strength' in migrated.elements[1]).toBe(false);
    expect(migrated.extra.actionHistory).toHaveLength(2);
    expect(migrated.extra.actionHistory[0].updates[0]).toEqual({ id: 'blur-1', before: { strength: 0.3 }, after: { strength: 0.5 } });
    expect(migrated.extra.actionHistory[1].elements[0].element.strength).toBe(0.4);
    // Idempotent.
    expect(migrateDraftRecord(migrated)).toEqual(migrated);
  });

  it('accepts both a legacy string and a number as a valid blur element', () => {
    expect(isDraftElement({ ...blur, strength: 'strong' })).toBe(true);
    expect(isDraftElement({ ...blur, strength: 0.15 })).toBe(true);
    expect(isDraftElement({ ...blur, strength: 'bogus' })).toBe(false);
  });

  it('an old draft with strong in its history undoes and redoes to 0.5 (and back to the original 0.3)', () => {
    const record = {
      fileName: 'a.pdf', fileBytes: bytesOf(), schemaVersion: 2,
      elements: [{ ...blur, strength: 'strong' }],
      extra: { actionHistory: [{
        id: 'h1', type: 'UPDATE_ELEMENT', operation: 'update', pageIndex: 0, description: 'x', timestamp: 1,
        updates: [{ id: 'blur-1', before: { strength: 'light' }, after: { strength: 'strong' } }],
      }] },
    };
    const migrated = migrateDraftRecord(record) as Record<string, any>;
    const [entry] = migrated.extra.actionHistory;
    const live = migrated.elements as any[];
    const undone = revertHistoryEntries(live, [entry]);
    expect(undone[0].strength).toBe(0.3);
    const redone = applyHistoryEntries(undone, [entry]);
    expect(redone[0].strength).toBe(0.5);
  });
});

describe('brush strokes (RED-32)', () => {
  const stroke = {
    id: 'st-1', pageIndex: 0, left: 10, top: 10, width: 20, height: 5,
    points: [[12, 12], [25, 13]], sizePt: 14,
  };
  const whiteoutStroke = { ...stroke, type: 'whiteoutStroke', color: '#e0e0e0' };
  const blurStroke = { ...stroke, id: 'st-2', type: 'blurStroke', strength: 'light' };

  it('accepts both stroke types, with or without a blur strength', () => {
    expect(isDraftElement(whiteoutStroke)).toBe(true);
    expect(isDraftElement(blurStroke)).toBe(true);
    const { strength: _drop, ...noStrength } = blurStroke;
    expect(isDraftElement(noStrength)).toBe(true);
  });

  it('rejects points outside 0..100, non-finite or malformed pairs, and empty lists', () => {
    expect(isDraftElement({ ...whiteoutStroke, points: [[12, 101]] })).toBe(false);
    expect(isDraftElement({ ...whiteoutStroke, points: [[-1, 5]] })).toBe(false);
    expect(isDraftElement({ ...whiteoutStroke, points: [[NaN, 5]] })).toBe(false);
    expect(isDraftElement({ ...whiteoutStroke, points: [[1, 2, 3]] })).toBe(false);
    expect(isDraftElement({ ...whiteoutStroke, points: [] })).toBe(false);
    expect(isDraftElement({ ...whiteoutStroke, points: 'nope' })).toBe(false);
  });

  it('rejects a brush size outside 1..200, a missing color on whiteout, an unknown strength and a missing bbox', () => {
    expect(isDraftElement({ ...whiteoutStroke, sizePt: 0.5 })).toBe(false);
    expect(isDraftElement({ ...whiteoutStroke, sizePt: 201 })).toBe(false);
    expect(isDraftElement({ ...whiteoutStroke, color: undefined })).toBe(false);
    expect(isDraftElement({ ...blurStroke, strength: 'huge' })).toBe(false);
    expect(isDraftElement({ ...whiteoutStroke, width: undefined })).toBe(false);
  });

  it('keeps an add entry for a stroke so undo still reaches it after a reload', () => {
    const record = validateDraftRecord({
      fileName: 'a.pdf',
      fileBytes: bytesOf(),
      elements: [whiteoutStroke],
      extra: {
        actionHistory: [{
          id: 'h1', type: 'whiteoutStroke', operation: 'add', pageIndex: 0, description: 'Whiteout stroke',
          timestamp: 1, elements: [{ element: whiteoutStroke, index: 0 }],
        }],
      },
    });
    expect(record?.elements).toEqual([whiteoutStroke]);
    expect(record?.extra?.actionHistory).toHaveLength(1);
  });
});

describe('carried blur strength (RED-40)', () => {
  it('round-trips a numeric strength and resolves a legacy name', () => {
    expect(validateDocumentStyle({ blurStrength: 0.25 })).toEqual({ blurStrength: 0.25 });
    expect(validateDocumentStyle({ blurStrength: 'light' })).toEqual({ blurStrength: 0.3 });
    expect(validateDocumentStyle({ blurStrength: 'loud' })).toEqual({});
  });
});
