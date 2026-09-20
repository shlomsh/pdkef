import { useEffect } from 'preact/hooks';

// Global undo/redo shortcuts over the shared action-history model
// (src/editor/model/actionHistory.ts, src/editor/model/historyStack.ts):
// Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z and Ctrl+Y redo. Ignored while typing
// in an input/textarea so native text-field undo isn't hijacked - Sign's
// text elements are real <textarea>s and their own undo must stay untouched.
// Shared by Sign, Redact and Edit-Pages, so this lives in src/lib/ rather
// than src/editor-ui/ (documented as Sign/Redact-only): Edit-Pages is not an
// editor tool, and any tool may import src/lib/ per docs/module-boundaries.md.
//
// onRedo is optional: a caller with no redo wired yet (or a tool with no redo
// concept at all) can pass undefined and Shift+Cmd/Ctrl+Z and Ctrl+Y simply
// do nothing there.
export function useHistoryShortcuts(onUndo, onRedo) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      const isUndoKey = key === 'z' && !e.shiftKey;
      const isRedoKey = (key === 'z' && e.shiftKey) || key === 'y';
      if (!isUndoKey && !isRedoKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (isUndoKey) {
        onUndo();
      } else {
        onRedo?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onUndo, onRedo]);
}
