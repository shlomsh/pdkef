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
        {/* Same rotate-back glyph as the toolbar's own Undo button - this badge
            reverts the mark, it doesn't delete anything itself, so an undo arrow
            reads more precisely than a generic ✕ or a trash icon would. */}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7v6h6" />
          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
        </svg>
      </button>
    </div>
  );
}
