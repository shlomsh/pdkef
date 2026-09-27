import { useEffect, useRef, useState } from 'preact/hooks';
import styles from './PdfRedactTool.module.css';

export interface Lift {
  id: string;
  pageIndex: number;
  rect: { left: number; top: number; width: number; height: number };
  /** The object as it looked on the page when it was clicked. */
  image: string;
  /** The document the page was drawn from at that moment; the lift waits for
   * a paint from any other one, which is the page without the object. */
  paintedFrom: unknown;
}

// A repaint that never comes (a slow phone, or the preview failed) must not
// leave the snapshot standing over the page.
const FALLBACK_MS = 1500;

/** Copies the part of a page canvas under `rect` (percent of the page) into a
 * data URL, or null when there is nothing to copy. */
export function snapshotRect(canvas: HTMLCanvasElement | null | undefined, rect: Lift['rect']): string | null {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
  const sx = (rect.left / 100) * canvas.width;
  const sy = (rect.top / 100) * canvas.height;
  const sw = Math.max(1, (rect.width / 100) * canvas.width);
  const sh = Math.max(1, (rect.height / 100) * canvas.height);
  const copy = document.createElement('canvas');
  copy.width = Math.ceil(sw);
  copy.height = Math.ceil(sh);
  const context = copy.getContext('2d');
  if (!context) return null;
  context.drawImage(canvas, sx, sy, sw, sh, 0, 0, copy.width, copy.height);
  return copy.toDataURL();
}

/**
 * RED-13: the moment an object is deleted. A snapshot of it sits exactly over
 * the page, so nothing changes at first; once the page has been drawn again
 * without the object (PdfPageCanvas's `page-painted` event), the snapshot
 * lifts off and fades. Without that wait the object would vanish and blink
 * back while the new drawing is still being made.
 */
export default function DeleteLift({ lift, onDone }: { lift: Lift; onDone: (id: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [lifting, setLifting] = useState(false);

  useEffect(() => {
    const page = ref.current?.parentElement;
    if (!page) return undefined;
    const onPainted = (event: Event) => {
      const painted = (event as CustomEvent<{ pdfDocument: unknown }>).detail?.pdfDocument;
      if (painted && painted !== lift.paintedFrom) setLifting(true);
    };
    page.addEventListener('page-painted', onPainted);
    const timer = window.setTimeout(() => setLifting(true), FALLBACK_MS);
    return () => {
      page.removeEventListener('page-painted', onPainted);
      window.clearTimeout(timer);
    };
  }, [lift.paintedFrom]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`${styles['delete-lift']} ${lifting ? styles.lifting : ''}`}
      style={{
        left: `${lift.rect.left}%`,
        top: `${lift.rect.top}%`,
        width: `${lift.rect.width}%`,
        height: `${lift.rect.height}%`,
      }}
      onAnimationEnd={() => onDone(lift.id)}
    >
      <img src={lift.image} alt="" />
    </div>
  );
}
