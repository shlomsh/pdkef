import { useRef, useEffect } from 'preact/hooks';

// Shared "Undo changes" dialog for the Sign and Redact tools — lists logged
// actions (see actionHistory.js) as a checklist so several can be reverted at
// once, alongside the Cmd/Ctrl+Z single-step undo (useUndoShortcut.js).
//
// Self-manages its own dialog ref and showModal()/close() lifecycle (rather
// than the caller owning the ref) so it's a drop-in for either tool. Uses
// showModal() specifically — not the `open` attribute — because that promotes
// the dialog into the browser's top layer, which paints above a real
// Fullscreen API element; a plain `<dialog open>` renders in normal stacking
// and is invisible while the workspace is in true full screen.
export default function UndoHistoryModal({
  open,
  onClose,
  actionHistory,
  undoSelection,
  setUndoSelection,
  onRevertSelected
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="sig-dialog"
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-labelledby="undo-dialog-title"
    >
      <div className="sig-dialog-header">
        <h3 id="undo-dialog-title">Undo changes</h3>
        <button type="button" className="sig-dialog-close" onClick={onClose} aria-label="Close dialog">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <div className="sig-dialog-body sig-dialog-body--list">
        <div className="undo-history-list">
          {actionHistory.map((action) => {
            const time = new Date(action.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const isSelected = undoSelection.has(action.id);
            return (
              <label key={action.id} className="undo-history-item">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    const newSet = new Set(undoSelection);
                    if (e.target.checked) newSet.add(action.id);
                    else newSet.delete(action.id);
                    setUndoSelection(newSet);
                  }}
                />
                <div className="undo-history-details">
                  <span className="undo-history-desc">{action.description}</span>
                  <span className="undo-history-time">{time}</span>
                  <span className="undo-history-page">Page {action.pageIndex + 1}</span>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="sig-dialog-footer">
        <button
          type="button"
          className="sig-btn sig-btn-primary sig-btn-success"
          onClick={onRevertSelected}
          disabled={undoSelection.size === 0}
        >
          Revert selected
        </button>
      </div>
    </dialog>
  );
}
