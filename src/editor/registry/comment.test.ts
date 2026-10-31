import { describe, expect, it } from 'vitest';
import { getElementDefinition } from './index.ts';
import { validateDraftElements } from './draftValidation.ts';
import type { CommentElement } from '../model/editorModel.ts';

const definition = getElementDefinition('comment');
const good: CommentElement = {
  id: 'c-1', type: 'comment', pageIndex: 0, left: 10, top: 20, width: 50, height: 10, comment: 'Check this',
  commentedAt: 1_790_000_000_000, anchor: { kind: 'point' },
};
const band = { left: 0, top: 0, width: 100, height: 40 };

describe('comment definition', () => {
  it('accepts each anchor kind', () => {
    expect(definition.schema(good)).toBe(true);
    expect(definition.schema({ ...good, anchor: { kind: 'element', elementId: 'h-1' } })).toBe(true);
    expect(definition.schema({ ...good, anchor: { kind: 'passage', bands: [band] } })).toBe(true);
    expect(definition.schema({ ...good, anchor: { kind: 'passage', bands: [band], direction: 'rtl' } })).toBe(true);
  });

  it('accepts a new card with an empty comment and no date', () => {
    const { commentedAt: _at, ...fresh } = good;
    expect(definition.schema({ ...fresh, comment: '' })).toBe(true);
  });

  it('rejects bad anchors', () => {
    expect(definition.schema({ ...good, anchor: undefined })).toBe(false);
    expect(definition.schema({ ...good, anchor: { kind: 'other' } })).toBe(false);
    expect(definition.schema({ ...good, anchor: { kind: 'element', elementId: '' } })).toBe(false);
    expect(definition.schema({ ...good, anchor: { kind: 'element' } })).toBe(false);
    expect(definition.schema({ ...good, anchor: { kind: 'passage', bands: [] } })).toBe(false);
    expect(definition.schema({ ...good, anchor: { kind: 'passage', bands: Array(201).fill(band) } })).toBe(false);
    expect(definition.schema({ ...good, anchor: { kind: 'passage', bands: [{ ...band, width: NaN }] } })).toBe(false);
    expect(definition.schema({ ...good, anchor: { kind: 'passage', bands: [band], direction: 'up' } })).toBe(false);
  });

  it('rejects a bad comment, date or box', () => {
    expect(definition.schema({ ...good, comment: undefined })).toBe(false);
    expect(definition.schema({ ...good, comment: 'x'.repeat(4001) })).toBe(false);
    expect(definition.schema({ ...good, commentedAt: 'today' })).toBe(false);
    expect(definition.schema({ ...good, commentedAt: NaN })).toBe(false);
    expect(definition.schema({ ...good, width: undefined })).toBe(false);
  });

  it('survives validateDraftElements', () => {
    expect(validateDraftElements([good]).valid).toEqual([good]);
  });

  it('creates an empty point comment at the press', () => {
    const created = definition.creation?.create?.({ id: 'c-2', pageIndex: 1, point: { left: 30, top: 40 } } as never);
    expect(created).toEqual({
      id: 'c-2', type: 'comment', pageIndex: 1, left: 30, top: 40, width: 0, height: 0, comment: '', anchor: { kind: 'point' },
    });
  });

  it('has no resize handles', () => {
    expect(definition.resizeBehavior.handles).toEqual([]);
  });
});
