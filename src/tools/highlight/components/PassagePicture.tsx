import { useLayoutEffect, useRef } from 'preact/hooks';
import type { EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import { anchorNode } from '#editor-ui/comments/anchorNode.ts';
import { bandRects, passageCrop } from '../lib/notes/passageCrop.ts';
import styles from './PassagePicture.module.css';

const BAND_ALPHA = 0.45;
const LINE_PX = 2;

/** READ-19: the passage a note belongs to, cut from the page canvas and painted in the mark's colour. Nothing when any piece is missing. */
export default function PassagePicture({ elements, noteId }: { elements: readonly EditorElement[]; noteId: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = useRef({ width: 0, height: 0 });

  const markNode = noteId ? anchorNode(elements, noteId) : null;
  const id = markNode?.getAttribute('data-editor-element-id');
  const mark = elements.find((el): el is HighlightElement => el.id === id && el.type === 'highlight') ?? null;
  const source = markNode?.closest('[data-page-overlay]')?.parentElement?.querySelector<HTMLCanvasElement>('canvas') ?? null;
  const markRect = markNode?.getBoundingClientRect();
  const canvasRect = source?.getBoundingClientRect();
  const ok = !!(mark && source && markRect && canvasRect && canvasRect.width > 0 && canvasRect.height > 0 && source.width > 0 && source.height > 0);
  const crop = ok ? passageCrop({ mark: markRect, canvas: canvasRect, canvasPx: { width: source.width, height: source.height } }) : null;
  if (crop) size.current = { width: crop.width, height: crop.height };

  useLayoutEffect(() => {
    const target = ref.current;
    if (!target || !crop || !mark || !source || !markRect || !canvasRect) return;
    const dpr = window.devicePixelRatio || 1;
    target.width = Math.round(crop.width * dpr);
    target.height = Math.round(crop.height * dpr);
    const g = target.getContext('2d');
    if (!g) return;
    g.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, target.width, target.height);
    g.save();
    g.scale(dpr, dpr);
    g.fillStyle = mark.color;
    const rects = bandRects(markRect, mark.bands, crop.offsetTop, markRect.left - canvasRect.left);
    if (mark.style === 'underline') {
      for (const r of rects) g.fillRect(r.left, r.top + r.height - LINE_PX, r.width, LINE_PX);
    } else {
      g.globalCompositeOperation = 'multiply';
      g.globalAlpha = BAND_ALPHA;
      for (const r of rects) g.fillRect(r.left, r.top, r.width, r.height);
    }
    g.restore();
  });

  if (!crop) return null;
  return (
    <div class={styles.picture}>
      <canvas ref={ref} class={styles.canvas} data-passage-picture aria-hidden="true" style={{ width: `${size.current.width}px` }} />
    </div>
  );
}
