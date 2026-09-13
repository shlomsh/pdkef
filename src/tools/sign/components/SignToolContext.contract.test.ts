import { describe, expect, it } from 'vitest';
import type { SignToolAction } from './SignToolContext.tsx';

describe('SignToolAction contract', () => {
  it('accepts a complete typed add action', () => {
    const action: SignToolAction = {
      type: 'ADD_ELEMENT',
      payload: {
        id: 'text-1',
        type: 'text',
        pageIndex: 0,
        left: 10,
        top: 20,
        text: 'Hello',
      },
    };

    expect(action.payload.type).toBe('text');
  });

  it('does not permit malformed reducer payloads at compile time', () => {
    // @ts-expect-error element ids are strings, never page numbers
    const invalidDelete: SignToolAction = { type: 'DELETE_ELEMENT', payload: 1 };
    const invalidPatch: SignToolAction = {
      type: 'UPDATE_ELEMENT',
      // @ts-expect-error element identity cannot be changed through UPDATE_ELEMENT
      payload: { id: 'text-1', changes: { id: 'other-element' } },
    };

    expect(invalidDelete).toBeDefined();
    expect(invalidPatch).toBeDefined();
  });
});
