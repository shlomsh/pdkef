import { useEffect } from 'preact/hooks';
import { keyAction } from '../lib/marker/keys.ts';
import { opensLamp } from '../lib/zoom/lamp.ts';

/** Keys: mod+= / + / - / 0 zoom, handed to `step` and `actual`; in the normal view they open the lamp instead. */
export function useZoomKeys({ enabled, inLamp, onEnterLamp, step, actual }: {
  enabled: boolean; inLamp: boolean; onEnterLamp(): void; step(dir: 1 | -1): void; actual(): void;
}) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      const action = keyAction(e, { typing, layers: [] });
      if (!opensLamp({ type: 'key', action })) return;
      e.preventDefault();
      if (!inLamp) onEnterLamp();
      else if (action?.type === 'zoom') step(action.dir);
      else actual();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, inLamp, onEnterLamp, step, actual]);
}
