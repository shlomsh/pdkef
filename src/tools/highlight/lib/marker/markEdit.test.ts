import { describe, expect, it } from 'vitest';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { buildMarkEdit, changePatch, markOf } from './markEdit.ts';

const el: HighlightElement = {
  id: 'h1', type: 'highlight', pageIndex: 2, left: 10, top: 20, width: 30, height: 4,
  color: '#FFF34D', bands: [{ left: 0, top: 0, width: 100, height: 100 }],
};
const describeKind = (kind: string) => `Changed (${kind})`;

describe('markOf', () => {
  it('reads a plain highlight as the default look', () => {
    expect(markOf(el)).toEqual({ color: '#FFF34D', style: 'highlight', opacity: 1 });
  });
  it('reads underline and opacity', () => {
    expect(markOf({ ...el, style: 'underline', opacity: 0.5, color: '#FF8080' })).toEqual({ color: '#FF8080', style: 'underline', opacity: 0.5 });
  });
});

describe('READ-04: stroke width', () => {
  it('markOf reads strokeWidth only when set', () => {
    expect(markOf({ ...el, style: 'underline', strokeWidth: 3 })).toMatchObject({ strokeWidth: 3 });
    expect('strokeWidth' in markOf(el)).toBe(false);
  });
  it('buildMarkEdit writes a clamped strokeWidth with a history entry, and the default is the absent key', () => {
    const { changes, entry } = buildMarkEdit({ ...el, style: 'underline' }, { strokeWidth: 9 }, describeKind);
    expect(changes).toEqual({ strokeWidth: 4 });
    expect(entry).not.toBeNull();
    expect(changePatch({ strokeWidth: 3 })).toHaveProperty('strokeWidth', undefined);
  });
});

describe('changePatch', () => {
  it('only carries the keys that changed', () => {
    expect(changePatch({ color: '#FF8080' })).toEqual({ color: '#FF8080' });
  });
  it('a highlight style and a full opacity are the absent keys', () => {
    const patch = changePatch({ style: 'highlight', opacity: 1 });
    expect(patch).toHaveProperty('style', undefined);
    expect(patch).toHaveProperty('opacity', undefined);
    expect(Object.keys(patch).sort()).toEqual(['opacity', 'style']);
  });
  it('underline and a partial opacity are written, opacity kept within 0.3 to 1', () => {
    expect(changePatch({ style: 'underline', opacity: 0.55 })).toEqual({ style: 'underline', opacity: 0.55 });
    expect(changePatch({ opacity: 0.01 })).toEqual({ opacity: 0.3 });
  });
});

describe('buildMarkEdit', () => {
  it('gives the changes and one style step for the history', () => {
    const edit = buildMarkEdit(el, { color: '#FF8080' }, describeKind);
    expect(edit.changes).toEqual({ color: '#FF8080' });
    expect(edit.entry).toMatchObject({
      operation: 'update', type: 'STYLE_ELEMENT', pageIndex: 2, description: 'Changed (style)',
      updates: [{ id: 'h1', before: { color: '#FFF34D' }, after: { color: '#FF8080' } }],
    });
  });
  it('undoing an underline clears the key again', () => {
    const edit = buildMarkEdit(el, { style: 'underline' }, describeKind);
    expect(edit.entry).toMatchObject({ updates: [{ before: { style: undefined }, after: { style: 'underline' } }] });
  });
  it('has no step when nothing changes', () => {
    expect(buildMarkEdit(el, { color: '#FFF34D', style: 'highlight', opacity: 1 }, describeKind).entry).toBeNull();
  });
});

describe('READ-11: stroke', () => {
  it('markOf reads the stroke only when set', () => {
    expect(markOf({ ...el, stroke: 'sketch' })).toMatchObject({ stroke: 'sketch' });
    expect('stroke' in markOf(el)).toBe(false);
  });
  it('a change to sketch writes it, a change back to Clean is the absent key, and it round-trips', () => {
    expect(changePatch({ stroke: 'sketch' })).toEqual({ stroke: 'sketch' });
    expect(changePatch({ stroke: undefined })).toHaveProperty('stroke', undefined);
    expect(changePatch({ color: '#FF8080' })).not.toHaveProperty('stroke');
    const { changes, entry } = buildMarkEdit(el, { stroke: 'sketch' }, describeKind);
    expect(changes).toEqual({ stroke: 'sketch' });
    expect(entry).not.toBeNull();
    const sketched = { ...el, ...changes };
    expect(markOf(sketched).stroke).toBe('sketch');
    const back = buildMarkEdit(sketched, { stroke: undefined }, describeKind);
    expect(back.changes).toHaveProperty('stroke', undefined);
    expect(back.entry).not.toBeNull();
  });
});
