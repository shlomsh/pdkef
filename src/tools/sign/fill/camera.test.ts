import { describe, expect, it } from 'vitest';
import {
  FRAME_FROM_TOP,
  FRAME_SIDE_MARGIN_PX,
  FRAMED_TEXT_PX,
  IOS_CANVAS_MAX_PIXELS,
  MAX_ZOOM,
  MIN_ZOOM,
  canvasRenderScale,
  clampZoom,
  frameScroll,
  pinchStep,
  zoomToFrameText,
} from './camera';

describe('clampZoom', () => {
  it('passes through a value already in range', () => {
    expect(clampZoom(2.5)).toBe(2.5);
  });

  it('clamps below MIN_ZOOM up to MIN_ZOOM', () => {
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
    expect(clampZoom(-3)).toBe(MIN_ZOOM);
  });

  it('clamps above MAX_ZOOM down to MAX_ZOOM', () => {
    expect(clampZoom(9)).toBe(MAX_ZOOM);
  });

  it('leaves the boundaries themselves unchanged', () => {
    expect(clampZoom(MIN_ZOOM)).toBe(MIN_ZOOM);
    expect(clampZoom(MAX_ZOOM)).toBe(MAX_ZOOM);
  });
});

describe('zoomToFrameText', () => {
  it('zooms in enough to render the text at FRAMED_TEXT_PX', () => {
    // 8px font at zoom 1 needs zoom 2 to reach 16px.
    const zoom = zoomToFrameText({ fontSizePxAtZoom1: 8, currentZoom: 1 });
    expect(zoom).toBe(2);
  });

  it('never zooms out on a hop: keeps the current zoom when text is already legible', () => {
    // 20px font at zoom 1 only needs zoom 0.8 to reach 16px, but MIN_ZOOM is 1
    // and the current zoom (3) is already above what's needed.
    const zoom = zoomToFrameText({ fontSizePxAtZoom1: 20, currentZoom: 3 });
    expect(zoom).toBe(3);
  });

  it('never zooms out even when currentZoom exceeds MIN_ZOOM but not what is needed', () => {
    const zoom = zoomToFrameText({ fontSizePxAtZoom1: 4, currentZoom: 1.5 });
    // needed = 16 / 4 = 4, which is above currentZoom, so it wins.
    expect(zoom).toBe(4);
  });

  it('clamps the result to MAX_ZOOM', () => {
    const zoom = zoomToFrameText({ fontSizePxAtZoom1: 1, currentZoom: 1 });
    // needed = 16, clamped to MAX_ZOOM.
    expect(zoom).toBe(MAX_ZOOM);
  });

  it('clamps the result to MIN_ZOOM when both inputs are below it', () => {
    const zoom = zoomToFrameText({ fontSizePxAtZoom1: 100, currentZoom: 0.5 });
    // needed = 0.16, currentZoom 0.5, max is 0.5, clamped up to MIN_ZOOM.
    expect(zoom).toBe(MIN_ZOOM);
  });
});

describe('frameScroll', () => {
  const viewport = { width: 375, height: 600 };

  it('lands the field top at FRAME_FROM_TOP of the viewport height', () => {
    const { scrollY } = frameScroll({
      fieldRect: { left: 50, top: 500, width: 100, height: 20 },
      viewport,
      dir: 'ltr',
    });
    expect(scrollY).toBe(500 - FRAME_FROM_TOP * 600);
  });

  it('never returns a negative scrollY near the top of the document', () => {
    const { scrollY } = frameScroll({
      fieldRect: { left: 0, top: 10, width: 100, height: 20 },
      viewport,
      dir: 'ltr',
    });
    expect(scrollY).toBe(0);
  });

  it('centres a field narrower than the viewport instead of pinning an edge', () => {
    const { scrollX } = frameScroll({
      fieldRect: { left: 200, top: 0, width: 50, height: 20 },
      viewport,
      dir: 'ltr',
    });
    expect(scrollX).toBe(200 + 25 - 375 / 2);
  });

  it('keeps the left edge visible with the margin for ltr fields wider than the viewport', () => {
    const { scrollX } = frameScroll({
      fieldRect: { left: 300, top: 0, width: 500, height: 20 },
      viewport,
      dir: 'ltr',
    });
    expect(scrollX).toBe(300 - FRAME_SIDE_MARGIN_PX);
  });

  it('keeps the right edge visible with the margin for rtl fields wider than the viewport', () => {
    const { scrollX } = frameScroll({
      fieldRect: { left: 300, top: 0, width: 500, height: 20 },
      viewport,
      dir: 'rtl',
    });
    const rightEdge = 300 + 500;
    expect(scrollX).toBe(rightEdge - (375 - FRAME_SIDE_MARGIN_PX));
  });

  it('never returns a negative scrollX', () => {
    const { scrollX } = frameScroll({
      fieldRect: { left: 2, top: 0, width: 500, height: 20 },
      viewport,
      dir: 'ltr',
    });
    expect(scrollX).toBe(0);
  });
});

describe('pinchStep', () => {
  it('scales the zoom by the ratio of the pinch distances', () => {
    const result = pinchStep({
      startZoom: 1,
      startDistance: 100,
      distance: 200,
      midpoint: { x: 50, y: 50 },
      startScroll: { x: 0, y: 0 },
    });
    expect(result.zoom).toBe(2);
  });

  it('clamps the zoom to the camera range', () => {
    const result = pinchStep({
      startZoom: 4,
      startDistance: 100,
      distance: 300,
      midpoint: { x: 50, y: 50 },
      startScroll: { x: 0, y: 0 },
    });
    expect(result.zoom).toBe(MAX_ZOOM);
  });

  it('keeps the anchored document point under a stationary midpoint across several midpoints', () => {
    const startZoom = 1;
    const startDistance = 100;
    const distance = 250;
    const startScroll = { x: 40, y: 60 };

    for (const midpoint of [
      { x: 10, y: 10 },
      { x: 150, y: 80 },
      { x: 300, y: 400 },
    ]) {
      const { zoom, scrollX, scrollY } = pinchStep({
        startZoom,
        startDistance,
        distance,
        midpoint,
        startScroll,
      });

      const docPointAtStart = {
        x: (startScroll.x + midpoint.x) / startZoom,
        y: (startScroll.y + midpoint.y) / startZoom,
      };
      const docPointAfter = {
        x: (scrollX + midpoint.x) / zoom,
        y: (scrollY + midpoint.y) / zoom,
      };

      expect(docPointAfter.x).toBeCloseTo(docPointAtStart.x, 10);
      expect(docPointAfter.y).toBeCloseTo(docPointAtStart.y, 10);
    }
  });

  it('never returns a negative scroll even when the anchor math would go below zero', () => {
    const { scrollX, scrollY } = pinchStep({
      startZoom: 3,
      startDistance: 300,
      distance: 100,
      midpoint: { x: 200, y: 200 },
      startScroll: { x: 0, y: 0 },
    });
    expect(scrollX).toBeGreaterThanOrEqual(0);
    expect(scrollY).toBeGreaterThanOrEqual(0);
  });

  it('treats a zero startDistance as no scale change rather than dividing by zero', () => {
    const result = pinchStep({
      startZoom: 2,
      startDistance: 0,
      distance: 50,
      midpoint: { x: 0, y: 0 },
      startScroll: { x: 0, y: 0 },
    });
    expect(Number.isFinite(result.zoom)).toBe(true);
    expect(result.zoom).toBe(2);
  });
});

describe('canvasRenderScale', () => {
  it('renders at the device pixel ratio when under the iOS cap', () => {
    const result = canvasRenderScale({
      cssWidthAtZoom: 375,
      cssHeightAtZoom: 500,
      dpr: 2,
      pageWidthPoints: 612,
    });
    expect(result.pixelWidth).toBe(750);
    expect(result.pixelHeight).toBe(1000);
    expect(result.scale).toBeCloseTo((375 * 2) / 612, 10);
    expect(result.pixelWidth * result.pixelHeight).toBeLessThanOrEqual(IOS_CANVAS_MAX_PIXELS);
  });

  it('reduces the scale uniformly when the naive canvas would exceed the iOS cap', () => {
    const result = canvasRenderScale({
      cssWidthAtZoom: 3000,
      cssHeightAtZoom: 4000,
      dpr: 3,
      pageWidthPoints: 612,
    });
    expect(result.pixelWidth * result.pixelHeight).toBeLessThanOrEqual(IOS_CANVAS_MAX_PIXELS);
    // The aspect ratio is preserved by the uniform reduction.
    expect(result.pixelWidth / result.pixelHeight).toBeCloseTo(3000 / 4000, 3);
  });

  it('reduces scale exactly enough to hit the cap, not further', () => {
    const result = canvasRenderScale({
      cssWidthAtZoom: 4000,
      cssHeightAtZoom: 4000,
      dpr: 3,
      pageWidthPoints: 612,
    });
    const pixelCount = result.pixelWidth * result.pixelHeight;
    expect(pixelCount).toBeLessThanOrEqual(IOS_CANVAS_MAX_PIXELS);
    expect(pixelCount).toBeGreaterThan(IOS_CANVAS_MAX_PIXELS * 0.99);
  });
});
