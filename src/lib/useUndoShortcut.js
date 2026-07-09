import { useEffect } from 'preact/hooks';

// Global Cmd/Ctrl+Z to undo the most recently logged action. Ignored while
// typing in an input/textarea so native text-field undo isn't hijacked.
// Shared by the Sign and Redact tools — see actionHistory.js.
export function useUndoShortcut(onUndo) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      onUndo();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onUndo]);
}
