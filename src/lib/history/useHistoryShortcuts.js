import { useEffect, useRef } from 'preact/hooks';

// Global undo/redo shortcuts over the shared action-history model
// (src/editor/model/actionHistory.ts, src/editor/model/historyStack.ts):
// Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z and Ctrl+Y (not Cmd+Y) redo. Ignored while typing
// in an input/textarea so native text-field undo isn't hijacked - Sign's
// text elements are real <textarea>s and their own undo must stay untouched.
// Shared by Sign, Redact and Edit-Pages, so this lives in src/lib/ rather
// than src/editor-ui/ (documented as Sign/Redact-only): Edit-Pages is not an
// editor tool, and any tool may import src/lib/ per docs/module-boundaries.md.
//
// onRedo is optional: a caller with no redo wired yet (or a tool with no redo
// concept at all) can pass undefined and Shift+Cmd/Ctrl+Z and Ctrl+Y simply
// do nothing there.
//
// The listener subscribes once and reads the handlers from a ref written
// during render. Re-subscribing per render left a gap: effects run after
// paint, so a Redo pressed right after an Undo reached the previous render's
// handler, whose redo stack was still empty, and was silently dropped.
export function useHistoryShortcuts(onUndo, onRedo) {
  const handlers = useRef({ onUndo, onRedo });
  handlers.current = { onUndo, onRedo };
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      // Alt is never part of either chord, and claiming Ctrl+Alt+Z would take
      // a key combination that belongs to the platform, not to us.
      if (e.altKey) return;
      const key = e.key.toLowerCase();
      const isUndoKey = key === 'z' && !e.shiftKey;
      // Ctrl+Y is the Windows and Linux redo. Cmd+Y deliberately is not: on
      // macOS it belongs to the browser (History in Safari, Library in
      // Firefox), and since this handler calls preventDefault the moment a
      // chord matches, claiming it would silently swallow those.
      const isRedoKey = (key === 'z' && e.shiftKey) || (key === 'y' && e.ctrlKey && !e.metaKey);
      if (!isUndoKey && !isRedoKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      // Only once we know we are going to act on it. A redo chord with no
      // handler wired should fall through to the browser rather than become a
      // key that does nothing anywhere.
      const handler = isUndoKey ? handlers.current.onUndo : handlers.current.onRedo;
      if (!handler) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
