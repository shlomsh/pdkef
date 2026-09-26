import { describe, expect, it } from 'vitest';
import { touchClaimsElement } from './touchClaim.ts';

describe('touchClaimsElement (SNG-04)', () => {
  it('claims the element outside fill mode, selected or not', () => {
    expect(touchClaimsElement({ touchNeedsSelection: false, wasSelected: false })).toBe(true);
    expect(touchClaimsElement({ touchNeedsSelection: false, wasSelected: true })).toBe(true);
  });

  it('claims the element in fill mode once it is already selected', () => {
    expect(touchClaimsElement({ touchNeedsSelection: true, wasSelected: true })).toBe(true);
  });

  it('does not claim an unselected element in fill mode, so the touch is free to scroll', () => {
    expect(touchClaimsElement({ touchNeedsSelection: true, wasSelected: false })).toBe(false);
  });
});
