import { describe, expect, it } from 'vitest';
import { highlightReducer, initialHighlightState, type HighlightState } from './highlightState.ts';

describe('highlightReducer LOAD_DOCUMENT', () => {
  it('restores the page turns of a draft', () => {
    const state = highlightReducer(initialHighlightState, {
      type: 'LOAD_DOCUMENT', payload: { elements: [], actionHistory: [], pageTurns: { 2: 3 } },
    });
    expect(state.pageTurns).toEqual({ 2: 3 });
  });

  it('restores {} for a draft saved before page turns existed', () => {
    const turned: HighlightState = { ...initialHighlightState, pageTurns: { 0: 1 as never } };
    const state = highlightReducer(turned, { type: 'LOAD_DOCUMENT', payload: { elements: [], actionHistory: [] } });
    expect(state.pageTurns).toEqual({});
  });
});
