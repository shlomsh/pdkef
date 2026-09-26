import type { SymbolMark, TextAlign, TextDirection } from './editorModel.ts';

// SIGN-33: the one style a person dials in while filling a document, carried
// from field to field and round-tripped with the document's draft - exactly
// as SIGN-32 carried the font and size alone. `SignToolState.carried` is a
// `Partial<DocumentStyle>`: the first field that needs a key seeds it (or, for
// font/fontSize/direction, an explicit A-/A+ press, font pick, or typed
// script/direction change sets it - see SignToolContext.tsx's `SET_CARRIED`),
// and every field placed after takes it until the next explicit change. A new
// document starts from `{}` (the tool's own defaults), never from another
// document's values.
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
