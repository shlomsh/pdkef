// SIGN-35: every explicit change writes both the document's own style and the
// app-wide style a new document starts from - this is the one place that does
// both, so PdfWorkspace's makeOnChange has one call instead of two.

import type { EditorElement, EditorElementPatch } from '../../editor/model/editorModel.ts';
import type { DocumentStyle } from '../../editor/model/documentStyle.ts';
import { appStylePatchFor, carriedPatchFor } from '../../editor/model/carriedPatch.ts';
import { detectTextDirection } from '../../lib/signHelpers.js';
import { rememberAppStyle } from '../../editor/workspace/preferenceStore.ts';
import type { SignToolAction } from './components/SignToolContext.tsx';

export function chooseStyle(
  element: EditorElement,
  patch: EditorElementPatch,
  dispatch: (action: SignToolAction) => void,
  remember: (patch: Partial<DocumentStyle>) => unknown = rememberAppStyle,
): void {
  const carriedPatch = carriedPatchFor(element, patch, detectTextDirection);
  if (Object.keys(carriedPatch).length > 0) dispatch({ type: 'SET_CARRIED', payload: carriedPatch });

  const appPatch = appStylePatchFor(carriedPatch, patch);
  if (Object.keys(appPatch).length > 0) {
    dispatch({ type: 'SET_APP_STYLE', payload: appPatch });
    remember(appPatch);
  }
}
