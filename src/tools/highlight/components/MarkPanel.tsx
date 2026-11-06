import { CommentIcon, TrashIcon } from '#editor-ui/toolIcons.tsx';
import { TOP_COLORS, type Marker } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import LookMenu from './LookMenu.tsx';
import MoreColors, { ColorCells } from './MoreColors.tsx';
import styles from './MarkPanel.module.css';

/** The menu the panel has open, if any. */
export type PanelMenu = 'more' | 'look' | null;

interface MarkPanelProps {
  look: Marker;
  /** Every change to the mark's look. */
  onChange(change: Partial<Marker>): void;
  onComment(): void;
  onDelete(): void;
  /** The open menu belongs to the host, so its Escape can close a menu before the panel. */
  menu: PanelMenu;
  onMenuChange(menu: PanelMenu): void;
  /** Where the menus open: away from the mark. */
  menuSide?: 'top' | 'bottom';
}

/**
 * The one panel a picked highlight opens, as one light row: Comment, the three top colors and More in one track, Look (kind, stroke and
 * strength in one menu), then Delete at the end. Comment leads because a highlight's next step is usually a thought about it.
 */
export default function MarkPanel({ look, onChange, onComment, onDelete, menu, onMenuChange, menuSide = 'bottom' }: MarkPanelProps) {
  return (
    <div class={styles.bar} data-marker-row>
      <button type="button" class={`${styles.act} ${styles.comment}`} aria-label={t.markComment} aria-keyshortcuts="C" title={t.markComment} onClick={onComment}>
        <CommentIcon size={18} />
        <span>{t.markComment}</span>
      </button>
      <span class={styles.divider} />
      <span class={styles.track} data-color-track>
        <ColorCells colors={TOP_COLORS} label={t.markColor} color={look.color} onChange={(color) => onChange({ color })} />
        <MoreColors
          color={look.color} open={menu === 'more'} placement={menuSide}
          onOpenChange={(open) => onMenuChange(open ? 'more' : null)} onPick={(color) => onChange({ color })}
        />
      </span>
      <span class={styles.divider} />
      <LookMenu look={look} onChange={onChange} open={menu === 'look'} onOpenChange={(open) => onMenuChange(open ? 'look' : null)} placement={menuSide} />
      <button type="button" class={`${styles.act} ${styles.danger}`} aria-label={t.markDelete} aria-keyshortcuts="Delete" title={t.markDelete} onClick={onDelete}>
        <TrashIcon />
      </button>
    </div>
  );
}
