import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';

/**
 * RED-53: listen for an input's real `change` event. preact/compat (loaded in
 * the Redact island) rewrites `onChange` on range and colour inputs to
 * `input`, which fires on every drag step, so `onChange` can never mean "the
 * slider was released" or "the picker closed". A listener on the element
 * itself sees the browser's own event. The latest callback is read through a
 * ref, so a re-render never re-attaches mid-drag; `deps` re-attach it when the
 * input element itself can change (e.g. it mounts conditionally).
 */
export function useNativeChange<T extends HTMLInputElement>(
  ref: RefObject<T>,
  onChange: (el: T) => void,
  deps: readonly unknown[] = [],
): void {
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const handle = () => latest.current(el);
    el.addEventListener('change', handle);
    return () => el.removeEventListener('change', handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
