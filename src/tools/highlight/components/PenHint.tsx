import { markerBadge } from '../lib/marker/markerBadge.ts';
import type { Marker } from '../lib/marker/markerState.ts';
import PencilGlyph from './PencilGlyph.tsx';
import styles from './PenHint.module.css';

/** The hint beside the file name while the pen is armed on touch: the pen's current look (dot or underline glyph), then the words. */
export default function PenHint({ marker, text }: { marker: Marker; text: string }) {
  const badge = markerBadge(marker);
  return (
    <span class={styles.hint} data-pen-hint data-status-active>
      {badge.kind === 'dot' ? (
        <i class={styles.dot} data-marker-dot aria-hidden="true" style={{ background: badge.color, opacity: badge.opacity }} />
      ) : badge.kind === 'pencil' ? (
        <span class={styles.hatch} data-marker-pencil aria-hidden="true" style={{ color: badge.color, opacity: badge.opacity }}><PencilGlyph size={14} /></span>
      ) : (
        <i class={styles.glyph} data-marker-underline aria-hidden="true" style={{ background: badge.ink }} />
      )}
      <span>{text}</span>
    </span>
  );
}
