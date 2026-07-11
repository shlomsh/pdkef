import { describe, expect, it } from 'vitest';
import { getElementDefinition } from './index.ts';

describe('element registry resize handles', () => {
  it('keeps every type’s resize affordances explicit and local to its definition', () => {
    expect(getElementDefinition('text').resizeBehavior.handles).toEqual([
      'top-left', 'top-right', 'bottom-left', 'bottom-right',
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
});
