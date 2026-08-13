import type { ElementDefinition } from './types.ts';
import type { TextElement } from '../../lib/editorModel.ts';
import { h } from 'preact';
import { rgb } from '@cantoo/pdf-lib';
import TextNode from '../../components/SignTool/nodes/TextNode.jsx';
import { hasNumber, hasString, isRecord } from './schema.ts';
import { COMB_MIN_CELL_EM, MAX_FONT_SIZE_PT, MIN_COMB_WIDTH_PCT, MIN_FONT_SIZE_PT, TEXT_RESIZE_SCALE_FACTOR } from '../../constants/signGeometry.js';
import { DEFAULT_FONT_SIZE_PT, DEFAULT_LINE_HEIGHT_EM } from '../../constants/signGeometry.js';
import { combCellCount, combCharacters, combCellCenterFraction, isComb } from '../../lib/comb.js';
import { getEffectiveTextDirection, hexToRgbFractions } from '../../lib/signHelpers.js';
import { resolveFontFamily, textBoxPaddingEm } from '../../lib/fonts.js';
import type { TextPositionInput, TextPositionPatch, TextResizeInput, TextResizePatch, WidthFloorInput, WidthResizeInput, WidthResizePatch } from './types.ts';
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
  const rawWidth = start.width + (growsWithPointer ? delta.x : -delta.x);
  const width = Math.max(minWidth, rawWidth);
  // Derived from the *clamped* width, so hitting the floor parks the anchor
  // instead of letting it keep sliding out from under a box that stopped shrinking.
  const left = movesAnchor
    ? start.left + (isRtl ? width - start.width : start.width - width)
    : start.left;
  // Dragging the span down past its usable floor and letting go there is
  // "close this comb" - a deliberate, visible gesture (the box visibly stops
  // shrinking at the floor before it happens) rather than a fuzzy proximity
  // check against the text's natural width, which would depend on font and
  // content and could fire while fine-tuning a span nowhere near where the
  // user meant to stop.
  return { left, width, collapsed: rawWidth < minWidth };
}

/**
 * Where a comb's span stops being worth having, as a % of page width.
 *
 * Derived from the cells rather than being a flat fraction of the page, because
 * that is the only version of the question with a real answer: a comb exists to
 * put one character in each printed box, so once a cell is narrower than the
 * character it holds there is nothing left to align and the element is just
 * text again. That lands the floor near the box's own natural text width, which
 * is what makes shrinking it back down a gesture someone can finish - a flat
 * percentage of the page would have to be dragged to a slit first, and would
 * sit in a different place relative to the text for every font size and length.
 */
export function combWidthFloor({ element, fontSizePx, pageWidthPx }: WidthFloorInput): number {
  if (!(pageWidthPx > 0) || !(fontSizePx > 0)) return MIN_COMB_WIDTH_PCT;
  const cellPitchPx = combCellCount(element as TextElement) * fontSizePx * COMB_MIN_CELL_EM;
  return Math.max(MIN_COMB_WIDTH_PCT, (cellPitchPx / pageWidthPx) * 100);
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
    // Same per-font padding the editor renders with (fonts.js), so a face
    // whose box grew to fit its own tall ascenders on screen exports at the
    // same baseline instead of drifting once the extra padding is dropped.
    const baselineAdjustedY = pdfY - fontSizeInPoints * (baselineOffset(resolvedFont) + textBoxPaddingEm(embeddedFamily));
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
        const center = boxLeft + combCellCenterFraction(index, cellCount, isRtl) * widthPoints;
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
    // Corners always mean font size; the side handles always mean comb span.
    // Both are always present - dragging a side handle is what turns comb on
    // (see useElementResize.js), and there is nothing left for a plain text
    // box to opt into first, so there's no per-element handle set to compute.
    handles: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'left', 'right'],
    applyTextResize,
    applyTextPosition,
    applyWidthResize: applyCombWidth,
    widthFloor: combWidthFloor,
    writeDOM: ({ node, patch, handle, isRtl, startLeft, startTop, scaleFactor, pageWrapper, textStartSizePercent, getElementPercentSize, element }) => {
      // Side-handle drag on a comb: span only, and the font size is left alone.
      if (patch.width !== undefined) {
        const textDisplay = node.querySelector(`.${elementStyles['text-display']}`) as HTMLElement | null;
        const textInput = node.querySelector(`.${elementStyles['text-input']}`) as HTMLElement | null;
        const combNode = node.querySelector(`.${elementStyles['text-comb']}`) as HTMLElement | null;

        // Dragged past the floor: paint exactly what releasing here commits -
        // a plain text box, at its own natural width, back on its original
        // anchor. Not a hint or a highlight, the actual result, because the
        // decision being previewed ("this stops being a comb") is one the box
        // can simply show. Clearing the explicit width is what does it: with
        // the span gone the box measures itself from its text again, the same
        // as any other text element (see TextNode's measure div, which keeps
        // holding the real text throughout precisely so this works).
        if (patch.collapsed) {
          node.style.width = '';
          if (isRtl) node.style.right = `${100 - startLeft}%`;
          else node.style.left = `${startLeft}%`;
          if (combNode) combNode.style.display = 'none';
          if (textInput) textInput.style.color = (element as TextElement).color || '#000000';
          textDisplay?.classList.remove(elementStyles['text-display-comb']);
          return;
        }

        node.style.width = `${patch.width}%`;
        if (isRtl) node.style.right = `${100 - (patch.left as number)}%`;
        else node.style.left = `${patch.left as number}%`;

        // The overlay is mounted but hidden from the moment a side handle is
        // grabbed (isSpanResizing in TextNode), so it is here to be shown the
        // first frame the drag clears the floor - the box looks untouched
        // until then, which is the honest picture of a gesture that has not
        // made a comb yet. Guarded anyway: the state flush that mounts it is
        // asynchronous and a fast first move can beat it to the screen, in
        // which case the next frame finds it. Never built here by hand - a
        // node this module creates would sit outside Preact's vnode tree for
        // this subtree, and the next real render would layer its own overlay
        // next to it instead of replacing it (two sets of characters).
        if (!combNode) return;
        combNode.style.display = '';
        textDisplay?.classList.add(elementStyles['text-display-comb']);
        if (textInput) textInput.style.color = 'transparent';

        // The cells' `left: X%` is nominally relative to this same box, so it
        // would in principle track the width above through CSS alone - but
        // that's a percentage grid track nested inside an ancestor whose size
        // was just set via a raw style mutation, not a plain 100% fill like
        // everywhere else in this file, and it isn't guaranteed to resolve in
        // the same paint. Reading the box's own just-set width back and
        // writing pixel offsets removes the question: the digits track the
        // span exactly as it's dragged, the same as the box's own outline,
        // not only once the drag is released.
        const widthPx = node.getBoundingClientRect().width;
        const cells = combNode.querySelectorAll(`.${elementStyles['text-comb-cell']}`);
        cells.forEach((cell, index) => {
          (cell as HTMLElement).style.left = `${combCellCenterFraction(index, cells.length, isRtl) * widthPx}px`;
        });
        // Guides render only for cells.slice(1), so the i-th guide node is
        // cell (i + 1)'s left boundary - mirrored the same way as the cells
        // themselves so the dividers still line up with the digits between them.
        combNode.querySelectorAll(`.${elementStyles['text-comb-guide']}`).forEach((guide, i) => {
          const boundary = (i + 1) / cells.length;
          (guide as HTMLElement).style.left = `${(isRtl ? 1 - boundary : boundary) * widthPx}px`;
        });
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
