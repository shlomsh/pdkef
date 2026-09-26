import type { SymbolMark, TextAlign, TextDirection } from './editorModel.ts';

// SIGN-33: the one style a person dials in while filling a document, carried
// from field to field and round-tripped with the document's draft - exactly
// as SIGN-32 carried the font and size alone. `SignToolState.carried` is a
// `Partial<DocumentStyle>`: the first field that needs a key seeds it (or, for
// font/fontSize/direction, an explicit A-/A+ press, font pick, or typed
// script/direction change sets it - see SignToolContext.tsx's `SET_CARRIED`),
// and every field placed after takes it until the next explicit change. A new
// document starts from `{}`: its keys fall through to the app-wide style
// (SIGN-35, the person's latest choice in any document), then to the tool's
// own defaults - see elementDefaults.ts's `resolveDocumentStyle`.
//
// `dateFormat` is kept as a plain string (`DateFormatId`, `editor/text/
// dateFormat.ts`) rather than importing that type here: this model has no
// dependency on `editor/text/` (the same reason `editorModel.ts`'s
// `dateFormatId` field is a plain string), and `test:editor-dependency-
// directions` enforces that model code may only import model code.
export interface DocumentStyle {
  font: string;
  fontSize: number;
  direction: TextDirection;
  color: string;
  textAlign: TextAlign;
  bold: boolean;
  italic: boolean;
  /** A `DateFormatId` (`editor/text/dateFormat.ts`), kept as a plain string - see header comment. */
  dateFormat: string;
  symbolMark: SymbolMark;
  symbolWidth: number;
  strokeWidth: number;
  whiteoutColor: string;
  signatureWidth: number;
}

/**
 * SIGN-35: the keys that describe one form rather than the person filling it,
 * so they never enter the app-wide style a new document starts from. The size
 * is fitted to that form's own cells (SIGN-32: a new document never inherits
 * another's size), and the direction is the language that form is filled in
 * (SIGN-32 reopened: never a browser-wide preference).
 */
export const DOCUMENT_ONLY_KEYS: readonly (keyof DocumentStyle)[] = ['fontSize', 'direction'];

/** SIGN-35: `style` without its document-only keys - what may enter the
 * app-wide style, or be read back from it. */
export function appWideStyleOf(style: Partial<DocumentStyle>): Partial<DocumentStyle> {
  const appWide = { ...style };
  for (const key of DOCUMENT_ONLY_KEYS) delete appWide[key];
  return appWide;
}
