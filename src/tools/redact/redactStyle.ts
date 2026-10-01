import type { DocumentStyle } from '../../editor/model/documentStyle.ts';
import { DEFAULT_BLUR_STRENGTH, resolveBlurStrength, type BlurStrength } from '../../editor/model/blurStrength.ts';

// RED-40: the whiteout colour and blur strength are per-document style, like
// the brush. The order is the document's own choice, then the app-wide style a
// new document starts from, then the pre-RED-40 browser-wide preference, then
// the tool's default.

/** The whiteout colour a document starts with. */
export function resolveWhiteoutColor(
  carried: Partial<DocumentStyle> | undefined,
  appStyle: Partial<DocumentStyle>,
  legacy?: string | null,
): string {
  return carried?.whiteoutColor ?? appStyle.whiteoutColor ?? (legacy || undefined) ?? '#ffffff';
}

/** The blur strength a document starts with; a legacy name ('low'...) resolves to its number. */
export function resolveRedactBlurStrength(
  carried: Partial<DocumentStyle> | undefined,
  appStyle: Partial<DocumentStyle>,
  legacy?: unknown,
): BlurStrength {
  const first = [carried?.blurStrength, appStyle.blurStrength, legacy].find((v) => v !== undefined && v !== null && v !== '');
  return first === undefined ? DEFAULT_BLUR_STRENGTH : resolveBlurStrength(first);
}
