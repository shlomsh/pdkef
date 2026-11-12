import { describe, expect, it } from 'vitest';
import { applySignatureResize } from './signature.ts';
import { applyMarkResize } from './mark.ts';

describe('center-anchored registry resize behavior', () => {
  it('keeps a resized element centered and within page bounds', () => {
    expect(applySignatureResize({
      deltaWidth: 20,
      minWidth: 3,
      aspectRatio: 1,
      page: { width: 600, height: 800 },
      start: { left: 20, top: 30, width: 20, height: 15 },
    })).toEqual({ left: 10, top: 22.5, width: 40, height: 30 });
  });

  it('honors the caller-provided mark pixel floor after conversion to percent', () => {
    const patch = applyMarkResize({
      deltaWidth: -50,
      minWidth: 4,
      aspectRatio: 1,
      page: { width: 600, height: 800 },
      start: { left: 20, top: 30, width: 10, height: 7.5 },
    });
    expect(patch.width).toBe(4);
    expect(patch.height).toBe(3);
  });

  // Reported live on income tax form 101: placeMarkOnRegion fits a mark
  // to a detected printed checkbox exactly, routinely below the toolbar's
  // legibility floor (a real checkbox measured 4.28px). The floor used to
  // apply unconditionally, so the very first pixel of any resize - even an
  // accidental touch nudge, even one shrinking further - snapped the mark
  // straight up to the floor and it no longer fit the printed box.
  it('never raises a mark already smaller than the floor on the first pixel of a resize', () => {
    const patch = applyMarkResize({
      deltaWidth: 0.1,
      minWidth: 4,
      aspectRatio: 1,
      page: { width: 600, height: 800 },
      start: { left: 20, top: 30, width: 2, height: 1.5 },
    });
    expect(patch.width).toBeCloseTo(2.1, 5);
    expect(patch.height).toBeCloseTo(1.575, 5);
  });

  it('still lets a below-floor mark grow normally, dragged out past the floor', () => {
    const grown = applyMarkResize({
      deltaWidth: 10,
      minWidth: 4,
      aspectRatio: 1,
      page: { width: 600, height: 800 },
      start: { left: 20, top: 30, width: 2, height: 1.5 },
    });
    expect(grown.width).toBe(12);
  });

  it('holds a below-floor mark at its own size rather than shrinking it further', () => {
    // Its own already-tiny size becomes the effective floor: no jump up to
    // the toolbar's floor, but a real minimum still applies, matching what a
    // floor means everywhere else in the app - never nothing, and never a
    // discontinuous jump.
    const shrunk = applyMarkResize({
      deltaWidth: -1.9,
      minWidth: 4,
      aspectRatio: 1,
      page: { width: 600, height: 800 },
      start: { left: 20, top: 30, width: 2, height: 1.5 },
    });
    expect(shrunk.width).toBe(2);
  });
});
