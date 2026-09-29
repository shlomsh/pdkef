import { useEffect, useRef } from 'preact/hooks';
import { startGesture } from '../../lib/gestures/controller.ts';
import { makeStroke } from '../../editor/model/strokeGeometry.ts';
import { uniqueId } from '../../editor/model/ids.ts';
import usePdfCoordinates from '../../editor-ui/hooks/usePdfCoordinates.ts';
import styles from './BrushLayer.module.css';

// RED-32: the painting surface over one page while a brush is armed. A press
// starts a stroke, the drag paints an SVG path straight in the DOM (never
// through state - the gesture golden rule), and the release commits ONE
// element. The brush ring is a DOM node moved on pointer move, not state.

const FALLBACK_PAGE_HEIGHT_PT = 792;

export type BrushKind = 'blur' | 'whiteout';

/** The committed stroke, exactly what makeStroke returns. */
export type CommittedStroke = ReturnType<typeof makeStroke>;

export default function BrushLayer({
  pageIndex,
  kind,
  sizePt,
  color,
  strength,
  pageWidthPt,
  pageHeightPt,
  onCommit,
}: {
  pageIndex: number;
  kind: BrushKind;
  sizePt: number;
  /** Whiteout only: the paint colour. */
  color?: string;
  strength?: unknown;
  /** The page height in points; the width follows from the rendered aspect. */
  pageWidthPt?: number;
  pageHeightPt?: number;
  onCommit: (stroke: CommittedStroke) => void;
}) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const { getPointerCoords } = usePdfCoordinates();

  // Read at press time so a size change mid-page needs no re-subscription.
  const latest = useRef({ kind, sizePt, color, strength, pageWidthPt, pageHeightPt, onCommit, pageIndex });
  latest.current = { kind, sizePt, color, strength, pageWidthPt, pageHeightPt, onCommit, pageIndex };

  useEffect(() => () => cancelRef.current?.(), []);

  const pxPerPt = () => {
    const rect = layerRef.current?.getBoundingClientRect();
    const heightPt = latest.current.pageHeightPt ?? FALLBACK_PAGE_HEIGHT_PT;
    return rect && rect.height ? rect.height / heightPt : 1;
  };

  const sizeRing = () => {
    const ring = ringRef.current;
    if (!ring) return;
    const diameter = latest.current.sizePt * pxPerPt();
    ring.style.width = `${diameter}px`;
    ring.style.height = `${diameter}px`;
  };

  const moveRing = (clientX: number, clientY: number) => {
    const ring = ringRef.current;
    const rect = layerRef.current?.getBoundingClientRect();
    if (!ring || !rect) return;
    sizeRing();
    ring.style.transform = `translate(${clientX - rect.left}px, ${clientY - rect.top}px) translate(-50%, -50%)`;
    ring.style.opacity = '1';
  };

  const onPress = (e: MouseEvent | TouchEvent) => {
    // Two fingers mean pinch-zoom, not paint.
    if ('touches' in e && (e.touches?.length ?? 0) > 1) return;
    const layer = layerRef.current;
    const path = pathRef.current;
    if (!layer || !path) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    cancelRef.current?.();

    const rect = layer.getBoundingClientRect();
    const scale = pxPerPt();
    const { kind: strokeKind, sizePt: strokeSize, color: strokeColor, strength: strokeStrength } = latest.current;
    const toLocal = (ev: MouseEvent | TouchEvent): [number, number] => {
      const p = getPointerCoords(ev as never);
      return [
        Math.min(rect.width, Math.max(0, p.x - rect.left)),
        Math.min(rect.height, Math.max(0, p.y - rect.top)),
      ];
    };
    const paint = (pts: [number, number][]) => {
      path.setAttribute('d', pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' '));
    };
    const clear = () => path.removeAttribute('d');

    path.setAttribute('stroke-width', String(strokeSize * scale));
    // CSSOM writes: a CSS rule outranks a presentation attribute, and
    // element.style.* is exempt from a strict CSP style-src.
    if (strokeKind === 'whiteout' && strokeColor) path.style.setProperty('stroke', strokeColor);
    else path.style.removeProperty('stroke');

    const first = toLocal(e);
    const points: [number, number][] = [first];
    // A press with no drag is a dot: two identical points draw a round cap.
    paint([first, first]);
    cancelRef.current = startGesture<[number, number][]>({
      computePatch: (ev) => {
        if ('touches' in ev && ev.cancelable) ev.preventDefault();
        points.push(toLocal(ev));
        return points;
      },
      writeDOM: (pts) => {
        paint(pts);
        const last = pts[pts.length - 1];
        moveRing(rect.left + last[0], rect.top + last[1]);
      },
      commit: (pts) => {
        cancelRef.current = null;
        clear();
        const list = pts && pts.length ? pts : points;
        const percent = list.map(([x, y]) => [(x / rect.width) * 100, (y / rect.height) * 100] as [number, number]);
        const heightPt = latest.current.pageHeightPt ?? FALLBACK_PAGE_HEIGHT_PT;
        const stroke = makeStroke(strokeKind === 'blur' ? 'blurStroke' : 'whiteoutStroke', {
          id: uniqueId(),
          pageIndex: latest.current.pageIndex,
          points: percent,
          sizePt: strokeSize,
          pageWidthPt: latest.current.pageWidthPt ?? heightPt * (rect.width / rect.height),
          pageHeightPt: heightPt,
          color: strokeColor,
          strength: strokeStrength,
        });
        latest.current.onCommit(stroke);
      },
      cancel: () => {
        cancelRef.current = null;
        clear();
      },
    });
  };

  return (
    <div
      ref={layerRef}
      className={styles.layer}
      data-brush-layer
      onMouseDown={onPress}
      onTouchStart={onPress}
      onMouseMove={(e) => { if (!cancelRef.current) moveRing(e.clientX, e.clientY); }}
      onMouseLeave={() => { if (ringRef.current) ringRef.current.style.opacity = '0'; }}
    >
      <svg className={styles.paint} aria-hidden="true">
        <path ref={pathRef} className={styles.path} fill="none" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <div ref={ringRef} className={styles.ring} aria-hidden="true" />
    </div>
  );
}
