import { useEffect } from 'preact/hooks';
import { keyAction } from '../lib/marker/keys.ts';

/** Keys: mod+= / + / - / 0 zoom, handed to `step` and `actual`. */
export function useZoomKeys({ enabled, step, actual }: { enabled: boolean; step(dir: 1 | -1): void; actual(): void }) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      const action = keyAction(e, { typing, layers: [] });
      if (action?.type === 'zoom') { e.preventDefault(); step(action.dir); }
      else if (action?.type === 'zoomActual') { e.preventDefault(); actual(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, step, actual]);
}
