import { CommentIcon, TrashIcon } from '#editor-ui/toolIcons.tsx';
import { TOP_COLORS, type Marker } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import { StyleSetting, StyleToggle } from './LookControls.tsx';
import MoreColors, { ColorCells } from './MoreColors.tsx';
import styles from './MarkPanel.module.css';

interface MarkPanelProps {
  look: Marker;
  /** Every change to the mark's look. */
  onChange(change: Partial<Marker>): void;
  onComment(): void;
  onDelete(): void;
  /** More's open state belongs to the host, so its Escape can close More before the panel. */
  moreOpen: boolean;
  onMoreOpenChange(open: boolean): void;
}

/**
 * The one panel a picked highlight opens, as one light row: the three top colors and More in one framed track, the Highlight | Underline
 * switch with its setting button, then Comment and Delete. Where the row does not fit, Comment and Delete wrap to a second line.
 */
export default function MarkPanel({ look, onChange, onComment, onDelete, moreOpen, onMoreOpenChange }: MarkPanelProps) {
  return (
    <div class={styles.bar} data-marker-row>
      <span class={styles.track} data-color-track>
        <ColorCells colors={TOP_COLORS} label={t.markColor} color={look.color} onChange={(color) => onChange({ color })} />
        <MoreColors color={look.color} open={moreOpen} onOpenChange={onMoreOpenChange} onPick={(color) => onChange({ color })} />
      </span>
      <StyleToggle look={look} onChange={onChange} />
      <StyleSetting look={look} onChange={onChange} />
      <span class={styles.acts}>
        <span class={styles.divider} />
        <button type="button" class={styles.act} aria-label={t.markComment} aria-keyshortcuts="C" title={t.markComment} onClick={onComment}>
          <CommentIcon size={18} />
        </button>
        <button type="button" class={`${styles.act} ${styles.danger}`} aria-label={t.markDelete} aria-keyshortcuts="Delete" title={t.markDelete} onClick={onDelete}>
          <TrashIcon />
        </button>
      </span>
    </div>
  );
}
