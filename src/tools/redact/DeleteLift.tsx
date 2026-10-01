import { useEffect, useRef, useState } from 'preact/hooks';
import styles from './PdfRedactTool.module.css';
import { PEEL, easeInOut, peelDistance, peelFrame } from './peelGeometry.ts';

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
 * peels off like a sticker (RED-28, peelGeometry.ts) and flies away. Without
 * that wait the object would vanish and blink back while the new drawing is
 * still being made. The peel writes to the DOM each frame and never touches
 * state.
 */
export default function DeleteLift({ lift, onDone }: { lift: Lift; onDone: (id: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const frontRef = useRef<HTMLImageElement | null>(null);
  const flyRef = useRef<HTMLDivElement | null>(null);
  const foldRef = useRef<HTMLDivElement | null>(null);
  const flapRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    const box = ref.current;
    const front = frontRef.current;
    const fly = flyRef.current;
    const fold = foldRef.current;
    const flap = flapRef.current;
    if (!lifting || !box || !front || !fly || !fold || !flap) return undefined;
    const { width, height } = box.getBoundingClientRect();
    const distance = peelDistance(width, height, PEEL.foldAngleDeg);
    let raf = 0;
    let timer = 0;
    const start = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - start) / PEEL.peelMs);
      const frame = peelFrame(width, height, easeInOut(u) * distance, PEEL.foldAngleDeg);
      front.style.clipPath = frame.front;
      flap.style.clipPath = frame.flap;
      fold.style.transform = frame.fold;
      if (u < 1) {
        raf = requestAnimationFrame(step);
        return;
      }
      fly.style.transition = `transform ${PEEL.flyMs}ms ease-in, opacity ${PEEL.flyMs}ms ease-in`;
      fly.style.transform = `translate(${-PEEL.flyDistancePx}px, ${-PEEL.flyDistancePx * 0.9}px) rotate(${-PEEL.flySpinDeg}deg)`;
      fly.style.opacity = '0';
      timer = window.setTimeout(() => onDone(lift.id), PEEL.flyMs);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [lifting]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={styles['delete-lift']}
      style={{
        left: `${lift.rect.left}%`,
        top: `${lift.rect.top}%`,
        width: `${lift.rect.width}%`,
        height: `${lift.rect.height}%`,
      }}
    >
      <img ref={frontRef} src={lift.image} alt="" />
      <div ref={flyRef} className={styles['delete-lift-fly']}>
        <div ref={foldRef} className={styles['delete-lift-fold']}>
          <div ref={flapRef} className={styles['delete-lift-flap']} style={{ clipPath: 'polygon(0 0, 0 0, 0 0)' }} />
        </div>
      </div>
    </div>
  );
}
