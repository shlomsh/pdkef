import { formatMessage } from '../../../lib/formatMessage';
import type { ImageToPdfMessages } from '../messages';
import styles from '../PdfImageToPdfTool.module.css';

interface ImageTileProps {
  id: number;
  name: string;
  thumbnail: string;
  index: number;
  total: number;
  t: ImageToPdfMessages;
  onKeyDown: (event: KeyboardEvent, id: number) => void;
  onRemove: (id: number) => void;
}

export default function ImageTile({ id, name, thumbnail, index, total, t, onKeyDown, onRemove }: ImageTileProps) {
  return (
    <li class={styles.tile} data-id={id}>
      <div
        class={styles.page}
        data-page
        tabIndex={0}
        role="button"
        aria-label={formatMessage(t.tileLabel, { name, position: index + 1, total })}
        onKeyDown={(e) => onKeyDown(e, id)}
      >
        <img src={thumbnail} alt="" draggable={false} />
        <span class={styles.badge} aria-hidden="true">{index + 1}</span>
      </div>
      <button
        type="button"
        class={styles.remove}
        aria-label={formatMessage(t.removeLabel, { name })}
        onClick={() => onRemove(id)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </button>
    </li>
  );
}
