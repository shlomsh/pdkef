import styles from './PdfRedactTool.module.css';

/**
 * Marks one PDF object (an image placement or a text run) queued for removal.
 *
 * Unlike RedactBox, this has no drag, resize, or color: the geometry is the
 * object's own bounding box, not a shape the user drew, and deletion has
 * nothing to configure. The only affordance is undoing the mark.
 */
export default function DeleteMark({ el, onDelete }) {
  const label =
    el.kind === 'image'
      ? 'Image queued for deletion'
      : el.preview?.trim()
        ? `Text queued for deletion: "${el.preview.trim()}"`
        : 'Text queued for deletion';

  return (
    <div
      className={styles['delete-mark']}
      title={label}
      style={{
        position: 'absolute',
        left: `${el.left}%`,
        top: `${el.top}%`,
        width: `${el.width}%`,
        height: `${el.height}%`,
        zIndex: 10,
      }}
    >
      <button
        type="button"
        className={styles['delete-mark-btn']}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(el.id);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        title="Keep this instead"
        aria-label={`Undo: keep ${el.kind === 'image' ? 'this image' : 'this text'}`}
      >
        ✕
      </button>
    </div>
  );
}
