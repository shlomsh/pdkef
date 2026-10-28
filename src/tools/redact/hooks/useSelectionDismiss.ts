import { useEffect, useRef } from 'preact/hooks';
import type { RedactToolType } from '#editor/model/editorModel.ts';
import type { RedactAction } from '../state/redactState.ts';
import { useTapOutsideDeselect } from './useTapOutsideDeselect.ts';
import styles from '../PdfRedactTool.module.css';

/**
 * Every way a selection or an armed tool is let go of without a toolbar press:
 * Escape (a shortcut for the status line's Stop chip, which a phone needs
 * because it has no Escape key), a tap on blank page area, and a click anywhere
 * outside the selected box. Returns the tap handlers the page container needs.
 */
export default function useSelectionDismiss({ activeStyle, activeBoxId, selectedBoxId, dispatch }: {
  activeStyle: RedactToolType | null;
  activeBoxId: string | null;
  selectedBoxId: string | null;
  dispatch: (action: RedactAction) => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!activeStyle && !activeBoxId && !selectedBoxId) return;
      dispatch({ type: 'ESCAPED' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeStyle, activeBoxId, selectedBoxId]);

  // With no tool armed, a tap on blank page area is the phone's way out of a
  // selection (the tool disarms after one placement, so this is the usual state
  // right after drawing a box). An armed tool's own page handler deselects.
  const tapOutside = useTapOutsideDeselect({
    onDeselect: () => dispatch({ type: 'SELECTION_CLEARED' }),
    isArmed: () => !!activeStyle,
    excludedSelector: [
      `.${styles['redact-box']}`,
      '[data-editor-actions]',
      '[data-editor-resizer]',
      '[data-editor-color-menu]',
      '[data-redact-find-match]',
      'button',
      'a',
      'input',
    ].join(', '),
  });

  // A click anywhere outside the selected box drops the selection, not only on
  // blank page area: the page header, the margin and the rest of the screen
  // too. A document listener, so it is one path wherever the click lands; the
  // container keeps the touch handlers for iOS's jittery taps (MOBI-30). Read
  // through a ref so the listener is added once and still sees this render's
  // `isArmed`.
  const tapOutsideRef = useRef(tapOutside);
  tapOutsideRef.current = tapOutside;
  useEffect(() => {
    const onDocumentClick = (e: MouseEvent) => tapOutsideRef.current.onClick(e);
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, []);

  return tapOutside;
}
