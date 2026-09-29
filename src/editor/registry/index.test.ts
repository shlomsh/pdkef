import { describe, expect, it } from 'vitest';
import { getElementDefinition } from './index.ts';

describe('element registry resize handles', () => {
  it('keeps every type’s resize affordances explicit and local to its definition', () => {
    // Text always exposes both: corners (font size) and sides (comb span -
    // dragging one is what turns comb on, so there's nothing left to gate).
    expect(getElementDefinition('text').resizeBehavior.handles).toEqual([
      'top-left', 'top-right', 'bottom-left', 'bottom-right', 'left', 'right',
    ]);
    expect(getElementDefinition('line').resizeBehavior.handles).toEqual([
      'line-start', 'line-end',
    ]);

    for (const type of ['rectangle', 'ellipse', 'whiteout'] as const) {
      expect(getElementDefinition(type).resizeBehavior.handles).toHaveLength(8);
    }

    for (const type of ['symbol', 'signature'] as const) {
      expect(getElementDefinition(type).resizeBehavior.handles).toHaveLength(4);
    }
  });

  it('gives strokes no resize handles: they are not resizable', () => {
    for (const type of ['blurStroke', 'whiteoutStroke'] as const) {
      expect(getElementDefinition(type).resizeBehavior.handles).toEqual([]);
    }
  });

  it('serializes a stroke into a redaction instruction only for the destructive flatten', () => {
    const stroke = { id: 's', type: 'whiteoutStroke', pageIndex: 0, left: 1, top: 1, width: 2, height: 2, points: [[1, 1]] as [number, number][], sizePt: 5, color: '#fff' } as const;
    const definition = getElementDefinition('whiteoutStroke');
    expect(definition.serialize(stroke, { redaction: true } as any)).toEqual({ kind: 'solid', element: stroke });
    expect(definition.serialize(stroke, {} as any)).toBeUndefined();
    const blur = { ...stroke, type: 'blurStroke' } as any;
    expect(getElementDefinition('blurStroke').serialize(blur, { redaction: true } as any)).toMatchObject({ kind: 'blur' });
  });
});
