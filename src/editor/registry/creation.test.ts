import { describe, expect, it } from 'vitest';
import { getElementDefinition } from './index.ts';

const context = {
  id: 'el-1', pageIndex: 2, point: { left: 25, top: 40 }, color: '#1463ff',
  whiteoutColor: '#ffffff', strokeWidth: 3, font: 'Arimo', fontSize: 12,
  direction: 'rtl' as const, symbolWidth: 5, symbolHeight: 4,
};

describe('element registry creation factories', () => {
  it('creates point-placed text and symbols from their own modules', () => {
    expect(getElementDefinition('text').creation.create(context)).toMatchObject({
      type: 'text', left: 25, top: 40, fontFamily: 'Arimo', textDirection: 'rtl', autoFocus: true,
    });
    expect(getElementDefinition('symbol').creation.create(context)).toMatchObject({
      type: 'symbol', left: 22.5, top: 38, width: 5, height: 4, mark: 'check',
    });
  });

  it('creates each drag-drawn seed at the pointer origin', () => {
    for (const type of ['rectangle', 'ellipse', 'whiteout', 'line'] as const) {
      const definition = getElementDefinition(type);
      expect(definition.creation.mode).toBe('drag');
      expect(definition.creation.create(context)).toMatchObject({ id: 'el-1', pageIndex: 2 });
    }
    expect(getElementDefinition('line').creation.create(context)).toMatchObject({ x1: 25, y1: 40, x2: 25, y2: 40 });
    expect(getElementDefinition('whiteout').creation.create(context)).toMatchObject({ color: '#ffffff', width: 0, height: 0 });
  });
});
