import { useEffect, useState } from 'preact/hooks';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { bandRectsPts } from '#editor-ui/highlight/HighlightNode.tsx';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { hatchInkAttrs, hatchPathD } from '#editor/geometry/hatchInk.ts';
import { hatchIfLoaded, loadHatch } from '../lib/outline/hatchLoader.ts';
import styles from './MarkHatch.module.css';

/**
 * READ-14: a Pencil mark, hatched in its color. HighlightNode lays it in the mark's layer, so it multiplies, takes the mark's
 * opacity and deepens when its note is focused exactly like the bands. rough.js is fetched on the first Pencil mark.
 */
export default function MarkHatch({ mark, boxPts }: { mark: HighlightElement; boxPts: { width: number; height: number } }) {
  const [hatch, setHatch] = useState(hatchIfLoaded);
  useEffect(() => {
    if (hatch) return;
    let current = true;
    loadHatch().then((m) => { if (current) setHatch(m); }).catch((err) => reportError('pdf_render', err, 'draw_mark_hatch'));
    return () => { current = false; };
  }, [hatch]);
  if (!hatch) return null;
  const d = hatchPathD(hatch.hatchOps, bandRectsPts(mark.bands, boxPts), mark.id);
  return (
    <svg data-highlight-hatch viewBox={`0 0 ${boxPts.width} ${boxPts.height}`} preserveAspectRatio="none" aria-hidden="true" class={styles.hatch}>
      <path d={d} {...hatchInkAttrs(mark.color)} />
    </svg>
  );
}
