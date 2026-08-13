import styles from './PdfRedactTool.module.css';

/**
 * Hover targets for the Delete tool: one invisible-until-hovered region per
 * object the PDF actually stores as a single piece (an image placement, or
 * whatever span of text the producing tool wrote in one `BT`/`ET` run).
 *
 * Only unmarked objects render here - once something is queued for deletion,
 * `DeleteMark` takes over that spot and shows the outline plus an undo
 * control, so the two never overlap.
 */
export default function DeletableObjectOverlay({ objects, markedIds, onSelect }) {
  return objects
    .filter((object) => !markedIds.has(object.id))
    .map((object) => (
      <div
        key={object.id}
        className={styles['delete-candidate']}
        title={
          object.kind === 'image'
            ? 'Click to delete this image'
            : object.preview?.trim()
              ? `Click to delete: "${object.preview.trim()}"`
              : 'Click to delete this text'
        }
        style={{
          position: 'absolute',
          left: `${object.rect.left}%`,
          top: `${object.rect.top}%`,
          width: `${object.rect.width}%`,
          height: `${object.rect.height}%`,
          zIndex: 12,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(object);
        }}
      />
    ));
}
