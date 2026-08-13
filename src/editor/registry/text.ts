import type { ElementDefinition } from './types.ts';
import type { TextElement } from '../../lib/editorModel.ts';
import { h } from 'preact';
import { rgb } from '@cantoo/pdf-lib';
import TextNode from '../../components/SignTool/nodes/TextNode.jsx';
import { hasNumber, hasString, isRecord } from './schema.ts';
import { MAX_FONT_SIZE_PT, MIN_FONT_SIZE_PT, TEXT_RESIZE_SCALE_FACTOR } from '../../constants/signGeometry.js';
import { DEFAULT_FONT_SIZE_PT, DEFAULT_LINE_HEIGHT_EM, TEXT_BOX_PADDING_EM } from '../../constants/signGeometry.js';
import { combCellCount, combCharacters, combCellCenterFraction, isComb } from '../../lib/comb.js';
import { getEffectiveTextDirection, hexToRgbFractions } from '../../lib/signHelpers.js';
import { resolveFontFamily } from '../../lib/fonts.js';
import type { TextPositionInput, TextPositionPatch, TextResizeInput, TextResizePatch, WidthResizeInput, WidthResizePatch } from './types.ts';
import elementStyles from '../../components/SignTool/EditorElement.module.css';

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
  if (nextSize.height > 0 && startSize.height > 0 && isTopHandle) {
    top = start.top + startSize.height - nextSize.height;
  }
  return { left, top };
}

/**
 * Side-handle drag on a comb: sets the span, never the font size.
 *
 * `left` is the anchored edge, which is the box's right edge in RTL (see the
 * usesRtlAnchoring view flag), so the handle that moves the anchor is the left
 * one in LTR and the right one in RTL. Only that handle repositions; dragging
 * the free edge just changes the width.
 */
export function applyCombWidth({ handle, delta, start, isRtl, minWidth }: WidthResizeInput): WidthResizePatch {
  const movesAnchor = isRtl ? handle === 'right' : handle === 'left';
  // Whether dragging rightward widens the box. Both the anchored RTL edge and
  // the free LTR edge do; the other two shrink it.
  const growsWithPointer = isRtl ? movesAnchor : !movesAnchor;
  const width = Math.max(minWidth, start.width + (growsWithPointer ? delta.x : -delta.x));
  // Derived from the *clamped* width, so hitting the floor parks the anchor
  // instead of letting it keep sliding out from under a box that stopped shrinking.
  const left = movesAnchor
    ? start.left + (isRtl ? width - start.width : start.width - width)
    : start.left;
  return { left, width };
}

export const textDefinition: ElementDefinition<TextElement> = {
  type: 'text',
  schema: (value): value is TextElement => isRecord(value) && value.type === 'text' && hasString(value, 'id')
    && hasNumber(value, 'pageIndex') && hasNumber(value, 'left') && hasNumber(value, 'top') && hasString(value, 'text'),
  creation: {
    mode: 'point',
    // The click point is the middle of the box's anchored edge — its left edge
    // in LTR, its right edge in RTL (the anchored edge is `left` either way,
    // see the usesRtlAnchoring view flag). So the box is centered vertically on
    // the pointer rather than hanging below it.
    create: ({ id, pageIndex, point, color, font, fontSize, direction, textHeight = 0 }) => ({
      id, type: 'text', pageIndex, left: point.left, top: Math.max(0, point.top - textHeight / 2), text: '',
      fontSize, fontWeight: 'normal', fontStyle: 'normal', fontFamily: font, color,
      ...(direction != null ? { textDirection: direction } : {}),
    }),
  },
  // isActive/isEditing/onBeginEdit are placeholders: DraggableWrapper injects the
  // real values via cloneElement, the same channel onResizeStart arrives on.
  render: ({ element, onChange, onSelect, pageWidthPoints }) => h(TextNode, { element, onChange, onSelect, pageWidthPoints, isActive: false, isEditing: false, onBeginEdit: () => {}, onResizeStart: () => {} }),
  serialize: async (element, { page, pdfWidth, pdfX, pdfY, loadCustomFont, baselineOffset }) => {
    const { text, fontSize, fontFamily, fontWeight, fontStyle, color } = element;
    const textValue = (text || '').trim();
    if (!textValue) return;
    const fontSizeInPoints = fontSize || DEFAULT_FONT_SIZE_PT;
    // Same substitution the editor renders with, so the download matches the
    // screen even when the picked font has no glyph for what was typed.
    const embeddedFamily = resolveFontFamily(fontFamily, textValue);
    const resolvedFont = (await loadCustomFont(embeddedFamily, fontWeight, fontStyle)) || (await loadCustomFont('Arimo', fontWeight, fontStyle));
    if (!resolvedFont) throw new Error('Unable to load a PDF font for text export');
    const { r, g, b } = hexToRgbFractions(color);
    const baselineAdjustedY = pdfY - fontSizeInPoints * (baselineOffset(resolvedFont) + TEXT_BOX_PADDING_EM);
    const lineHeight = fontSizeInPoints * DEFAULT_LINE_HEIGHT_EM;
    const isRtl = getEffectiveTextDirection(element) === 'rtl';

    if (isComb(element)) {
      // One drawText per character at a computed x, which is also why a comb
      // needs nothing from pdf-lib that plain text doesn't: no Tc operator, no
      // per-run kerning to defeat. Kerning is meaningless here anyway - the
      // printed cells, not the font, decide where each glyph goes.
      const widthPoints = ((element.width || 0) / 100) * pdfWidth;
      const cellCount = combCellCount(element);
      // `pdfX` is the anchored edge, which is the box's right edge in RTL.
      const boxLeft = isRtl ? pdfX - widthPoints : pdfX;
      combCharacters(element).slice(0, cellCount).forEach((char, index) => {
        if (!char.trim()) return;
        const charWidth = resolvedFont.widthOfTextAtSize(char, fontSizeInPoints);
        const center = boxLeft + combCellCenterFraction(index, cellCount) * widthPoints;
        page.drawText(char, { x: center - charWidth / 2, y: baselineAdjustedY, size: fontSizeInPoints, font: resolvedFont, color: rgb(r, g, b) });
      });
      return;
    }

    textValue.split(/\r?\n/).forEach((line, lineIndex) => {
      const lineWidth = resolvedFont.widthOfTextAtSize(line, fontSizeInPoints);
      page.drawText(line, { x: isRtl ? pdfX - lineWidth : pdfX, y: baselineAdjustedY - lineIndex * lineHeight, size: fontSizeInPoints, font: resolvedFont, color: rgb(r, g, b) });
    });
  },
  view: { usesRtlAnchoring: true, usesIntrinsicSize: true, allowsExplicitWidth: true },
  resizeBehavior: {
    // Corners always mean font size, comb or not. The side handles appear only
    // for a comb and only ever set the span, so the two never contend for the
    // same grip and a plain text box is unchanged.
    handles: (element) => (isComb(element)
      ? ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'left', 'right']
      : ['top-left', 'top-right', 'bottom-left', 'bottom-right']),
    applyTextResize,
    applyTextPosition,
    applyWidthResize: applyCombWidth,
    writeDOM: ({ node, patch, handle, isRtl, startLeft, startTop, scaleFactor, pageWrapper, textStartSizePercent, getElementPercentSize }) => {
      // Side-handle drag on a comb: span only, and the font size is left alone.
      if (patch.width !== undefined) {
        node.style.width = `${patch.width}%`;
        if (isRtl) node.style.right = `${100 - (patch.left as number)}%`;
        else node.style.left = `${patch.left as number}%`;
        return;
      }

      node
        .querySelectorAll(`.${elementStyles['text-display']}, .${elementStyles['text-input']}, .${elementStyles['text-measure']}`)
        .forEach((el) => { (el as HTMLElement).style.fontSize = `${(patch.fontSize as number) * scaleFactor}px`; });

      if (!textStartSizePercent) return;
      const newSize = getElementPercentSize(node, pageWrapper);
      const { left: newLeft, top: newTop } = applyTextPosition({
        start: { left: startLeft, top: startTop },
        startSize: textStartSizePercent,
        nextSize: newSize,
        isLeftHandle: ['left', 'top-left', 'bottom-left'].includes(handle),
        isTopHandle: ['top', 'top-left', 'top-right'].includes(handle),
        isRtl,
      });
      node.style.top = `${newTop}%`;
      if (isRtl) node.style.right = `${100 - newLeft}%`;
      else node.style.left = `${newLeft}%`;
      return { left: newLeft, top: newTop };
    },
  },
};
