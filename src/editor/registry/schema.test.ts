import { describe, expect, it } from 'vitest';
import { getElementDefinition } from './index.ts';

const validElements = {
  text: { id: 'text-1', type: 'text', pageIndex: 0, left: 10, top: 20, text: 'Hello' },
  symbol: { id: 'symbol-1', type: 'symbol', pageIndex: 0, left: 10, top: 20, width: 5, height: 5 },
  signature: { id: 'signature-1', type: 'signature', pageIndex: 0, left: 10, top: 20, width: 5, height: 5, dataUrl: 'data:image/png;base64,AA==' },
  rectangle: { id: 'rectangle-1', type: 'rectangle', pageIndex: 0, left: 10, top: 20, width: 5, height: 5 },
  ellipse: { id: 'ellipse-1', type: 'ellipse', pageIndex: 0, left: 10, top: 20, width: 5, height: 5 },
  whiteout: { id: 'whiteout-1', type: 'whiteout', pageIndex: 0, left: 10, top: 20, width: 5, height: 5 },
  line: { id: 'line-1', type: 'line', pageIndex: 0, x1: 10, y1: 20, x2: 15, y2: 25 },
} as const;

describe('element registry schemas', () => {
  it.each(Object.entries(validElements))('accepts a valid %s element', (type, element) => {
    expect(getElementDefinition(type as keyof typeof validElements).schema(element)).toBe(true);
  });

  it.each(Object.entries(validElements))('rejects a %s element without an id', (type, element) => {
    const { id: _id, ...withoutId } = element;
    expect(getElementDefinition(type as keyof typeof validElements).schema(withoutId)).toBe(false);
  });

  it('rejects non-finite geometry', () => {
    expect(getElementDefinition('rectangle').schema({ ...validElements.rectangle, width: Infinity })).toBe(false);
  });
});
