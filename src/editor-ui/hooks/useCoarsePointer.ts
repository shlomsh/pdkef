import { useEffect, useState } from 'preact/hooks';

const COARSE_POINTER_QUERY = '(pointer: coarse)';

/**
 * Whether the primary pointer is coarse - a finger rather than a mouse.
 *
 * This exists because one editor behaviour cannot be expressed in CSS: on touch
 * the field-navigation chevrons move off the sticky top card and onto the
 * selected element (MOBI-16). A CSS `display: none` would hide the top copy but
 * leave `EditorToolStatus` still reporting `data-status-active`, which hides the
 * filename on a phone - the JSX has to know, not just the stylesheet.
 *
 * `(pointer: coarse)` rather than a width breakpoint, deliberately. The bug it
 * answers is the iOS soft keyboard scrolling the *visual* viewport while the
 * sticky card stays pinned to the layout viewport; a phone held in landscape is
 * wider than any phone breakpoint and just as broken. Width is not the question
 * being asked.
 *
 * SSR-safe by defaulting to `false`, and that default is never visibly wrong:
 * every caller renders only once a document is open, which cannot happen during
 * prerender, so there is no hydration flash to mismatch.
 */
export default function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(COARSE_POINTER_QUERY);
    setCoarse(query.matches);
    const onChange = (event: MediaQueryListEvent) => setCoarse(event.matches);
    // Safari below 14 has no addEventListener on a MediaQueryList. The tool must
    // not fail to mount because a browser only has the deprecated listener API.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);

  return coarse;
}
