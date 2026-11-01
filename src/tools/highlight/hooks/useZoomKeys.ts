import { useEffect } from 'preact/hooks';
import { isTypingTarget } from '#lib/dom/isTypingTarget.ts';
import { keyAction } from '../lib/marker/keys.ts';
import { isZoomInput } from '../lib/zoom/lamp.ts';

/** Keys: mod+= / + / - / 0 zoom, handed to `step` and `actual` in the lamp; the normal view leaves them to the browser. */
export function useZoomKeys({ enabled, inLamp, step, actual }: {
  enabled: boolean; inLamp: boolean; step(dir: 1 | -1): void; actual(): void;
}) {
  useEffect(() => {
    if (!enabled || !inLamp) return;
    const onKey = (e: KeyboardEvent) => {
      const action = keyAction(e, { typing: isTypingTarget(e.target), layers: [] });
      if (!isZoomInput({ type: 'key', action })) return;
      e.preventDefault();
      if (action?.type === 'zoom') step(action.dir);
      else actual();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, inLamp, step, actual]);
}
