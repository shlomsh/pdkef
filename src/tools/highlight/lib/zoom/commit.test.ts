import { describe, expect, it } from 'vitest';
import { commitChanges, zoomCommit } from './commit.ts';
import { ZOOM_MAX, ZOOM_MIN } from './fit.ts';

const origin = { x: 100, y: 50 };

describe('commitChanges', () => {
  it('is false when the setting and the zoom are both as they were', () => {
    expect(commitChanges('width', 1.2, 'width', 1.2)).toBe(false);
    expect(commitChanges(3, 3, 3, 3)).toBe(false);
  });
  it('is true when either differs', () => {
    expect(commitChanges('width', 1.2, 'text', 1.2)).toBe(true);
    expect(commitChanges('width', 1.2, 'width', 1.3)).toBe(true);
  });
});

describe('zoomCommit', () => {
  it('keeps the content under the anchor still', () => {
    const { zoom, scroll } = zoomCommit({ prevZoom: 1, nextZoom: 2, anchor: { x: 300, y: 250 }, scroll: { x: 0, y: 0 }, origin });
    expect(zoom).toBe(2);
    expect(scroll).toEqual({ x: 200, y: 200 });
  });
  it('clamps the zoom before it anchors', () => {
    expect(zoomCommit({ prevZoom: 1, nextZoom: 9, anchor: { x: 0, y: 0 }, scroll: { x: 0, y: 0 }, origin }).zoom).toBe(ZOOM_MAX);
    expect(zoomCommit({ prevZoom: 1, nextZoom: 0.1, anchor: { x: 0, y: 0 }, scroll: { x: 0, y: 0 }, origin }).zoom).toBe(ZOOM_MIN);
  });
  it('leaves the scroll alone when the zoom does not change', () => {
    const { scroll } = zoomCommit({ prevZoom: 1.5, nextZoom: 1.5, anchor: { x: 40, y: 90 }, scroll: { x: 12, y: 34 }, origin });
    expect(scroll).toEqual({ x: 12, y: 34 });
  });
});
