import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import {
  DEFAULT_COLOR_BLUE,
  DEFAULT_STROKE_WIDTH,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE_PT,
  DEFAULT_SYMBOL_WIDTH_PCT,
  DEFAULT_START_WIDTH_PCT
} from '../../constants/signGeometry.js';
import type { SymbolMark, TextDirection } from '../../editor/model/editorModel.ts';

const noop = () => {};

export interface SignDefaultsContextValue {
  lastColor: string;
  lastWhiteoutColor: string;
  lastFont: string;
  lastFontSize: number;
  lastDirection: TextDirection | null;
  lastThickness: number;
  lastSymbolWidth: number;
  lastSymbolMark: SymbolMark;
  lastSignatureWidth: number;
  rememberColor: (color: string) => void;
  rememberWhiteoutColor: (color: string) => void;
  rememberFont: (fontFamily: string) => void;
  rememberFontSize: (fontSize: number) => void;
  rememberDirection: (textDirection: TextDirection) => void;
  rememberThickness: (strokeWidth: number) => void;
  rememberSymbolWidth: (width: number) => void;
  rememberSymbolMark: (mark: SymbolMark) => void;
  rememberSignatureWidth: (width: number) => void;
}

// Creation defaults for a freshly placed annotation - the color/font/thickness/
// etc remembered from whatever was last placed or edited. Read directly by
// PdfWorkspace's gesture wiring and its onChange callbacks; nothing below that
// needs any of it, so unlike SavedSignaturesContext it never reaches
// SignToolbar (see E8.B3). The default value mirrors the same fallback
// constants PdfWorkspace's props used to default to, so a consumer mounted
// without a real Provider above it (an isolated test) behaves the same as
// before this moved out of props.
export const SignDefaultsContext = createContext<SignDefaultsContextValue>({
  lastColor: DEFAULT_COLOR_BLUE,
  lastWhiteoutColor: '#ffffff',
  lastFont: DEFAULT_FONT_FAMILY,
  lastFontSize: DEFAULT_FONT_SIZE_PT,
  lastDirection: null,
  lastThickness: DEFAULT_STROKE_WIDTH,
  lastSymbolWidth: DEFAULT_SYMBOL_WIDTH_PCT,
  lastSymbolMark: 'check',
  lastSignatureWidth: DEFAULT_START_WIDTH_PCT,
  rememberColor: noop,
  rememberWhiteoutColor: noop,
  rememberFont: noop,
  rememberFontSize: noop,
  rememberDirection: noop,
  rememberThickness: noop,
  rememberSymbolWidth: noop,
  rememberSymbolMark: noop,
  rememberSignatureWidth: noop
});

export function useSignDefaults() {
  return useContext(SignDefaultsContext);
}
