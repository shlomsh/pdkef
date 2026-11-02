import { describe, expect, it } from 'vitest';
import { DEFAULT_MARKER, MORE_COLORS, TOP_COLORS } from './markerState.ts';
import { keyAction, markKeyIntent, type Layer } from './keys.ts';

const k = (key: string, m: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }> = {}) => ({ key, metaKey: false, ctrlKey: false, shiftKey: false, ...m });
const ctx = (layers: Layer[] = ['toolbar'], typing = false) => ({ typing, layers });

describe('keyAction', () => {
  it('digits 1 to 6 pick colors', () => {
    expect(keyAction(k('1'), ctx())).toEqual({ type: 'color', index: 0 });
    expect(keyAction(k('6'), ctx())).toEqual({ type: 'color', index: 5 });
    expect(keyAction(k('7'), ctx())).toBeNull();
  });
  it('u, c, delete', () => {
    expect(keyAction(k('u'), ctx())).toEqual({ type: 'underline' });
    expect(keyAction(k('U'), ctx())).toEqual({ type: 'underline' });
    expect(keyAction(k('C'), ctx())).toEqual({ type: 'comment' });
    expect(keyAction(k('Delete'), ctx())).toEqual({ type: 'delete' });
    expect(keyAction(k('Backspace'), ctx())).toEqual({ type: 'delete' });
  });
  it('those keys need the toolbar layer', () => {
    for (const key of ['1', 'u', 'c', 'Delete']) expect(keyAction(k(key), ctx([]))).toBeNull();
  });
  it('escape closes the top layer, or nothing', () => {
    expect(keyAction(k('Escape'), ctx(['custom', 'note']))).toEqual({ type: 'closeLayer', layer: 'note' });
    expect(keyAction(k('Escape'), ctx([]))).toEqual({ type: 'closeLayer', layer: null });
  });
  it('undo and redo belong to useHistoryShortcuts, not here', () => {
    expect(keyAction(k('z', { metaKey: true }), ctx())).toBeNull();
    expect(keyAction(k('y', { ctrlKey: true }), ctx())).toBeNull();
  });
  it('zoom', () => {
    expect(keyAction(k('=', { metaKey: true }), ctx())).toEqual({ type: 'zoom', dir: 1 });
    expect(keyAction(k('+', { metaKey: true, shiftKey: true }), ctx())).toEqual({ type: 'zoom', dir: 1 });
    expect(keyAction(k('-', { ctrlKey: true }), ctx())).toEqual({ type: 'zoom', dir: -1 });
    expect(keyAction(k('0', { metaKey: true }), ctx())).toEqual({ type: 'zoomActual' });
  });
  it('a modified digit or letter is not a marker key', () => {
    expect(keyAction(k('1', { metaKey: true }), ctx())).toBeNull();
    expect(keyAction(k('c', { ctrlKey: true }), ctx())).toBeNull();
  });
  it('while typing only escape acts', () => {
    expect(keyAction(k('1'), ctx(['toolbar'], true))).toBeNull();
    expect(keyAction(k('0', { metaKey: true }), ctx(['toolbar'], true))).toBeNull();
    expect(keyAction(k('Escape'), ctx(['note'], true))).toEqual({ type: 'closeLayer', layer: 'note' });
  });
});

describe('markKeyIntent', () => {
  const look = { ...DEFAULT_MARKER };
  it('R9: the color keys follow the panel, the three shown first and then More, and U flips the style either way', () => {
    expect(markKeyIntent({ type: 'color', index: 1 }, look)).toEqual({ change: { color: TOP_COLORS[1].hex } });
    expect(markKeyIntent({ type: 'color', index: 3 }, look)).toEqual({ change: { color: MORE_COLORS[0].hex } });
    expect(markKeyIntent({ type: 'underline' }, look)).toEqual({ change: { style: 'underline' } });
    expect(markKeyIntent({ type: 'underline' }, { ...look, style: 'underline' })).toEqual({ change: { style: 'highlight' } });
  });
  it('C comments and Delete deletes', () => {
    expect(markKeyIntent({ type: 'comment' }, look)).toEqual({ comment: true });
    expect(markKeyIntent({ type: 'delete' }, look)).toEqual({ delete: true });
  });
  it('leaves Esc and zoom to their own owners', () => {
    expect(markKeyIntent({ type: 'closeLayer', layer: 'toolbar' }, look)).toBeNull();
    expect(markKeyIntent({ type: 'zoom', dir: 1 }, look)).toBeNull();
  });
});
