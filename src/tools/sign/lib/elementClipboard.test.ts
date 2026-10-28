import { describe, expect, it } from 'vitest';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { clipboardText, offsetClone } from './elementClipboard.ts';

const text = { id: 't', type: 'text', pageIndex: 0, left: 10, top: 20, width: 30, height: 5, text: 'Hello' } as unknown as EditorElement;
const line = { id: 'l', type: 'line', pageIndex: 1, x1: 50, y1: 60, x2: 98, y2: 99 } as unknown as EditorElement;
const symbol = { id: 's', type: 'symbol', pageIndex: 0, left: 88, top: 89, width: 3, height: 3 } as unknown as EditorElement;

describe('elementClipboard', () => {
  it('copies a text box as its text and anything else as a placeholder', () => {
    expect(clipboardText(text)).toBe('Hello');
    expect(clipboardText(line)).toBe('[line]');
  });

  it('nudges a pasted box and keeps it on the page', () => {
    expect(offsetClone(text, 'new')).toMatchObject({ id: 'new', left: 14, top: 24, text: 'Hello' });
    expect(offsetClone(symbol, 'new')).toMatchObject({ left: 90, top: 90 });
  });

  it('nudges both endpoints of a line and clamps at the page edge', () => {
    expect(offsetClone(line, 'new')).toMatchObject({ id: 'new', x1: 54, y1: 64, x2: 100, y2: 100 });
  });
});
