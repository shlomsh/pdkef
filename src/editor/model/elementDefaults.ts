// SIGN-33: the creation-default fields a NEW element of a given type starts
// with, from the document's carried style (documentStyle.ts) - a carried key
// wins, an absent one falls back to the tool's own default. Pure and
// type-agnostic: it knows nothing about a field's own detected height
// (combPlacement.ts's fieldFontSize still owns that fit, and stays the one
// place that shrinks or grows a seeded size to a specific field) or about
// pageDirections/auto-detect fallbacks (still each caller's own concern) -
// this only answers "carried, or the tool default, for this element type".
//
// `defaults` is a plain argument rather than a set of constants imported
// here: this file lives under `src/editor/model/`, and
// `test:editor-dependency-directions` only lets model code import model
// code, never `src/constants/signGeometry.js`. Taking the tool's defaults as
// data keeps the one set of constants (signGeometry.js) the single source of
// truth instead of a second copy living in the model layer.
import type { DocumentStyle } from './documentStyle.ts';
import type { EditorElement, SymbolMark, TextAlign, TextDirection } from './editorModel.ts';

/** The creation-default fields for a freshly placed element, keyed by the
 * element-model field name each one lands on (not by `DocumentStyle`'s own
 * key) - see editorModel.ts for each field's home type. Every field is
 * optional: a type that has no use for a given key (a rectangle has no
 * `mark`) simply never includes it. */
export interface ElementCreationDefaults {
  fontFamily?: string;
  fontSize?: number;
  textDirection?: TextDirection;
  color?: string;
  textAlign?: TextAlign;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  /** A `DateFormatId` (editor/text/dateFormat.ts), kept as a plain string -
   * see documentStyle.ts's own `dateFormat` field for why. Present on 'text'
   * defaults for the caller that is about to prefill a date box; an ordinary
   * text placement simply never reads it. */
  dateFormatId?: string;
  mark?: SymbolMark;
  width?: number;
  strokeWidth?: number;
}

/**
 * The text styling a document carries that an element never has on its own
 * until someone sets it (SIGN-33): alignment, bold, italic. Only the keys the
 * document actually carries come back, so an unset alignment still follows
 * the text's direction (getTextAlign) and an unset weight stays the default.
 */
export function carriedTextStyle(carried: Partial<DocumentStyle>): Pick<ElementCreationDefaults, 'textAlign' | 'fontWeight' | 'fontStyle'> {
  const style: Pick<ElementCreationDefaults, 'textAlign' | 'fontWeight' | 'fontStyle'> = {};
  if (carried.textAlign) style.textAlign = carried.textAlign;
  if (carried.bold !== undefined) style.fontWeight = carried.bold ? 'bold' : 'normal';
  if (carried.italic !== undefined) style.fontStyle = carried.italic ? 'italic' : 'normal';
  return style;
}

function carriedOrDefault<K extends keyof DocumentStyle>(
  carried: Partial<DocumentStyle>,
  defaults: DocumentStyle,
  key: K,
): DocumentStyle[K] {
  return carried[key] ?? defaults[key];
}

/**
 * The creation defaults a new element of `type` starts with: every key
 * present in `carried` wins, otherwise `defaults`' own value for that key.
 *
 * Whiteout is the one deliberate exception (SIGN-33's rule): its fill comes
 * from `carried.whiteoutColor`/`defaults.whiteoutColor`, never from
 * `carried.color` - the same split `useWorkspaceGestures.ts`'s creation call
 * already keeps between `color` and `whiteoutColor` today.
 */
export function elementDefaultsFor(
  carried: Partial<DocumentStyle>,
  type: EditorElement['type'],
  defaults: DocumentStyle,
): ElementCreationDefaults {
  const value = <K extends keyof DocumentStyle>(key: K): DocumentStyle[K] =>
    carriedOrDefault(carried, defaults, key);

  switch (type) {
    case 'text':
      return {
        fontFamily: value('font'),
        // Size, direction and alignment come from the carried style only: each
        // has a contextual fallback the caller owns (fieldFontSize seeds the
        // size from the first field, a detected field falls back to the page's
        // printed direction, and an unset alignment follows the text's own
        // direction via getTextAlign). A fixed default here would override all
        // three.
        fontSize: carried.fontSize,
        textDirection: carried.direction,
        color: value('color'),
        textAlign: carried.textAlign,
        fontWeight: value('bold') ? 'bold' : 'normal',
        fontStyle: value('italic') ? 'italic' : 'normal',
        dateFormatId: value('dateFormat'),
      };
    case 'symbol':
      return {
        mark: value('symbolMark'),
        width: value('symbolWidth'),
        color: value('color'),
      };
    case 'rectangle':
    case 'ellipse':
    case 'line':
      return {
        strokeWidth: value('strokeWidth'),
        color: value('color'),
      };
    case 'whiteout':
      return {
        color: value('whiteoutColor'),
      };
    case 'signature':
      return {
        width: value('signatureWidth'),
      };
    default:
      // 'blackout'/'blur' (Redact-only types) carry no document style at all.
      return {};
  }
}
