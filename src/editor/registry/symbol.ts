import { MAX_SYMBOL_WIDTH_PCT, MIN_SYMBOL_WIDTH_PX } from '../../constants/signGeometry.js';
import { LineCapStyle, rgb } from '@cantoo/pdf-lib';
import { hasBoxGeometry, hasNumber, hasString, isRecord } from './schema.ts';
import { hexToRgbFractions } from '../../lib/signHelpers.js';
import { percentToPoints } from '../geometry/coords.js';
import type { CenteredResizeInput, CenteredResizePatch, ElementDefinition } from './types.ts';
import type { SymbolElement, SymbolMark } from '../model/editorModel.ts';
import { DESIGN_BOX, markGeometry, markInkExtent } from './symbolMarks.ts';

export function applySymbolResize({ deltaWidth, minWidth, aspectRatio, page, start }: CenteredResizeInput): CenteredResizePatch {
  const width = Math.max(minWidth, Math.min(MAX_SYMBOL_WIDTH_PCT, start.width + deltaWidth));
  const height = width * aspectRatio * (page.width / page.height);
  return {
    width,
    height,
    left: Math.max(0, Math.min(100 - width, start.left + (start.width - width) / 2)),
    top: Math.max(0, Math.min(100 - height, start.top + (start.height - height) / 2)),
  };
}

/**
 * A symbol sized and placed so its *ink* fills a detected checkbox.
 *
 * The size question a person otherwise answers by placing a mark and dragging
 * it until it looks right is answered by the paper. Two things make this more
 * than copying the square's box across:
 *
 * A mark does not fill its own element box - a cross inks 19 of its 24 design
 * units - so laying the element exactly over the square draws a mark a fifth
 * too small for it. And the check's ink is not centred in that box either; it
 * sits half a unit high, so centring the box leaves the mark visibly low.
 * Both are fixed by working from the ink extent rather than the box.
 *
 * The mark scales uniformly, by whichever axis runs out first, so a check
 * (naturally wider than it is tall) is never stretched square to fill one.
 */
export function placeSymbolOnRegion(
  region: { left: number; top: number; width: number; height: number },
  mark: SymbolMark | undefined,
  { pageWidthPoints, pageHeightPoints }: { pageWidthPoints: number; pageHeightPoints: number },
): { left: number; top: number; width: number; height: number } {
  const ink = markInkExtent(mark);
  const regionWidthPoints = (region.width / 100) * pageWidthPoints;
  const regionHeightPoints = (region.height / 100) * pageHeightPoints;
  if (!(regionWidthPoints > 0) || !(regionHeightPoints > 0) || !(ink.width > 0) || !(ink.height > 0)) {
    return { left: region.left, top: region.top, width: region.width, height: region.height };
  }
  const pointsPerUnit = Math.min(regionWidthPoints / ink.width, regionHeightPoints / ink.height);
  const width = ((pointsPerUnit * DESIGN_BOX) / pageWidthPoints) * 100;
  const height = ((pointsPerUnit * DESIGN_BOX) / pageHeightPoints) * 100;
  return {
    width,
    height,
    left: region.left + region.width / 2 - (ink.centerX / DESIGN_BOX) * width,
    top: region.top + region.height / 2 - (ink.centerY / DESIGN_BOX) * height,
  };
}

export const symbolDefinition: ElementDefinition<SymbolElement> = {
  type: 'symbol',
  schema: (value): value is SymbolElement => isRecord(value) && value.type === 'symbol' && hasString(value, 'id')
    && hasNumber(value, 'pageIndex') && hasBoxGeometry(value),
  creation: {
    mode: 'point',
    create: ({ id, pageIndex, point, color, symbolWidth = 0, symbolHeight = 0, symbolMark = 'check' }) => ({
      id, type: 'symbol', pageIndex, left: point.left - symbolWidth / 2, top: point.top - symbolHeight / 2,
      width: symbolWidth, height: symbolHeight, mark: symbolMark, color,
    }),
  },
  serialize: (element, { page, pdfWidth, pdfHeight, pdfX, pdfY }) => {
    const { width, height, color, mark } = element;
    const widthPoints = percentToPoints(width, pdfWidth);
    const heightPoints = percentToPoints(height, pdfHeight);
    const { r, g, b } = hexToRgbFractions(color, '#1463ff');
    const symbolColor = rgb(r, g, b);
    // Design units to page points. y counts downwards in the design box, which
    // is why it is subtracted from pdfY.
    const at = (x: number, y: number) => ({
      x: pdfX + widthPoints * (x / DESIGN_BOX),
      y: pdfY - heightPoints * (y / DESIGN_BOX),
    });
    const geometry = markGeometry(mark);
    if (geometry.disc) {
      const { cx, cy, r: radius } = geometry.disc;
      const center = at(cx, cy);
      page.drawEllipse({
        x: center.x,
        y: center.y,
        xScale: widthPoints * (radius / DESIGN_BOX),
        yScale: heightPoints * (radius / DESIGN_BOX),
        color: symbolColor,
        borderWidth: 0,
      });
      return;
    }
    const thickness = (widthPoints / DESIGN_BOX) * geometry.thickness;
    for (const line of geometry.strokes) {
      for (let i = 1; i < line.length; i += 1) {
        page.drawLine({
          start: at(line[i - 1][0], line[i - 1][1]),
          end: at(line[i][0], line[i][1]),
          thickness,
          color: symbolColor,
          lineCap: LineCapStyle.Round,
        });
      }
    }
  },
  view: { isSymbol: true },
  resizeBehavior: { handles: ['top-left', 'top-right', 'bottom-left', 'bottom-right'], applyCenteredResize: applySymbolResize, minimumWidth: { unit: 'pixels', value: MIN_SYMBOL_WIDTH_PX } },
};
