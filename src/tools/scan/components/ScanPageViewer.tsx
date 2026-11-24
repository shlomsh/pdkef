import { useCallback, useLayoutEffect, useRef } from 'preact/hooks';
import styles from './ScanPageViewer.module.css';
import ScanUndoChip from './ScanUndoChip.tsx';
import ScanPageViewerBody, { viewerBack } from './ScanPageViewerBody.tsx';
import type { ScanPageViewerBodyProps } from './ScanPageViewerBody.tsx';

interface ScanPageViewerProps extends ScanPageViewerBodyProps {
  /** A removal Undo is offered for: the chip lives in the dialog, as the top layer hides anything outside it. */
  undo?: { position: number; onUndo: () => void } | null;
}

/** A ref runs before every layout effect of the page inside, which need the dialog open: a closed dialog has no width to scroll by. */
function openModal(dialog: HTMLDialogElement | null) {
  if (dialog && !dialog.open) dialog.showModal();
}

/** The one-page screen on every width: a full-screen modal over the grid, swiping (or, on a mouse device,
 * Previous, Next and the arrow keys) between pages in result mode, the corners in the same dialog. */
export default function ScanPageViewer({ undo, ...body }: ScanPageViewerProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const dialogOpened = useCallback((dialog: HTMLDialogElement | null) => { dialogRef.current = dialog; openModal(dialog); }, []);
  const { goBack } = viewerBack(body);
  const backRef = useRef(goBack);
  backRef.current = goBack;

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    // The browser may close a modal by itself, on a second Back with no tap between. That is a Back too, and if
    // the viewer stays it has to be open again.
    const closedByBrowser = () => { backRef.current(); dialog.showModal(); };
    dialog.addEventListener('close', closedByBrowser);
    return () => {
      dialog.removeEventListener('close', closedByBrowser);
      root.style.overflow = before;
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogOpened}
      class={styles.dialog}
      data-page-viewer
      onCancel={(event) => { event.preventDefault(); backRef.current(); }}
    >
      <ScanPageViewerBody {...body} />
      {undo && <ScanUndoChip viewer position={undo.position} onUndo={undo.onUndo} />}
    </dialog>
  );
}
