import { describe, expect, it } from 'vitest';
import { boxKeyIntent, boxMovePatch, boxAriaLabel } from './boxKeys.ts';

const sel = { isSelected: true, isStroke: false };
describe('boxKeyIntent', () => {
  it('maps select, deselect, delete', () => {
    expect(boxKeyIntent('Enter', {}, sel)).toEqual({ kind: 'select' });
    expect(boxKeyIntent(' ', {}, { isSelected: false, isStroke: false })).toEqual({ kind: 'select' });
    expect(boxKeyIntent('Escape', {}, sel)).toEqual({ kind: 'deselect' });
    expect(boxKeyIntent('Escape', {}, { isSelected: false, isStroke: false })).toBeNull();
    expect(boxKeyIntent('Delete', {}, sel)).toEqual({ kind: 'delete' });
    expect(boxKeyIntent('Backspace', {}, { isSelected: false, isStroke: true })).toEqual({ kind: 'delete' });
  });
  it('arrows move 1, shift 10, only when selected and not a stroke', () => {
    expect(boxKeyIntent('ArrowLeft', {}, sel)).toEqual({ kind: 'move', dx: -1, dy: 0 });
    expect(boxKeyIntent('ArrowDown', { shift: true }, sel)).toEqual({ kind: 'move', dx: 0, dy: 10 });
    expect(boxKeyIntent('ArrowUp', {}, { isSelected: false, isStroke: false })).toBeNull();
    expect(boxKeyIntent('ArrowUp', {}, { isSelected: true, isStroke: true })).toBeNull();
  });
  it('ignores ctrl/meta/alt chords', () => {
    expect(boxKeyIntent('Backspace', { meta: true }, sel)).toBeNull();
  });
});

describe('boxMovePatch', () => {
  const el = { left: 10, top: 10, width: 30, height: 10 };
  it('converts points to percent', () => {
    expect(boxMovePatch(el, 10, 0, 500, 1000)).toEqual({ left: 12, top: 10 });
  });
  it('clamps to the page', () => {
    expect(boxMovePatch(el, -1000, -1000, 500, 1000)).toEqual({ left: 0, top: 0 });
    expect(boxMovePatch(el, 1000, 1000, 500, 1000)).toEqual({ left: 70, top: 90 });
  });
  it('returns null without page size', () => {
    expect(boxMovePatch(el, 1, 0, 0, 0)).toBeNull();
  });
});

describe('boxAriaLabel', () => {
  it('names each type', () => {
    expect(boxAriaLabel('blur')).toBe('Blur box');
    expect(boxAriaLabel('whiteoutStroke')).toBe('Whiteout stroke');
  });
});
