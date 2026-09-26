import { describe, expect, it } from 'vitest';
import compactBarFor from './compactBar.ts';

function base() {
  return { isText: true, isEditing: true, coarse: true, hasFieldNav: true, fillMode: false };
}

describe('compactBarFor', () => {
  it('is true for the production case: text, editing, coarse, fieldNav, no fill mode', () => {
    expect(compactBarFor(base())).toBe(true);
  });

  it('is true in fill mode even with no fieldNav', () => {
    expect(compactBarFor({ ...base(), hasFieldNav: false, fillMode: true })).toBe(true);
  });

  it('is false with neither fieldNav nor fill mode', () => {
    expect(compactBarFor({ ...base(), hasFieldNav: false, fillMode: false })).toBe(false);
  });

  it('is false on a fine pointer, regardless of fieldNav or fill mode', () => {
    expect(compactBarFor({ ...base(), coarse: false })).toBe(false);
    expect(compactBarFor({ ...base(), coarse: false, hasFieldNav: false, fillMode: true })).toBe(false);
  });

  it('is false when not editing', () => {
    expect(compactBarFor({ ...base(), isEditing: false })).toBe(false);
    expect(compactBarFor({ ...base(), isEditing: false, hasFieldNav: false, fillMode: true })).toBe(false);
  });

  it('is false for a non-text element', () => {
    expect(compactBarFor({ ...base(), isText: false })).toBe(false);
    expect(compactBarFor({ ...base(), isText: false, hasFieldNav: false, fillMode: true })).toBe(false);
  });
});
