import type { RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { cordTuck, initialCordTuck, type CordTuckEvent } from '../lib/lampEntrance/cordTuck.ts';

/** Feeds the page's scroll to the pure cordTuck decision; re-renders only when `tucked` flips. A cord the lamp hides re-anchors untucked. */
export function useCordTuck(ref: RefObject<HTMLElement>) {
  const state = useRef(initialCordTuck(typeof window === 'undefined' ? 0 : window.scrollY));
  const [tucked, setTucked] = useState(false);
  const feed = useRef((event: CordTuckEvent) => {
    const before = state.current.tucked;
    state.current = cordTuck(state.current, event);
    if (state.current.tucked !== before) setTucked(state.current.tucked);
  }).current;
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = ref.current;
        feed({ type: el && !el.getClientRects().length ? 'hidden' : 'scroll', y: window.scrollY });
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [ref, feed]);
  return { tucked, pop: () => feed({ type: 'pop', y: window.scrollY }) };
}
