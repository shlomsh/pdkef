import { describe, expect, it } from 'vitest';
import { getElementDefinition } from './index.ts';

describe('element registry resize handles', () => {
  it('keeps every type’s resize affordances explicit and local to its definition', () => {
    // Text declares its handles as a function of the element: a plain text box
    // keeps exactly the four font-size corners, and comb adds the two side
    // handles that set the span.
    const textHandles = getElementDefinition('text').resizeBehavior.handles as (element: unknown) => readonly string[];
    expect(textHandles({ type: 'text' })).toEqual([
      'top-left', 'top-right', 'bottom-left', 'bottom-right',
    ]);
    expect(textHandles({ type: 'text', comb: true })).toEqual([
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
});
