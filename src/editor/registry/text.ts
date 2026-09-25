// Editor-side text definition. PDF drawing is deliberately lazy in textPdf.ts:
// loading the editor must not fetch pdf-lib before a user downloads a document.
import type { ElementDefinition, TextPositionInput, TextPositionPatch, TextResizeInput, TextResizePatch, WidthFloorInput, WidthResizeInput, WidthResizePatch } from './types.ts';
import type { TextElement } from '../model/editorModel.ts';
import { hasNumber, hasString, isRecord } from './schema.ts';
import { COMB_MIN_CELL_EM, COMB_NATURAL_WIDTH_TOLERANCE_PX, MAX_FONT_SIZE_PT, MIN_COMB_WIDTH_PCT, MIN_FONT_SIZE_PT, TEXT_RESIZE_SCALE_FACTOR } from '../../constants/signGeometry.js';
import { combCellCenterFraction, combCellCount } from '../text/comb.js';
import { normalizeTabsForBidi, stripInvisibleFormatting, findMissingGlyphs } from '../text/textTransforms.js';
import { fontkitFont, shapedWidth, unrepresentableCharacters } from '../text/textMetrics.ts';

// Keep the coverage and shaping imports stable for callers that do not need
// PDF drawing. drawShapedRun intentionally lives in textPdf.ts.
export { normalizeTabsForBidi, stripInvisibleFormatting, findMissingGlyphs };
export { fontkitFont, shapedWidth, unrepresentableCharacters };

export function applyTextResize({ startFontSize, delta, startRect, fallbackDeltaPoints }: TextResizeInput): TextResizePatch {
  let fontSize = startFontSize;
  if (startRect && startRect.width > 0 && startRect.height > 0) {
    const scale = 1 + (delta.x * startRect.width + delta.y * startRect.height)
      / (startRect.width * startRect.width + startRect.height * startRect.height);
    fontSize = Math.round(startFontSize * scale);
  } else {
    fontSize = Math.round(startFontSize + fallbackDeltaPoints * TEXT_RESIZE_SCALE_FACTOR);
  }
  return { fontSize: Math.max(MIN_FONT_SIZE_PT, Math.min(MAX_FONT_SIZE_PT, fontSize)) };
}

export function applyTextPosition({ start, startSize, nextSize, isLeftHandle, isTopHandle, isRtl }: TextPositionInput): TextPositionPatch {
  let { left, top } = start;
  if (nextSize.width > 0 && startSize.width > 0) {
    if (isLeftHandle && !isRtl) left = start.left + startSize.width - nextSize.width;
    else if (!isLeftHandle && isRtl) left = start.left - startSize.width + nextSize.width;
  }
  if (nextSize.height > 0 && startSize.height > 0 && isTopHandle) top = start.top + startSize.height - nextSize.height;
  return { left, top };
}

export function applyCombWidth({ handle, delta, start, isRtl, minWidth }: WidthResizeInput): WidthResizePatch {
  const movesAnchor = isRtl ? handle === 'right' : handle === 'left';
  const rawWidth = start.width + ((isRtl ? movesAnchor : !movesAnchor) ? delta.x : -delta.x);
  const width = Math.max(minWidth, rawWidth);
  return {
    left: movesAnchor ? start.left + (isRtl ? width - start.width : start.width - width) : start.left,
    width,
    collapsed: rawWidth < minWidth,
  };
}

export function combWidthFloor({ element, fontSizePx, pageWidthPx, naturalWidthPx }: WidthFloorInput): number {
  if (!(pageWidthPx > 0) || !(fontSizePx > 0)) return MIN_COMB_WIDTH_PCT;
  const cellFloorPct = Math.max(MIN_COMB_WIDTH_PCT, (combCellCount(element as TextElement) * fontSizePx * COMB_MIN_CELL_EM / pageWidthPx) * 100);
  // MOBI-31: the cell-pitch floor above is a lower bound only, for the
  // empty/one-character case (or a caller that measured nothing yet). Once
  // the text's own natural (plain, unspaced) width is known, it is the real
  // threshold - see COMB_NATURAL_WIDTH_TOLERANCE_PX's comment for the
  // tolerance subtracted from it.
  if (!(naturalWidthPx && naturalWidthPx > 0)) return cellFloorPct;
  const naturalFloorPct = Math.max(0, (naturalWidthPx - COMB_NATURAL_WIDTH_TOLERANCE_PX) / pageWidthPx * 100);
  return Math.max(cellFloorPct, naturalFloorPct);
}

export const textDefinition: ElementDefinition<TextElement> = {
  type: 'text',
  schema: (value): value is TextElement => isRecord(value) && value.type === 'text' && hasString(value, 'id')
    && hasNumber(value, 'pageIndex') && hasNumber(value, 'left') && hasNumber(value, 'top') && hasString(value, 'text'),
  creation: {
    mode: 'point',
    create: ({ id, pageIndex, point, color, font, fontSize, direction, textHeight = 0 }) => ({
      id, type: 'text', pageIndex, left: point.left, top: Math.max(0, point.top - textHeight / 2), text: '',
      fontSize, fontWeight: 'normal', fontStyle: 'normal', fontFamily: font, fontFamilyExplicit: false, color,
      ...(direction != null ? { textDirection: direction } : {}),
    }),
  },
  // Dynamic import is the boundary that keeps @cantoo/pdf-lib out of initial
  // editor hydration. The caller already awaits every serializer.
  serialize: async (element, context) => (await import('./textPdf.ts')).serializeText(element, context),
  view: { usesRtlAnchoring: true, usesIntrinsicSize: true, allowsExplicitWidth: true },
  resizeBehavior: {
    handles: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'left', 'right'],
    applyTextResize,
    applyTextPosition,
    applyWidthResize: applyCombWidth,
    widthFloor: combWidthFloor,
    writeDOM: ({ node, patch, handle, isRtl, startLeft, startTop, scaleFactor, pageWrapper, textStartSizePercent, getElementPercentSize, element }) => {
      if (patch.width !== undefined) {
        const textDisplay = node.querySelector('[data-text-part="display"]') as HTMLElement | null;
        const textInput = node.querySelector('[data-text-part="input"]') as HTMLElement | null;
        const combNode = node.querySelector('[data-text-part="comb"]') as HTMLElement | null;
        if (patch.collapsed) {
          // Back to intrinsic sizing, so the span is no longer fixed and RTL
          // anchoring applies again from the element's original edge.
          node.style.width = '';
          node.style.left = '';
          node.style.right = '';
          if (isRtl) node.style.right = `${100 - startLeft}%`;
          else node.style.left = `${startLeft}%`;
          if (combNode) combNode.style.display = 'none';
          if (textInput) textInput.style.color = (element as TextElement).color || '#000000';
          textDisplay?.removeAttribute('data-comb');
          return;
        }
        // A comb is left-anchored in both directions: `patch.left` is its left
        // edge, and `right` has to be cleared in case the box arrived RTL.
        node.style.width = `${patch.width}%`;
        node.style.right = '';
        node.style.left = `${patch.left}%`;
        if (!combNode) return;
        combNode.style.display = '';
        textDisplay?.setAttribute('data-comb', 'on');
        if (textInput) textInput.style.color = 'transparent';
        const widthPx = node.getBoundingClientRect().width;
        const cells = combNode.querySelectorAll('[data-text-part="comb-cell"]');
        cells.forEach((cell, index) => {
          (cell as HTMLElement).style.left = `${combCellCenterFraction(index, cells.length, isRtl) * widthPx}px`;
        });
        combNode.querySelectorAll('[data-text-part="comb-guide"]').forEach((guide, index) => {
          const boundary = (index + 1) / cells.length;
          (guide as HTMLElement).style.left = `${(isRtl ? 1 - boundary : boundary) * widthPx}px`;
        });
        return;
      }

      node.querySelectorAll('[data-text-part="display"], [data-text-part="input"], [data-text-part="measure"]')
        .forEach((el) => { (el as HTMLElement).style.fontSize = `${(patch.fontSize as number) * scaleFactor}px`; });
      if (!textStartSizePercent) return;
      const newSize = getElementPercentSize(node, pageWrapper);
      const position = applyTextPosition({
        start: { left: startLeft, top: startTop }, startSize: textStartSizePercent, nextSize: newSize,
        isLeftHandle: ['left', 'top-left', 'bottom-left'].includes(handle),
        isTopHandle: ['top', 'top-left', 'top-right'].includes(handle), isRtl,
      });
      node.style.top = `${position.top}%`;
      if (isRtl) node.style.right = `${100 - position.left}%`;
      else node.style.left = `${position.left}%`;
      return { left: position.left, top: position.top };
    },
  },
};
