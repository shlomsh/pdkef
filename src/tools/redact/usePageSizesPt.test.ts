import { describe, expect, it } from 'vitest';
import { needsPageSizes } from './usePageSizesPt.ts';
import type { RedactElement } from './redactElements.ts';

// Only `type` matters to the rule, so the fixtures carry just that.
const of = (type: string): RedactElement => ({ id: type, pageIndex: 0, type }) as unknown as RedactElement;

describe('needsPageSizes (RED-52)', () => {
  it('a document with nothing drawn reads nothing', () => {
    expect(needsPageSizes([], false)).toBe(false);
    expect(needsPageSizes([of('delete'), of('delete')], false)).toBe(false);
  });

  it('every box and stroke reads them, a delete mark does not change that', () => {
    for (const type of ['whiteout', 'blackout', 'blur', 'whiteoutStroke', 'blurStroke']) {
      expect(needsPageSizes([of(type)], false), type).toBe(true);
    }
    expect(needsPageSizes([of('delete'), of('whiteout')], false)).toBe(true);
  });

  it('an armed brush reads them on its own', () => {
    expect(needsPageSizes([], true)).toBe(true);
  });
});
