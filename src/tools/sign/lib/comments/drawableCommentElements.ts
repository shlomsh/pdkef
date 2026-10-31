// SIGN-44: the comments page must never block an export. Its text is cut to the characters the
// resolved font can draw (the full comment stays in the annotation's /Contents), and an element whose
// font cannot load is skipped rather than thrown over.
import type { PDFFont } from '@cantoo/pdf-lib';
import type { TextElement } from '#editor/model/editorModel.ts';
import { resolveTypography } from '#editor/text/fonts.js';
import { unrepresentableCharacters } from '#editor/text/textMetrics.ts';

type LoadFont = (family: string, weight: string, style: string) => Promise<PDFFont | null>;

export async function drawableCommentElements(elements: readonly TextElement[], loadFont: LoadFont): Promise<TextElement[]> {
  const kept: TextElement[] = [];
  for (const element of elements) {
    const t = resolveTypography(element.fontFamily, element.text, element.fontWeight, element.fontStyle, element.fontSize);
    const font = await loadFont(t.family, t.weight, t.style);
    if (!font) continue;
    const missing = new Set(unrepresentableCharacters(font, element.text));
    const text = missing.size ? [...element.text].filter((ch) => !missing.has(ch)).join('') : element.text;
    if (text.trim()) kept.push(text === element.text ? element : { ...element, text });
  }
  return kept;
}
