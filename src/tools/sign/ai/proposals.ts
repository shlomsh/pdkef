import { fieldTextInset } from '../../../lib/signHelpers.js';
import type { PageGeometry } from '../../../editor/geometry/coords.ts';
import type { EditorElement, TextElement } from '../../../editor/model/editorModel.ts';
import { createElementId } from '../../../editor/model/ids.ts';
import { placeTextOnField } from '../../../editor/text/combPlacement.ts';
import { resolveFontFamily } from '../../../editor/text/fonts.js';
import { placeSymbolOnRegion } from '../../../editor/registry/symbol.ts';
import { getElementDefinition } from '../../../editor/registry/index.ts';
import { DEFAULT_COLOR_BLUE, DEFAULT_FONT_FAMILY, DEFAULT_STROKE_WIDTH, MIN_FONT_SIZE_PT } from '../../../constants/signGeometry.js';

export interface Proposal {
  id: string; label: string; kind: 'text' | 'checkbox';
  x: number; y: number; width: number; height: number; value: string | null;
}
export type TextWidthMeasure = (text: string, fontFamily: string, fontSize: number) => number;
export interface Analysis { fields: Proposal[]; questions: string[] }

export function validateAnalysis(value: unknown, width: number, height: number): Analysis {
  if (!value || typeof value !== 'object') throw new Error('AI returned an invalid response. Continue manually or retry.');
  const result = value as Analysis;
  if (!Array.isArray(result.fields) || result.fields.length > 200 || !Array.isArray(result.questions)
    || result.questions.length > 100 || result.questions.some(q => typeof q !== 'string' || q.length > 2000)) throw new Error('AI returned an invalid field list.');
  const ids = new Set<string>();
  for (const field of result.fields) {
    if (!field || typeof field.id !== 'string' || !field.id || ids.has(field.id)
      || typeof field.label !== 'string' || field.label.length > 1000
      || !['text', 'checkbox'].includes(field.kind)
      || !(field.value === null || typeof field.value === 'string' && field.value.length <= 2000)
      || ![field.x, field.y, field.width, field.height].every(Number.isFinite)
      || field.x < 0 || field.y < 0 || field.width <= 0 || field.height <= 0
      || field.x + field.width > width || field.y + field.height > height) throw new Error('AI returned a field outside this page or an invalid answer. Continue manually or retry.');
    ids.add(field.id);
  }
  return { fields: result.fields, questions: result.questions };
}

// The model sees this exact full PDF.js viewport image: its crop, rotation and
// UserUnit already match the page percentages consumed by preview and export.
// A future tile renderer must supply its image-to-viewport transform here.
export function proposalElements(fields: Proposal[], image: {width: number; height: number}, pageIndex: number, geometry: PageGeometry, measureText: TextWidthMeasure): EditorElement[] {
  return fields.flatMap((field): EditorElement[] => {
    if (!field.value?.trim()) return [];
    const region = { pageIndex, left: field.x / image.width * 100, top: field.y / image.height * 100,
      width: field.width / image.width * 100, height: field.height / image.height * 100 };
    const id = createElementId();
    if (field.kind === 'checkbox') {
      if (!['true', 'yes', 'checked', 'check', 'x', '1'].includes(field.value.trim().toLowerCase())) return [];
      return [{ id, type: 'symbol', pageIndex, color: DEFAULT_COLOR_BLUE, mark: 'check',
        ...placeSymbolOnRegion(region, 'check', {pageWidthPoints: geometry.width, pageHeightPoints: geometry.height}) }];
    }
    const font = resolveFontFamily(DEFAULT_FONT_FAMILY, field.value);
    const options = {fontFamily: font, pageWidthPoints: geometry.width, pageHeightPoints: geometry.height};
    let placement = placeTextOnField({kind: 'cell', region}, {...options, carriedFontSize: null});
    const span = region.width / 100 * geometry.width;
    const measured = measureText(field.value, font, placement.fontSize);
    if (!Number.isFinite(measured) || measured <= 0) throw new Error('An answer could not be measured. Review it or continue manually.');
    if (measured > span) {
      const inset = fieldTextInset(span, 0, placement.fontSize);
      const fitted = placement.fontSize * (span - 2 * inset) / measured;
      if (fitted < MIN_FONT_SIZE_PT) throw new Error('An answer is too long for its field. Shorten it or clear it and fill manually.');
      placement = placeTextOnField({kind: 'cell', region}, {...options, carriedFontSize: fitted});
    }
    const create = getElementDefinition('text').creation.create!;
    const element = create({id, pageIndex, point: {left: region.left, top: region.top}, color: DEFAULT_COLOR_BLUE,
      font, fontSize: placement.fontSize, direction: null, whiteoutColor: '#ffffff', strokeWidth: DEFAULT_STROKE_WIDTH}) as TextElement;
    // A spanned cell anchors at its left edge for both scripts; TextNode aligns
    // Hebrew inside minWidth. Setting width would incorrectly create a comb.
    return [{ ...element, ...placement, text: field.value }];
  });
}
