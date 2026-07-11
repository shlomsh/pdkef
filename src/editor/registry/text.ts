import type { ElementDefinition } from './types.ts';
import type { TextElement } from '../../lib/editorModel.ts';
import { h } from 'preact';
import { rgb } from '@cantoo/pdf-lib';
import TextNode from '../../components/SignTool/nodes/TextNode.jsx';
import { hasNumber, hasString, isRecord } from './schema.ts';
import { MAX_FONT_SIZE_PT, MIN_FONT_SIZE_PT, TEXT_RESIZE_SCALE_FACTOR } from '../../constants/signGeometry.js';
import { DEFAULT_FONT_SIZE_PT, DEFAULT_LINE_HEIGHT_EM, TEXT_BOX_PADDING_EM } from '../../constants/signGeometry.js';
import { getEffectiveTextDirection, hexToRgbFractions } from '../../lib/signHelpers.js';
import type { TextPositionInput, TextPositionPatch, TextResizeInput, TextResizePatch } from './types.ts';

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

export const textDefinition: ElementDefinition<TextElement> = {
  type: 'text',
  schema: (value): value is TextElement => isRecord(value) && value.type === 'text' && hasString(value, 'id')
    && hasNumber(value, 'pageIndex') && hasNumber(value, 'left') && hasNumber(value, 'top') && hasString(value, 'text'),
  creation: {
    mode: 'point',
    create: ({ id, pageIndex, point, color, font, fontSize, direction }) => ({
      id, type: 'text', pageIndex, left: point.left, top: point.top, text: '',
      fontSize, fontWeight: 'normal', fontStyle: 'normal', fontFamily: font, color, autoFocus: true,
      ...(direction != null ? { textDirection: direction } : {}),
    }),
  },
  render: ({ element, onChange, onSelect, pageWidthPoints }) => h(TextNode, { element, onChange, onSelect, pageWidthPoints, isActive: false, onResizeStart: () => {} }),
  serialize: async (element, { page, pdfX, pdfY, loadCustomFont, baselineOffset }) => {
    const { text, fontSize, fontFamily, fontWeight, fontStyle, color } = element;
    const textValue = (text || '').trim();
    if (!textValue) return;
    const fontSizeInPoints = fontSize || DEFAULT_FONT_SIZE_PT;
    const resolvedFont = (await loadCustomFont(fontFamily || 'Arimo', fontWeight, fontStyle)) || (await loadCustomFont('Arimo', fontWeight, fontStyle));
    if (!resolvedFont) throw new Error('Unable to load a PDF font for text export');
    const { r, g, b } = hexToRgbFractions(color);
    const baselineAdjustedY = pdfY - fontSizeInPoints * (baselineOffset(resolvedFont) + TEXT_BOX_PADDING_EM);
    const lineHeight = fontSizeInPoints * DEFAULT_LINE_HEIGHT_EM;
    const isRtl = getEffectiveTextDirection(element) === 'rtl';
    textValue.split(/\r?\n/).forEach((line, lineIndex) => {
      const lineWidth = resolvedFont.widthOfTextAtSize(line, fontSizeInPoints);
      page.drawText(line, { x: isRtl ? pdfX - lineWidth : pdfX, y: baselineAdjustedY - lineIndex * lineHeight, size: fontSizeInPoints, font: resolvedFont, color: rgb(r, g, b) });
    });
  },
  resizeBehavior: { handles: ['top-left', 'top-right', 'bottom-left', 'bottom-right'], applyTextResize, applyTextPosition },
};
