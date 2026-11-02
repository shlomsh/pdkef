import type { HighlightElement } from '#editor/model/editorModel.ts';
import type { ElementNodeChange, ElementNodeProps } from '../nodeProps.ts';
import { sketchBands, sketchUnderline, strokeSeed, svgPath, type SketchRect } from '#editor/geometry/sketchStroke.ts';
import { UNDERLINE_LIFT, UNDERLINE_WIDTH, underlineInk } from '#editor/model/underlineInk.ts';
import styles from './HighlightNode.module.css';

/** READ-11: a sketched mark's one path (`d`) and fill for rects in points; the screen and print draw it the same way. */
export function sketchMark(element: HighlightElement, rects: SketchRect[], turns: number) {
  const seed = strokeSeed(element.id);
  const underline = element.style === 'underline';
  const ops = underline ? sketchUnderline(rects, seed, element.strokeWidth ?? UNDERLINE_WIDTH.default, turns) : sketchBands(rects, seed, turns);
  return { d: svgPath(ops), fill: underline ? underlineInk(element.color) : element.color };
}

/* SIGN-46: bands are percents of the element's own box. The draft container
 * stays empty in render - the swipe gesture paints live bands into it.
 * Comments are their own elements now (CommentNode), so a highlight draws no dot. */
export default function HighlightNode({ element, isActive, boxPts, turns = 0 }: ElementNodeProps<HighlightElement> & {
  /** READ-11: the element's box in PDF points; with it a `stroke: 'sketch'` mark draws as one svg path (Sign passes none). */
  boxPts?: { width: number; height: number };
  /** The page's quarter turns, which the sketched underline follows (the clean one reads them from `data-page-turns`). */
  turns?: number;
  onChange?: ElementNodeChange<HighlightElement>;
  onSelect?: (event: Event) => void;
}) {
  const sketchPath = element.stroke === 'sketch' && boxPts ? sketchMark(element, element.bands.map((b) => ({
    x: (b.left / 100) * boxPts.width, y: (b.top / 100) * boxPts.height, w: (b.width / 100) * boxPts.width, h: (b.height / 100) * boxPts.height,
  })), turns) : null;
  const underline = element.style === 'underline';
  const ink = underline ? underlineInk(element.color) : undefined;
  // The live swipe and the committed bands share the mark's opacity, so the ink never changes strength on release.
  const opacity = element.opacity === undefined ? undefined : { opacity: element.opacity };
  return (
    <div data-highlight-root class={styles.root}>
      <div data-highlight-bands class={styles.layer} data-focused={isActive ? '' : undefined} style={opacity}>
        {sketchPath && boxPts ? (
          <svg data-highlight-sketch viewBox={`0 0 ${boxPts.width} ${boxPts.height}`} preserveAspectRatio="none" aria-hidden="true" class={styles.sketch}>
            <path d={sketchPath.d} fill={sketchPath.fill} />
          </svg>
        ) : element.bands.map((band, i) => (
          <div
            key={i}
            data-highlight-band
            data-highlight-underline={underline ? '' : undefined}
            class={underline ? `${styles.band} ${styles.underline}` : styles.band}
            style={{
              left: `${band.left}%`, top: `${band.top}%`, width: `${band.width}%`, height: `${band.height}%`,
              ...(underline ? { '--highlight-ink': ink, '--highlight-ink-width': `${element.strokeWidth ?? UNDERLINE_WIDTH.default}px`, '--highlight-ink-lift': `${UNDERLINE_LIFT}px` } : { background: element.color }),
            }}
          />
        ))}
      </div>
      <div data-highlight-draft class={styles.layer} style={opacity} />
    </div>
  );
}
