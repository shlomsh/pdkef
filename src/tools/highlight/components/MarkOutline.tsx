import { useEffect, useState } from 'preact/hooks';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { outlineVertices } from '../lib/outline/markOutline.ts';
import { strokeSeed } from '#editor/geometry/sketchStroke.ts';
import { bandRectsPts } from '#editor-ui/highlight/HighlightNode.tsx';
import { reportError } from '#lib/telemetry/errorReport.ts';
import styles from './MarkOutline.module.css';

/** rough.js is fetched on the first open mark and never before (READ-13): the first paint carries none of it. */
let pencil: Promise<typeof import('../lib/outline/markOutlinePath.ts')> | null = null;
const loadPencil = () => (pencil ??= import('../lib/outline/markOutlinePath.ts'));

/**
 * READ-13: the pencil outline around an open mark, a double line that follows the passage line by line. The path is a pure
 * function of the mark's bands and id, so a mark draws the same outline every time it opens. `faint` is the card-hover pass.
 */
export default function MarkOutline({ mark, boxPts, turns, faint = false }: {
  mark: HighlightElement;
  boxPts: { width: number; height: number };
  turns: number;
  faint?: boolean;
}) {
  const [d, setD] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    const vertices = outlineVertices(bandRectsPts(mark.bands, boxPts), turns);
    loadPencil().then((m) => { if (current) setD(m.outlinePath(vertices, strokeSeed(mark.id))); })
      .catch((err) => reportError('pdf_render', err, 'draw_mark_outline'));
    return () => { current = false; };
  }, [mark.id, mark.bands, boxPts.width, boxPts.height, turns]);
  if (!d) return null;
  return (
    <svg data-mark-outline viewBox={`0 0 ${boxPts.width} ${boxPts.height}`} preserveAspectRatio="none" aria-hidden="true" class={faint ? `${styles.outline} ${styles.faint}` : styles.outline}>
      <path d={d} pathLength="1" vector-effect="non-scaling-stroke" />
    </svg>
  );
}
