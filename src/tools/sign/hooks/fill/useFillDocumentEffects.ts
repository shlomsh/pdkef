import type { EditorElement } from '../../../../editor/model/editorModel.ts';
import type { SignToolAction } from '../../components/SignToolContext.tsx';
import { useFillFocus } from './useFillFocus.ts';
import { useFillViewportLock } from './useFillViewportLock.ts';

/** The two document-level effects fill mode owns, in the order they have always run. */
export function useFillDocumentEffects(
  enabled: boolean,
  dispatch: (action: SignToolAction) => void,
  elements: EditorElement[],
): void {
  useFillViewportLock(enabled);

  useFillFocus({
    enabled,
    dispatch,
    textOf: (elementId) => {
      const element = elements.find((el) => el.id === elementId);
      return element?.type === 'text' ? element.text : undefined;
    },
  });
}
