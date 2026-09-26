import { describe, it, expect } from 'vitest';
import { slotFrame } from './slotFrame.ts';

// Shared across every case: a 16px font, the default .12em padding
// (signGeometry.js's TEXT_BOX_PADDING_EM) and a 1000px-tall page, so page
// percent and pixels convert with a round number.
const FONT_SIZE_PX = 16;
const PAD_EM = 0.12;
const PAD_PX = PAD_EM * FONT_SIZE_PX; // 1.92
const LINE_HEIGHT_PX = 1.05 * FONT_SIZE_PX; // 16.8
const PAGE_HEIGHT_PX = 1000;

describe('slotFrame', () => {
  it('frames the whole field when the field is taller than the text line', () => {
    // field: 10%-15% of the page (100px-150px). element.top sits inside it
    // with room on both sides, so the field, not the line, decides both edges.
    const result = slotFrame({
      field: { top: 10, height: 5 },
      element: { top: 11 },
      fontSizePx: FONT_SIZE_PX,
      padEm: PAD_EM,
      pageHeightPx: PAGE_HEIGHT_PX,
    });

    expect(result.top).toBeCloseTo(10, 6);
    expect(result.height).toBeCloseTo(5, 6);
    // The line (110 to 128.72px, plus its own pad on each side) sits inside
    // the 100-150px field, so the leftover padding is bigger than the plain
    // text padding on both sides.
    const lineTopPx = 110 + PAD_PX;
    const lineBottomPx = lineTopPx + LINE_HEIGHT_PX;
    expect(result.paddingTopPx).toBeCloseTo(lineTopPx - 100, 6);
    expect(result.paddingBottomPx).toBeCloseTo(150 - lineBottomPx, 6);
    expect(result.paddingTopPx).toBeGreaterThan(PAD_PX);
    expect(result.paddingBottomPx).toBeGreaterThan(PAD_PX);
  });

  it('grows the frame to the element\'s own padded box when the line is taller than the field', () => {
    // field: 11.5%-12.5% (115px-125px), entirely inside the element's own
    // padded box (110px to 130.64px), so the element's box decides both
    // edges and the padding is exactly the plain text padding.
    const result = slotFrame({
      field: { top: 11.5, height: 1 },
      element: { top: 11 },
      fontSizePx: FONT_SIZE_PX,
      padEm: PAD_EM,
      pageHeightPx: PAGE_HEIGHT_PX,
    });

    const elementTopPx = 110;
    const elementBottomPx = elementTopPx + PAD_PX + LINE_HEIGHT_PX + PAD_PX; // 130.64
    expect(result.top).toBeCloseTo((elementTopPx / PAGE_HEIGHT_PX) * 100, 6);
    expect(result.height).toBeCloseTo(((elementBottomPx - elementTopPx) / PAGE_HEIGHT_PX) * 100, 6);
    expect(result.paddingTopPx).toBeCloseTo(PAD_PX, 6);
    expect(result.paddingBottomPx).toBeCloseTo(PAD_PX, 6);
  });

  it('grows the frame upward when the element sits above the field\'s own top edge', () => {
    // field: 20%-23% (200px-230px); element.top 15% (150px) puts the whole
    // padded line above the field's top edge but still short of its bottom.
    const result = slotFrame({
      field: { top: 20, height: 3 },
      element: { top: 15 },
      fontSizePx: FONT_SIZE_PX,
      padEm: PAD_EM,
      pageHeightPx: PAGE_HEIGHT_PX,
    });

    const elementTopPx = 150;
    const fieldBottomPx = 230;
    expect(result.top).toBeCloseTo((elementTopPx / PAGE_HEIGHT_PX) * 100, 6);
    expect(result.height).toBeCloseTo(((fieldBottomPx - elementTopPx) / PAGE_HEIGHT_PX) * 100, 6);
    // The frame's top edge is the element's own top edge here, so the top
    // padding is exactly the plain text padding.
    expect(result.paddingTopPx).toBeCloseTo(PAD_PX, 6);
    expect(result.paddingBottomPx).toBeGreaterThan(PAD_PX);
  });

  it('grows the frame downward when the element sits below the field\'s own bottom edge', () => {
    // field: 5%-8% (50px-80px); element.top 10% (100px) puts the whole
    // padded line below the field's bottom edge but still short of its top.
    const result = slotFrame({
      field: { top: 5, height: 3 },
      element: { top: 10 },
      fontSizePx: FONT_SIZE_PX,
      padEm: PAD_EM,
      pageHeightPx: PAGE_HEIGHT_PX,
    });

    const fieldTopPx = 50;
    const elementBottomPx = 100 + PAD_PX + LINE_HEIGHT_PX + PAD_PX; // 120.64
    expect(result.top).toBeCloseTo((fieldTopPx / PAGE_HEIGHT_PX) * 100, 6);
    expect(result.height).toBeCloseTo(((elementBottomPx - fieldTopPx) / PAGE_HEIGHT_PX) * 100, 6);
    expect(result.paddingTopPx).toBeGreaterThan(PAD_PX);
    // The frame's bottom edge is the element's own bottom edge here, so the
    // bottom padding is exactly the plain text padding.
    expect(result.paddingBottomPx).toBeCloseTo(PAD_PX, 6);
  });

  it('never returns a negative padding', () => {
    const cases = [
      { field: { top: 10, height: 5 }, element: { top: 11 } },
      { field: { top: 11.5, height: 1 }, element: { top: 11 } },
      { field: { top: 20, height: 3 }, element: { top: 15 } },
      { field: { top: 5, height: 3 }, element: { top: 10 } },
    ];
    for (const { field, element } of cases) {
      const result = slotFrame({
        field,
        element,
        fontSizePx: FONT_SIZE_PX,
        padEm: PAD_EM,
        pageHeightPx: PAGE_HEIGHT_PX,
      });
      expect(result.paddingTopPx).toBeGreaterThanOrEqual(0);
      expect(result.paddingBottomPx).toBeGreaterThanOrEqual(0);
    }
  });
});
