import type { EditorElement, EditorElementPatch, TextDirection } from './editorModel.ts';
import type { DocumentStyle } from './documentStyle.ts';

/**
 * SIGN-33: what an explicit change to an element carries forward to the
 * document's remembered style (`SignToolState.carried`, `documentStyle.ts`).
 * Mirrors `PdfWorkspace.tsx`'s `makeOnChange`
 * (`src/tools/sign/components/PdfWorkspace.tsx`) field by field, so it can
 * replace that function's one `remember*` call per key with one mapping.
 * Geometry-only patches (left/top, height, resize deltas that don't touch a
 * remembered field) carry nothing, same as today.
 *
 * `detectDirection` is injected rather than imported directly
 * (`detectTextDirection`, `src/lib/signHelpers.js`) because model code may
 * only depend on other model code - `test:editor-dependency-directions`
 * enforces it.
 */
export function carriedPatchFor(
  element: EditorElement,
  patch: EditorElementPatch,
  detectDirection: (text: string) => TextDirection | null,
): Partial<DocumentStyle> {
  const carried: Partial<DocumentStyle> = {};

  if (patch.color) {
    if (element.type === 'whiteout') {
      carried.whiteoutColor = patch.color;
    } else {
      carried.color = patch.color;
    }
  }

  if ('fontFamily' in patch && patch.fontFamily) {
    carried.font = patch.fontFamily;
  }
  // SIGN-32: every size the person sets carries to the next field - A-/A+,
  // and a text box's resize drag too - but a placement's own fit-shrink
  // never comes through here, so it never carries.
  if ('fontSize' in patch && patch.fontSize) {
    carried.fontSize = patch.fontSize;
  }
  if ('strokeWidth' in patch && patch.strokeWidth) {
    carried.strokeWidth = patch.strokeWidth;
  }
  // A resized symbol/signature sets the size for the next one placed.
  if (element.type === 'symbol' && 'width' in patch && patch.width !== undefined) {
    carried.symbolWidth = patch.width;
  }
  if (element.type === 'symbol' && 'mark' in patch && patch.mark !== undefined) {
    carried.symbolMark = patch.mark;
  }
  if (element.type === 'signature' && 'width' in patch && patch.width !== undefined) {
    carried.signatureWidth = patch.width;
  }

  if (element.type === 'text') {
    if ('textDirection' in patch && patch.textDirection) {
      carried.direction = patch.textDirection;
    } else if ('text' in patch && patch.text !== undefined && !('dateFormatId' in patch) && !element.dateValue) {
      // Only typed text says which language the person writes in. A date's
      // text is generated from its format (a locale date reads "September"
      // even on a Hebrew form), so it never carries a direction (SIGN-34).
      const typedDirection = detectDirection(patch.text);
      if (typedDirection) carried.direction = typedDirection;
    }
    // A format switched on one date field (ElementToolbar's cycling control)
    // sets the format for the next 'date' tool placement, same as font/color.
    if ('dateFormatId' in patch && patch.dateFormatId) {
      carried.dateFormat = patch.dateFormatId;
    }
    if ('textAlign' in patch && patch.textAlign) {
      carried.textAlign = patch.textAlign;
    }
    if ('fontWeight' in patch && patch.fontWeight) {
      carried.bold = patch.fontWeight === 'bold';
    }
    if ('fontStyle' in patch && patch.fontStyle) {
      carried.italic = patch.fontStyle === 'italic';
    }
  }

  return carried;
}
