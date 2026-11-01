import { useEffect } from 'preact/hooks';
import { keyAction } from '../lib/marker/keys.ts';

/** Keys: mod+Z undoes, shift+mod+Z and ctrl+Y redo. Typing in a field keeps its own undo. */
export function useHistoryKeys({ enabled, undo, redo }: { enabled: boolean; undo(): void; redo(): void }) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      const action = keyAction(e, { typing, layers: [] });
      if (action?.type === 'undo') { e.preventDefault(); undo(); }
      else if (action?.type === 'redo') { e.preventDefault(); redo(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, undo, redo]);
}
