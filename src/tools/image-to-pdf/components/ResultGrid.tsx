import type { Ref } from 'preact';
import OutputName from '#shell/OutputName.tsx';
import type { ImageToPdfMessages } from '../messages';
import layoutStyles from '#shell/loadedLayout.module.css';
import styles from '../PdfImageToPdfTool.module.css';
import AddImagesTile from './AddImagesTile.tsx';
import ImageTile from './ImageTile.tsx';

interface GridEntry {
  id: number;
  file: { name: string };
  thumbnail: string;
}

interface ResultGridProps {
  t: ImageToPdfMessages;
  entries: GridEntry[];
  outputName: string;
  listRef: Ref<HTMLUListElement>;
  onRename: (next: string) => void;
  onTileKeyDown: (event: KeyboardEvent, id: number) => void;
  onRemove: (id: number) => void;
}

export default function ResultGrid({ t, entries, outputName, listRef, onRename, onTileKeyDown, onRemove }: ResultGridProps) {
  return (
    <div class={`${styles.result} ${layoutStyles.stage}`}>
      <p class={styles.heading}>
        <OutputName name={outputName} label={t.fileNameLabel} onRename={onRename} />
        <span class={styles['heading-meta']}>· {entries.length} {entries.length === 1 ? t.pageCountOne : t.pageCountOther}</span>
      </p>
      <p class="sr-only" id="reorder-hint">
        {t.reorderHint}
      </p>
      <ul class={styles.grid} ref={listRef} aria-describedby="reorder-hint">
        {entries.map((entry, index) => (
          <ImageTile
            key={entry.id}
            id={entry.id}
            name={entry.file.name}
            thumbnail={entry.thumbnail}
            index={index}
            total={entries.length}
            t={t}
            onKeyDown={onTileKeyDown}
            onRemove={onRemove}
          />
        ))}
        <AddImagesTile label={t.addImages} />
      </ul>
    </div>
  );
}
