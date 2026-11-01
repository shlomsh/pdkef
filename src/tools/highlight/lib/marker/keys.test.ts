import { describe, expect, it } from 'vitest';
import { keyAction, type Layer } from './keys.ts';

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
  it('undo, redo', () => {
    expect(keyAction(k('z', { metaKey: true }), ctx())).toEqual({ type: 'undo' });
    expect(keyAction(k('z', { ctrlKey: true }), ctx())).toEqual({ type: 'undo' });
    expect(keyAction(k('Z', { metaKey: true, shiftKey: true }), ctx())).toEqual({ type: 'redo' });
    expect(keyAction(k('y', { ctrlKey: true }), ctx())).toEqual({ type: 'redo' });
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
    expect(keyAction(k('z', { metaKey: true }), ctx(['toolbar'], true))).toBeNull();
    expect(keyAction(k('Escape'), ctx(['note'], true))).toEqual({ type: 'closeLayer', layer: 'note' });
  });
});
