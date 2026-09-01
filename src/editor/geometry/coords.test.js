import { describe, expect, it } from 'vitest';
import {
  applyAffineTransform,
  clientDeltaToPagePercent,
  clientPointToPagePercent,
  createPageGeometry,
  pageGeometryFromPdfJsPage,
  pagePercentToPdfPoint,
  pdfPointToPagePercent,
  pxToPercent,
  pxDeltaToPercent,
  percentToPx,
  percentToPoints,
  pointsToPercent,
  pointsToPx,
  pxToPoints,
  scaleFactorFromPx,
  widthPercentToHeightPercent
} from './coords.js';

describe('coords.js', () => {
  it('pxToPercent converts an absolute pixel offset to a percentage of the parent', () => {
    expect(pxToPercent(50, 200)).toBe(25);
    expect(pxToPercent(0, 200)).toBe(0);
  });

  it('pxDeltaToPercent converts a pixel delta to a percentage of the parent', () => {
    expect(pxDeltaToPercent(20, 400)).toBe(5);
    expect(pxDeltaToPercent(-20, 400)).toBe(-5);
  });

  it('percentToPx is the inverse of pxToPercent', () => {
    expect(percentToPx(25, 200)).toBe(50);
    expect(percentToPx(pxToPercent(73, 500), 500)).toBeCloseTo(73);
  });

  it('percentToPoints maps a page-relative percentage to PDF points', () => {
    expect(percentToPoints(50, 612)).toBe(306);
    expect(percentToPoints(0, 612)).toBe(0);
    expect(percentToPoints(100, 612)).toBe(612);
  });

  it('pointsToPercent is the inverse of percentToPoints', () => {
    expect(pointsToPercent(306, 612)).toBe(50);
    expect(pointsToPercent(percentToPoints(37, 792), 792)).toBeCloseTo(37);
  });

  it('pointsToPx scales PDF points by a screen scale factor', () => {
    expect(pointsToPx(100, 1.5)).toBe(150);
    expect(pointsToPx(100, 1)).toBe(100);
  });

  it('pxToPoints is the inverse of pointsToPx', () => {
    expect(pxToPoints(150, 1.5)).toBe(100);
    expect(pxToPoints(pointsToPx(42, 0.8), 0.8)).toBeCloseTo(42);
  });

  it('scaleFactorFromPx derives screen-px-per-point from a measured wrapper width', () => {
    expect(scaleFactorFromPx(612, 612)).toBe(1);
    expect(scaleFactorFromPx(1224, 612)).toBe(2);
    expect(scaleFactorFromPx(306, 612)).toBe(0.5);
  });

  it('widthPercentToHeightPercent preserves aspect ratio across differently-scaled dimensions', () => {
    // Square parent, square-ish aspect ratio: width% -> same height%.
    expect(widthPercentToHeightPercent(20, 1, 600, 600)).toBe(20);
    // Wider parent than tall: same aspectRatio needs a larger height% to look
    // the same in real pixels, since 1% of width is more px than 1% of height.
    expect(widthPercentToHeightPercent(20, 1, 800, 400)).toBe(40);
    // Taller parent than wide: needs a smaller height%.
    expect(widthPercentToHeightPercent(20, 1, 400, 800)).toBe(10);
    // A non-1 aspect ratio (e.g. a 0.4 signature) scales linearly.
    expect(widthPercentToHeightPercent(20, 0.4, 600, 600)).toBeCloseTo(8);
  });

  describe('the shared rotated/cropped page transform', () => {
    const cropBox = { x: 10, y: 20, width: 200, height: 300 };
    const expectedCorners = {
      0: {
        topLeft: { x: 10, y: 320 }, topRight: { x: 210, y: 320 },
        bottomRight: { x: 210, y: 20 }, bottomLeft: { x: 10, y: 20 },
      },
      90: {
        topLeft: { x: 10, y: 20 }, topRight: { x: 10, y: 320 },
        bottomRight: { x: 210, y: 320 }, bottomLeft: { x: 210, y: 20 },
      },
      180: {
        topLeft: { x: 210, y: 20 }, topRight: { x: 10, y: 20 },
        bottomRight: { x: 10, y: 320 }, bottomLeft: { x: 210, y: 320 },
      },
      270: {
        topLeft: { x: 210, y: 320 }, topRight: { x: 210, y: 20 },
        bottomRight: { x: 10, y: 20 }, bottomLeft: { x: 10, y: 320 },
      },
    };

    it.each([0, 90, 180, 270])('maps every viewport corner through crop + %s-degree rotation', (rotation) => {
      const geometry = createPageGeometry({ cropBox, rotation });
      const corners = expectedCorners[rotation];
      expect(pagePercentToPdfPoint({ x: 0, y: 0 }, geometry)).toEqual(corners.topLeft);
      expect(pagePercentToPdfPoint({ x: 100, y: 0 }, geometry)).toEqual(corners.topRight);
      expect(pagePercentToPdfPoint({ x: 100, y: 100 }, geometry)).toEqual(corners.bottomRight);
      expect(pagePercentToPdfPoint({ x: 0, y: 100 }, geometry)).toEqual(corners.bottomLeft);
      expect(geometry.width).toBe(rotation % 180 === 0 ? 200 : 300);
      expect(geometry.height).toBe(rotation % 180 === 0 ? 300 : 200);
    });

    it.each([0, 90, 180, 270])('keeps forward and inverse transforms exact at %s degrees', (rotation) => {
      const geometry = createPageGeometry({ cropBox, rotation, userUnit: 2 });
      const authored = { x: 37.25, y: 61.5 };
      const pdfPoint = pagePercentToPdfPoint(authored, geometry);
      expect(pdfPointToPagePercent(pdfPoint, geometry)).toEqual({
        x: expect.closeTo(authored.x, 10),
        y: expect.closeTo(authored.y, 10),
      });
      const editorPoint = { x: geometry.width * 0.3725, y: geometry.height * (1 - 0.615) };
      expect(applyAffineTransform(editorPoint, geometry.editorToPdf)).toEqual({
        x: expect.closeTo(pdfPoint.x, 10),
        y: expect.closeTo(pdfPoint.y, 10),
      });
    });

    it('matches the scale-1 transform supplied by pdf.js page metadata', () => {
      const geometry = pageGeometryFromPdfJsPage({
        view: [10, 20, 210, 320], rotate: 270, userUnit: 2,
      });
      expect(geometry.width).toBe(600);
      expect(geometry.height).toBe(400);
      expect(geometry.pdfToViewport).toEqual([0, -2, -2, 0, 640, 420]);
    });

    it('uses the geometry for browser placement and hit-test deltas', () => {
      const geometry = createPageGeometry({ cropBox, rotation: 90 });
      const rect = { x: 40, y: 80, width: 600, height: 400 };
      expect(clientPointToPagePercent({ x: 190, y: 380 }, rect, geometry)).toEqual({ x: 25, y: 75 });
      expect(clientDeltaToPagePercent({ x: -120, y: 40 }, rect, geometry)).toEqual({ x: -20, y: 10 });
    });
  });
});
